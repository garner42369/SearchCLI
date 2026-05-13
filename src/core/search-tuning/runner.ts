// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { loadJsonOrJsonl, loadSearchCases, writeJson, writeText } from '../files';
import { type LlmClientConfig } from '../llm-client';
import { VikingSearchClient } from '../search-client';
import type { RuntimeConfig } from '../types';
import { buildItemJudgeView, buildJudgeProfileHash, judgeRelevance } from './judge';
import { appendLabel, buildLabelCacheKey, loadLabelCache, type LabelCache } from './label-cache';
import { computeStrategyMetrics, chooseRecommendedStrategy } from './metrics';
import { generateTuningQueries, loadTuningQueries, searchCaseToTuningQuery } from './query-generator';
import { renderTuningMarkdownReport } from './report';
import { generateSimilarityOnlyStrategies, summarizeStrategyCoverage } from './strategy-generator';
import { sha256Hex, stableStringify } from './hash';
import type {
  JudgeLabel,
  TuningPerformanceSummary,
  TuningQuery,
  TuningRunReportShape,
  TuningRunStateShape,
  TuningSearchRanking,
  TuningStrategy,
  TuningStrategyCoverage
} from './types';
import type { TuningContext } from './inspect';

export interface TuningProgressEvent {
  phase: 'start' | 'strategy' | 'query' | 'label' | 'metrics' | 'write' | 'done';
  message: string;
  completed?: number;
  total?: number;
  strategyId?: string;
  queryId?: string;
}

export interface RunSearchTuningOptions {
  runtimeConfig: RuntimeConfig;
  context: TuningContext;
  llmConfig: LlmClientConfig;
  queriesFile?: string;
  queryCount: number;
  topK: number;
  maxStrategies: number;
  searchConcurrency: number;
  llmConcurrency: number;
  outputDir?: string;
  resumeRunId?: string;
  onProgress?: (event: TuningProgressEvent) => void;
}

export async function runSearchTuning(options: RunSearchTuningOptions): Promise<TuningRunReportShape> {
  const startedAt = new Date().toISOString();
  const startedAtMs = Date.now();
  const rootDir = path.resolve(options.outputDir ?? '.viking/search-tuning');
  const generatedAt = new Date().toISOString();
  const runId = options.resumeRunId ?? `run_${generatedAt.replaceAll(':', '-').replace(/\.\d+Z$/, 'Z')}`;
  const runDir = path.join(rootDir, 'runs', runId);
  const artifacts = buildRunArtifacts(runDir);
  const cachePath = path.join(rootDir, 'cache', 'labels.jsonl');
  const client = new VikingSearchClient(options.runtimeConfig);
  const labelCache = await loadLabelCache(cachePath);
  const judgeProfileHash = buildJudgeProfileHash(options.llmConfig);
  const setup = options.resumeRunId
    ? await loadExistingRunSetup(artifacts)
    : await createNewRunSetup({ ...options, runId, generatedAt, artifacts });
  const { queries, strategies, querySource, strategyCoverage } = setup;
  const rankings = options.resumeRunId ? await loadExistingRankings(artifacts.rankings) : [];
  const labelsUsed = options.resumeRunId ? await loadExistingLabels(artifacts.labelsUsed) : new Map<string, JudgeLabel>();
  const completedRankingKeys = new Set(rankings.map(ranking => buildRankingKey(ranking.strategyId, ranking.queryId)));
  const totalSearches = strategies.length * queries.length;
  const totalPossibleLabels = totalSearches * options.topK;
  const searchConcurrency = Math.max(1, Math.floor(options.searchConcurrency));
  const llmConcurrency = Math.max(1, Math.floor(options.llmConcurrency));
  const setupMs = Date.now() - startedAtMs;
  let searchWallMs = 0;
  let llmWallMs = 0;
  let metricsMs = 0;
  let writeMs = 0;
  let searchLatencySumMs = 0;
  let searchRequestsCompletedForTiming = 0;
  let llmLatencySumMs = 0;
  let labelRequestsCompleted = 0;
  let labelCacheHits = 0;
  let labelCacheMisses = 0;
  let completedSearches = completedRankingKeys.size;
  let completedLabels = labelsUsed.size;
  const currentPerformance = (endedAt?: string): TuningPerformanceSummary =>
    buildPerformanceSummary({
      startedAt,
      endedAt,
      startedAtMs,
      setupMs,
      searchWallMs,
      llmWallMs,
      metricsMs,
      writeMs,
      searchRequestsCompleted: searchRequestsCompletedForTiming,
      searchLatencySumMs,
      labelRequestsCompleted,
      llmLatencySumMs,
      labelCacheHits,
      labelCacheMisses,
      searchConcurrency,
      llmConcurrency
    });

  options.onProgress?.({
    phase: 'start',
    message: `${options.resumeRunId ? 'Resuming' : 'Starting'} search tuning run ${runId} in ${runDir}: ${queries.length} queries, ${strategies.length} strategies, topK=${options.topK}, searchConcurrency=${searchConcurrency}, llmConcurrency=${llmConcurrency}, up to ${totalPossibleLabels} pointwise judgements.`,
    completed: completedSearches,
    total: totalSearches
  });

  await writeRunState(artifacts.runState, {
    runId,
    generatedAt: setup.generatedAt,
    updatedAt: new Date().toISOString(),
    status: 'running',
    applicationId: options.context.applicationId,
    datasetId: options.context.datasetId,
    sceneId: options.context.sceneId,
    profile: 'similarity-only',
    querySource,
    topK: options.topK,
    queryCount: queries.length,
    strategyCount: strategies.length,
    labelCount: labelsUsed.size,
    completedSearches,
    totalSearches,
    completedLabels,
    totalPossibleLabels,
    searchConcurrency,
    llmConcurrency,
    performance: currentPerformance(),
    artifacts
  });
  await writeJson(artifacts.performanceSummary, currentPerformance());

  try {
    const pendingSearches = buildPendingSearches(strategies, queries, completedRankingKeys);
    for (const batch of chunkArray(pendingSearches, searchConcurrency)) {
      const batchStartedAt = Date.now();
      const results = await Promise.allSettled(
        batch.map(async ({ strategy, query }) => {
          const queryHash = buildQueryHash(query);
          options.onProgress?.({
            phase: 'query',
            message: `Searching query ${query.id} with strategy ${strategy.id}.`,
            completed: completedSearches,
            total: totalSearches,
            strategyId: strategy.id,
            queryId: query.id
          });
          const startedAt = Date.now();
          const response = await client.search(
            {
              id: query.id,
              query: { text: query.text },
              dataset_id: options.context.datasetId,
              page_number: 1,
              page_size: options.topK,
              disable_personalize: strategy.requestParams.disable_personalize,
              query_keyword_match_percent: strategy.requestParams.query_keyword_match_percent
            },
            strategy.searchDynamic
          );
          return {
            strategyId: strategy.id,
            queryId: query.id,
            queryHash,
            queryText: query.text,
            latencyMs: Date.now() - startedAt,
            totalItems: response.totalItems,
            items: response.results.slice(0, options.topK)
          } satisfies TuningSearchRanking;
        })
      );
      const batchWallMs = Date.now() - batchStartedAt;
      searchWallMs += batchWallMs;
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      let batchCompletedSearches = 0;
      let batchLatencySumMs = 0;
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        rankings.push(result.value);
        completedRankingKeys.add(buildRankingKey(result.value.strategyId, result.value.queryId));
        completedSearches = completedRankingKeys.size;
        batchCompletedSearches += 1;
        batchLatencySumMs += result.value.latencyMs;
      }
      searchRequestsCompletedForTiming += batchCompletedSearches;
      searchLatencySumMs += batchLatencySumMs;
      options.onProgress?.({
        phase: 'query',
        message: `Search batch completed: ${batchCompletedSearches}/${batch.length} requests in ${formatDuration(batchWallMs)}; avg latency=${formatDuration(safeAverage(batchLatencySumMs, batchCompletedSearches))}; throughput=${formatRate(batchCompletedSearches, batchWallMs)} req/s.`,
        completed: completedSearches,
        total: totalSearches
      });
      await writeSearchCheckpoint({
        artifacts,
        strategies,
        rankings,
        labels: [...labelsUsed.values()],
        state: {
          runId,
          generatedAt: setup.generatedAt,
          applicationId: options.context.applicationId,
          datasetId: options.context.datasetId,
          sceneId: options.context.sceneId,
          querySource,
          topK: options.topK,
          queryCount: queries.length,
          strategyCount: strategies.length,
          labelCount: labelsUsed.size,
          completedSearches,
          totalSearches,
          completedLabels,
          totalPossibleLabels,
          searchConcurrency,
          llmConcurrency,
          performance: currentPerformance()
        }
      });
      if (failures.length > 0) {
        throw failures[0].reason;
      }
    }

    const labelPlan = buildPendingLabels({
      rankings,
      queries,
      datasetId: options.context.datasetId,
      judgeProfileHash,
      labelsUsed,
      cachedLabels: labelCache.labels
    });
    const pendingLabels = labelPlan.pendingLabels;
    labelCacheHits += labelPlan.cacheHits;
    labelCacheMisses += pendingLabels.length;
    completedLabels = labelsUsed.size;
    const labelProgressTotal = labelsUsed.size + pendingLabels.length;
    options.onProgress?.({
      phase: 'label',
      message: `LLM label plan: ${labelProgressTotal} unique labels (${labelCacheHits} cache hits, ${pendingLabels.length} misses) from up to ${totalPossibleLabels} pointwise judgements.`,
      completed: completedLabels,
      total: labelProgressTotal
    });
    const labelStartedAt = Date.now();
    const labelFailures = await runLabelWorkers({
      pendingLabels,
      llmConcurrency,
      judgeProfileHash,
      datasetId: options.context.datasetId,
      llmConfig: options.llmConfig,
      artifacts,
      strategies,
      rankings,
      labelsUsed,
      labelCache,
      state: {
        runId,
        generatedAt: setup.generatedAt,
        applicationId: options.context.applicationId,
        datasetId: options.context.datasetId,
        sceneId: options.context.sceneId,
        querySource,
        topK: options.topK,
        queryCount: queries.length,
        strategyCount: strategies.length,
        labelCount: labelsUsed.size,
        completedSearches,
        totalSearches,
        completedLabels,
        totalPossibleLabels,
        searchConcurrency,
        llmConcurrency,
        performance: currentPerformance()
      },
      progressTotal: labelProgressTotal,
      progress: options.onProgress,
      currentPerformance,
      onLabel: result => {
        completedLabels = labelsUsed.size;
        labelRequestsCompleted += 1;
        llmLatencySumMs += result.latencyMs;
      }
    });
    llmWallMs += Date.now() - labelStartedAt;
    await writeSearchCheckpoint({
      artifacts,
      strategies,
      rankings,
      labels: [...labelsUsed.values()],
      state: {
        runId,
        generatedAt: setup.generatedAt,
        applicationId: options.context.applicationId,
        datasetId: options.context.datasetId,
        sceneId: options.context.sceneId,
        querySource,
        topK: options.topK,
        queryCount: queries.length,
        strategyCount: strategies.length,
        labelCount: labelsUsed.size,
        completedSearches,
        totalSearches,
        completedLabels,
        totalPossibleLabels,
        searchConcurrency,
        llmConcurrency,
        performance: currentPerformance()
      }
    });
    if (labelFailures.length > 0) {
      throw new Error(
        `LLM relevance judging failed for ${labelFailures.length} label(s). First failure: ${formatErrorMessage(labelFailures[0]?.error)}. Completed ${completedLabels}/${labelProgressTotal} unique labels; resume this run with --resume-run-id ${runId}.`
      );
    }
  } catch (error) {
    const failedPerformance = currentPerformance(new Date().toISOString());
    await writeRunState(artifacts.runState, {
      runId,
      generatedAt: setup.generatedAt,
      updatedAt: new Date().toISOString(),
      status: 'failed',
      applicationId: options.context.applicationId,
      datasetId: options.context.datasetId,
      sceneId: options.context.sceneId,
      profile: 'similarity-only',
      querySource,
      topK: options.topK,
      queryCount: queries.length,
      strategyCount: strategies.length,
      labelCount: labelsUsed.size,
      completedSearches,
      totalSearches,
      completedLabels,
      totalPossibleLabels,
      searchConcurrency,
      llmConcurrency,
      performance: failedPerformance,
      error: error instanceof Error ? error.message : String(error),
      artifacts
    });
    await writeJson(artifacts.performanceSummary, failedPerformance);
    throw error;
  }

  options.onProgress?.({
    phase: 'metrics',
    message: 'Computing strategy metrics.',
    completed: completedSearches,
    total: totalSearches
  });
  const metricsStartedAt = Date.now();
  const labels = [...labelsUsed.values()];
  const metrics = strategies.map(strategy =>
    computeStrategyMetrics({
      strategyId: strategy.id,
      rankings: rankings.filter(ranking => ranking.strategyId === strategy.id),
      labels
    })
  );
  const recommendedStrategyId = chooseRecommendedStrategy(metrics);
  metricsMs += Date.now() - metricsStartedAt;
  const report: TuningRunReportShape = {
    runId,
    generatedAt,
    applicationId: options.context.applicationId,
    datasetId: options.context.datasetId,
    sceneId: options.context.sceneId,
    profile: 'similarity-only',
    querySource,
    topK: options.topK,
    queryCount: queries.length,
    strategyCount: strategies.length,
    labelCount: labels.length,
    recommendedStrategyId,
    strategyCoverage,
    strategies,
    metrics,
    performance: currentPerformance(),
    artifacts: {
      ...artifacts
    }
  };

  const recommendation = buildRecommendation(report);
  options.onProgress?.({
    phase: 'write',
    message: `Writing tuning artifacts to ${runDir}.`,
    completed: completedSearches,
    total: totalSearches
  });
  const writeStartedAt = Date.now();
  await writeText(report.artifacts.labelsUsed, toJsonl(labels));
  await writeText(report.artifacts.rankings, toJsonl(rankings));
  await writeJson(report.artifacts.metrics, metrics);
  await writeJson(report.artifacts.recommendation, recommendation);
  await writeJson(report.artifacts.recommendedSearchDynamic, recommendation.search_dynamic ?? {});
  await writeJson(report.artifacts.recommendedRequestParams, recommendation.request_params ?? {});
  writeMs += Date.now() - writeStartedAt;
  report.performance = currentPerformance(new Date().toISOString());
  await writeJson(report.artifacts.performanceSummary, report.performance);
  await writeJson(report.artifacts.reportJson, report);
  await writeText(report.artifacts.reportMarkdown, renderTuningMarkdownReport(report));
  await writeRunState(artifacts.runState, {
    runId,
    generatedAt: setup.generatedAt,
    updatedAt: new Date().toISOString(),
    status: 'completed',
    applicationId: options.context.applicationId,
    datasetId: options.context.datasetId,
    sceneId: options.context.sceneId,
    profile: 'similarity-only',
    querySource,
    topK: options.topK,
    queryCount: queries.length,
    strategyCount: strategies.length,
    labelCount: labels.length,
    completedSearches,
    totalSearches,
    completedLabels,
    totalPossibleLabels,
    searchConcurrency,
    llmConcurrency,
    performance: report.performance,
    recommendedStrategyId,
    artifacts
  });
  options.onProgress?.({
    phase: 'done',
    message: `Search tuning complete in ${formatDuration(report.performance.totalElapsedMs)}. Recommended strategy: ${recommendedStrategyId ?? '(none)'}. Search wall=${formatDuration(report.performance.searchWallMs)}, LLM wall=${formatDuration(report.performance.llmWallMs)}.`,
    completed: totalSearches,
    total: totalSearches
  });

  return report;
}

export async function loadTuningReport(rootDir: string | undefined, runId: string): Promise<TuningRunReportShape> {
  const reportPath = path.resolve(rootDir ?? '.viking/search-tuning', 'runs', runId, 'report.json');
  const raw = await import('node:fs/promises').then(fs => fs.readFile(reportPath, 'utf8'));
  return JSON.parse(raw) as TuningRunReportShape;
}

export async function loadTuningRunState(rootDir: string | undefined, runId: string): Promise<TuningRunStateShape> {
  const statePath = path.resolve(rootDir ?? '.viking/search-tuning', 'runs', runId, 'run-state.json');
  const raw = await readFile(statePath, 'utf8');
  return JSON.parse(raw) as TuningRunStateShape;
}

function buildRecommendation(report: TuningRunReportShape): Record<string, unknown> {
  const strategy = report.strategies.find(item => item.id === report.recommendedStrategyId);
  const metric = report.metrics.find(item => item.strategyId === report.recommendedStrategyId);
  return {
    run_id: report.runId,
    recommended_strategy_id: report.recommendedStrategyId,
    search_dynamic: strategy?.searchDynamic,
    request_params: strategy?.requestParams,
    metrics: metric
  };
}

async function resolveQueries(options: RunSearchTuningOptions): Promise<TuningQuery[]> {
  if (options.queriesFile) {
    if (/\.csv$/i.test(options.queriesFile)) {
      const cases = await loadSearchCases(options.queriesFile);
      return cases
        .map((searchCase, index) => searchCaseToTuningQuery(searchCase, index))
        .filter((query): query is TuningQuery => Boolean(query))
        .slice(0, options.queryCount);
    }
    return (await loadTuningQueries(options.queriesFile)).slice(0, options.queryCount);
  }
  return generateTuningQueries({
    llmConfig: options.llmConfig,
    sampleItems: options.context.sampleItems,
    count: options.queryCount
  });
}

interface TuningRunSetup {
  generatedAt: string;
  queries: TuningQuery[];
  strategies: TuningStrategy[];
  querySource: 'user-provided' | 'generated';
  strategyCoverage: TuningStrategyCoverage;
}

interface PendingSearch {
  strategy: TuningStrategy;
  query: TuningQuery;
}

interface PendingLabel {
  cacheKey: string;
  strategyId: string;
  queryId: string;
  query: TuningQuery;
  queryHash: string;
  itemId: string;
  itemView: ReturnType<typeof buildItemJudgeView>;
  itemViewHash: string;
}

interface PendingLabelBuildResult {
  pendingLabels: PendingLabel[];
  cacheHits: number;
}

interface CheckpointStateBase {
  runId: string;
  generatedAt: string;
  applicationId: string;
  datasetId: string;
  sceneId?: string;
  querySource: 'user-provided' | 'generated';
  topK: number;
  queryCount: number;
  strategyCount: number;
  labelCount: number;
  completedSearches: number;
  totalSearches: number;
  completedLabels: number;
  totalPossibleLabels: number;
  searchConcurrency: number;
  llmConcurrency: number;
  performance: TuningPerformanceSummary;
}

async function createNewRunSetup(
  options: RunSearchTuningOptions & {
    runId: string;
    generatedAt: string;
    artifacts: Record<string, string>;
  }
): Promise<TuningRunSetup> {
  const queries = await resolveQueries(options);
  const strategies = generateSimilarityOnlyStrategies(options.maxStrategies);
  const strategyCoverage = summarizeStrategyCoverage(strategies);
  const querySource = options.queriesFile ? 'user-provided' : 'generated';

  await writeJson(options.artifacts.context, options.context);
  await writeText(options.artifacts.queries, toJsonl(queries));
  await writeJson(options.artifacts.strategies, strategies);
  await writeJson(options.artifacts.strategyCoverage, strategyCoverage);
  await writeText(options.artifacts.rankings, '');
  await writeText(options.artifacts.labelsUsed, '');
  await writeJson(options.artifacts.partialMetrics, []);

  return {
    generatedAt: options.generatedAt,
    queries,
    strategies,
    querySource,
    strategyCoverage
  };
}

async function loadExistingRunSetup(artifacts: Record<string, string>): Promise<TuningRunSetup> {
  const state = await loadJsonFile<TuningRunStateShape>(artifacts.runState);
  const queries = await loadTuningQueries(artifacts.queries);
  const strategies = await loadJsonFile<TuningStrategy[]>(artifacts.strategies);
  const strategyCoverage = await loadJsonFile<TuningStrategyCoverage>(artifacts.strategyCoverage);
  return {
    generatedAt: state.generatedAt,
    queries,
    strategies,
    querySource: state.querySource,
    strategyCoverage
  };
}

async function loadExistingRankings(filePath: string): Promise<TuningSearchRanking[]> {
  if (!(await pathExists(filePath))) return [];
  return loadJsonOrJsonl<TuningSearchRanking>(filePath);
}

async function loadExistingLabels(filePath: string): Promise<Map<string, JudgeLabel>> {
  const labels = (await pathExists(filePath)) ? await loadJsonOrJsonl<JudgeLabel>(filePath) : [];
  return new Map(labels.map(label => [label.cache_key, label]));
}

function buildPendingSearches(
  strategies: TuningStrategy[],
  queries: TuningQuery[],
  completedRankingKeys: Set<string>
): PendingSearch[] {
  const pending: PendingSearch[] = [];
  for (const strategy of strategies) {
    for (const query of queries) {
      if (!completedRankingKeys.has(buildRankingKey(strategy.id, query.id))) {
        pending.push({ strategy, query });
      }
    }
  }
  return pending;
}

function buildPendingLabels(input: {
  rankings: TuningSearchRanking[];
  queries: TuningQuery[];
  datasetId: string;
  judgeProfileHash: string;
  labelsUsed: Map<string, JudgeLabel>;
  cachedLabels: Map<string, JudgeLabel>;
}): PendingLabelBuildResult {
  const queryById = new Map(input.queries.map(query => [query.id, query]));
  const pendingByCacheKey = new Map<string, PendingLabel>();
  const cacheHitKeys = new Set<string>();
  for (const ranking of input.rankings) {
    const query = queryById.get(ranking.queryId);
    if (!query) continue;
    for (const item of ranking.items) {
      const itemView = buildItemJudgeView(item);
      const itemViewHash = sha256Hex(itemView);
      const cacheKey = buildLabelCacheKey({
        datasetId: input.datasetId,
        queryHash: ranking.queryHash,
        itemId: item.id,
        itemViewHash,
        judgeProfileHash: input.judgeProfileHash
      });
      const existingLabel = input.labelsUsed.get(cacheKey) ?? input.cachedLabels.get(cacheKey);
      if (existingLabel) {
        input.labelsUsed.set(existingLabel.cache_key, existingLabel);
        cacheHitKeys.add(existingLabel.cache_key);
        continue;
      }
      if (!pendingByCacheKey.has(cacheKey)) {
        pendingByCacheKey.set(cacheKey, {
          cacheKey,
          strategyId: ranking.strategyId,
          queryId: ranking.queryId,
          query,
          queryHash: ranking.queryHash,
          itemId: item.id,
          itemView,
          itemViewHash
        });
      }
    }
  }
  return {
    pendingLabels: [...pendingByCacheKey.values()],
    cacheHits: cacheHitKeys.size
  };
}

async function writeSearchCheckpoint(input: {
  artifacts: Record<string, string>;
  strategies: TuningStrategy[];
  rankings: TuningSearchRanking[];
  labels: JudgeLabel[];
  state: CheckpointStateBase;
}): Promise<void> {
  await writeText(input.artifacts.rankings, toJsonl(input.rankings));
  await writeText(input.artifacts.labelsUsed, toJsonl(input.labels));
  await writeJson(input.artifacts.partialMetrics, buildPartialMetrics(input.strategies, input.rankings, input.labels));
  await writeRunState(input.artifacts.runState, {
    runId: input.state.runId,
    generatedAt: input.state.generatedAt,
    updatedAt: new Date().toISOString(),
    status: 'running',
    applicationId: input.state.applicationId,
    datasetId: input.state.datasetId,
    sceneId: input.state.sceneId,
    profile: 'similarity-only',
    querySource: input.state.querySource,
    topK: input.state.topK,
    queryCount: input.state.queryCount,
    strategyCount: input.state.strategyCount,
    labelCount: input.state.labelCount,
    completedSearches: input.state.completedSearches,
    totalSearches: input.state.totalSearches,
    completedLabels: input.state.completedLabels,
    totalPossibleLabels: input.state.totalPossibleLabels,
    searchConcurrency: input.state.searchConcurrency,
    llmConcurrency: input.state.llmConcurrency,
    performance: input.state.performance,
    artifacts: input.artifacts
  });
  await writeJson(input.artifacts.performanceSummary, input.state.performance);
}

function chunkArray<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function buildRunArtifacts(runDir: string): Record<string, string> {
  return {
    runState: path.join(runDir, 'run-state.json'),
    context: path.join(runDir, 'context.json'),
    queries: path.join(runDir, 'queries.jsonl'),
    strategies: path.join(runDir, 'strategies.json'),
    strategyCoverage: path.join(runDir, 'strategy-coverage.json'),
    labelsUsed: path.join(runDir, 'labels-used.jsonl'),
    rankings: path.join(runDir, 'rankings.jsonl'),
    partialMetrics: path.join(runDir, 'partial-metrics.json'),
    performanceSummary: path.join(runDir, 'performance-summary.json'),
    metrics: path.join(runDir, 'metrics.json'),
    recommendation: path.join(runDir, 'recommendation.json'),
    recommendedSearchDynamic: path.join(runDir, 'recommended-search-dynamic.json'),
    recommendedRequestParams: path.join(runDir, 'recommended-request-params.json'),
    reportJson: path.join(runDir, 'report.json'),
    reportMarkdown: path.join(runDir, 'report.md')
  };
}

function buildPartialMetrics(strategies: TuningStrategy[], rankings: TuningSearchRanking[], labels: JudgeLabel[]) {
  const metrics = strategies.map(strategy =>
    computeStrategyMetrics({
      strategyId: strategy.id,
      rankings: rankings.filter(ranking => ranking.strategyId === strategy.id),
      labels
    })
  );
  return {
    generatedAt: new Date().toISOString(),
    completedSearches: rankings.length,
    recommendedStrategyId: chooseRecommendedStrategy(metrics),
    metrics
  };
}

interface LabelWorkerFailure {
  pending: PendingLabel;
  error: unknown;
}

async function runLabelWorkers(input: {
  pendingLabels: PendingLabel[];
  llmConcurrency: number;
  judgeProfileHash: string;
  datasetId: string;
  llmConfig: LlmClientConfig;
  artifacts: Record<string, string>;
  strategies: TuningStrategy[];
  rankings: TuningSearchRanking[];
  labelsUsed: Map<string, JudgeLabel>;
  labelCache: LabelCache;
  state: CheckpointStateBase;
  progressTotal: number;
  progress?: (event: TuningProgressEvent) => void;
  currentPerformance: () => TuningPerformanceSummary;
  onLabel: (result: { latencyMs: number }) => void;
}): Promise<LabelWorkerFailure[]> {
  const failures: LabelWorkerFailure[] = [];
  if (input.pendingLabels.length === 0) return failures;

  let nextIndex = 0;
  let completedMisses = 0;
  let latencySumMs = 0;
  let labelsSinceCheckpoint = 0;
  let lastCheckpointAt = Date.now();
  let writeQueue: Promise<void> = Promise.resolve();
  let checkpointQueue: Promise<void> = Promise.resolve();
  const phaseStartedAt = Date.now();
  const workerCount = Math.min(input.llmConcurrency, input.pendingLabels.length);

  const checkpoint = async (force = false): Promise<void> => {
    if (!force && labelsSinceCheckpoint < 100 && Date.now() - lastCheckpointAt < 15000) return;
    labelsSinceCheckpoint = 0;
    lastCheckpointAt = Date.now();
    const labelsSnapshot = [...input.labelsUsed.values()];
    const completedLabelsSnapshot = input.labelsUsed.size;
    checkpointQueue = checkpointQueue.then(() =>
      writeSearchCheckpoint({
        artifacts: input.artifacts,
        strategies: input.strategies,
        rankings: input.rankings,
        labels: labelsSnapshot,
        state: {
          ...input.state,
          labelCount: completedLabelsSnapshot,
          completedLabels: completedLabelsSnapshot,
          performance: input.currentPerformance()
        }
      })
    );
    await checkpointQueue;
  };

  const recordLabel = async (
    pending: PendingLabel,
    result: { label: JudgeLabel; latencyMs: number }
  ): Promise<void> => {
    writeQueue = writeQueue.then(() => appendLabel(input.labelCache, result.label));
    await writeQueue;
    input.labelsUsed.set(result.label.cache_key, result.label);
    completedMisses += 1;
    labelsSinceCheckpoint += 1;
    latencySumMs += result.latencyMs;
    input.onLabel({ latencyMs: result.latencyMs });
    const completedLabels = input.labelsUsed.size;
    input.progress?.({
      phase: 'label',
      message: `Label available for query ${pending.queryId}, item ${pending.itemId}.`,
      completed: completedLabels,
      total: input.progressTotal,
      strategyId: pending.strategyId,
      queryId: pending.queryId
    });
    if (completedMisses % 100 === 0 || completedMisses === input.pendingLabels.length) {
      const wallMs = Date.now() - phaseStartedAt;
      input.progress?.({
        phase: 'label',
        message: `LLM labels completed: ${completedLabels}/${input.progressTotal} unique labels in ${formatDuration(wallMs)}; avg latency=${formatDuration(safeAverage(latencySumMs, completedMisses))}; throughput=${formatRate(completedMisses, wallMs)} labels/s.`,
        completed: completedLabels,
        total: input.progressTotal
      });
    }
    await checkpoint();
  };

  const runOne = async (pending: PendingLabel): Promise<void> => {
    try {
      const result = await judgeTimedRelevance({
        llmConfig: input.llmConfig,
        datasetId: input.datasetId,
        query: pending.query,
        queryHash: pending.queryHash,
        itemView: pending.itemView,
        itemViewHash: pending.itemViewHash,
        judgeProfileHash: input.judgeProfileHash,
        cacheKey: pending.cacheKey
      });
      await recordLabel(pending, result);
    } catch (error) {
      failures.push({ pending, error });
      input.progress?.({
        phase: 'label',
        message: `LLM label failed for query ${pending.queryId}, item ${pending.itemId}: ${formatErrorMessage(error)}`,
        completed: input.labelsUsed.size,
        total: input.progressTotal,
        strategyId: pending.strategyId,
        queryId: pending.queryId
      });
    }
  };

  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < input.pendingLabels.length) {
      const pending = input.pendingLabels[nextIndex];
      nextIndex += 1;
      await runOne(pending);
    }
  });

  await Promise.all(workers);
  await writeQueue;
  await checkpoint(true);
  await checkpointQueue;
  return failures;
}

async function writeRunState(filePath: string, state: TuningRunStateShape): Promise<void> {
  await writeJson(filePath, state);
}

async function judgeTimedRelevance(
  input: Parameters<typeof judgeRelevance>[0]
): Promise<{ label: JudgeLabel; latencyMs: number }> {
  const startedAt = Date.now();
  const label = await judgeRelevance(input);
  return {
    label,
    latencyMs: Date.now() - startedAt
  };
}

function buildPerformanceSummary(input: {
  startedAt: string;
  endedAt?: string;
  startedAtMs: number;
  setupMs: number;
  searchWallMs: number;
  llmWallMs: number;
  metricsMs: number;
  writeMs: number;
  searchRequestsCompleted: number;
  searchLatencySumMs: number;
  labelRequestsCompleted: number;
  llmLatencySumMs: number;
  labelCacheHits: number;
  labelCacheMisses: number;
  searchConcurrency: number;
  llmConcurrency: number;
}): TuningPerformanceSummary {
  return {
    startedAt: input.startedAt,
    ...(input.endedAt ? { endedAt: input.endedAt } : {}),
    totalElapsedMs: Date.now() - input.startedAtMs,
    setupMs: input.setupMs,
    searchWallMs: input.searchWallMs,
    llmWallMs: input.llmWallMs,
    metricsMs: input.metricsMs,
    writeMs: input.writeMs,
    searchRequestsCompleted: input.searchRequestsCompleted,
    labelRequestsCompleted: input.labelRequestsCompleted,
    labelCacheHits: input.labelCacheHits,
    labelCacheMisses: input.labelCacheMisses,
    averageSearchLatencyMs: safeAverage(input.searchLatencySumMs, input.searchRequestsCompleted),
    averageLlmLatencyMs: safeAverage(input.llmLatencySumMs, input.labelRequestsCompleted),
    searchRequestsPerSecond: safeRate(input.searchRequestsCompleted, input.searchWallMs),
    llmRequestsPerSecond: safeRate(input.labelRequestsCompleted, input.llmWallMs),
    searchConcurrency: input.searchConcurrency,
    llmConcurrency: input.llmConcurrency
  };
}

function safeAverage(total: number, count: number): number {
  return count > 0 ? total / count : 0;
}

function safeRate(count: number, durationMs: number): number {
  return durationMs > 0 ? count / (durationMs / 1000) : 0;
}

function formatDuration(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) return '0ms';
  if (durationMs < 1000) return `${Math.round(durationMs)}ms`;
  return `${(durationMs / 1000).toFixed(2)}s`;
}

function formatRate(count: number, durationMs: number): string {
  return safeRate(count, durationMs).toFixed(2);
}

async function loadJsonFile<T>(filePath: string): Promise<T> {
  const raw = await readFile(filePath, 'utf8');
  return JSON.parse(raw) as T;
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function buildRankingKey(strategyId: string, queryId: string): string {
  return `${strategyId}\u0000${queryId}`;
}

function buildQueryHash(query: TuningQuery): string {
  return sha256Hex({
    text: query.text.trim().toLowerCase(),
    intent: query.intent
  });
}

function toJsonl(values: unknown[]): string {
  return `${values.map(value => stableStringify(value)).join('\n')}\n`;
}

function formatErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.split('\n')[0] ?? error.message;
  return String(error);
}
