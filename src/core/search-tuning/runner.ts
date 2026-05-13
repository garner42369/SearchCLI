// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import { access, readFile } from 'node:fs/promises';
import { loadJsonOrJsonl, loadSearchCases, writeJson, writeText } from '../files';
import { type LlmClientConfig } from '../llm-client';
import { VikingSearchClient } from '../search-client';
import type { RuntimeConfig } from '../types';
import { buildItemJudgeView, buildJudgeProfileHash, judgeRelevance } from './judge';
import { appendLabel, buildLabelCacheKey, loadLabelCache } from './label-cache';
import { computeStrategyMetrics, chooseRecommendedStrategy } from './metrics';
import { generateTuningQueries, loadTuningQueries, searchCaseToTuningQuery } from './query-generator';
import { renderTuningMarkdownReport } from './report';
import { generateSimilarityOnlyStrategies, summarizeStrategyCoverage } from './strategy-generator';
import { sha256Hex, stableStringify } from './hash';
import type { JudgeLabel, TuningQuery, TuningRunReportShape, TuningRunStateShape, TuningSearchRanking, TuningStrategy, TuningStrategyCoverage } from './types';
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
  outputDir?: string;
  resumeRunId?: string;
  onProgress?: (event: TuningProgressEvent) => void;
}

export async function runSearchTuning(options: RunSearchTuningOptions): Promise<TuningRunReportShape> {
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
  let completedSearches = completedRankingKeys.size;
  let completedLabels = labelsUsed.size;

  options.onProgress?.({
    phase: 'start',
    message: `${options.resumeRunId ? 'Resuming' : 'Starting'} search tuning run ${runId} in ${runDir}: ${queries.length} queries, ${strategies.length} strategies, topK=${options.topK}, searchConcurrency=${searchConcurrency}, up to ${totalPossibleLabels} pointwise judgements.`,
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
    artifacts
  });

  try {
    const pendingSearches = buildPendingSearches(strategies, queries, completedRankingKeys);
    for (const batch of chunkArray(pendingSearches, searchConcurrency)) {
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
      const failures = results.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
      for (const result of results) {
        if (result.status !== 'fulfilled') continue;
        rankings.push(result.value);
        completedRankingKeys.add(buildRankingKey(result.value.strategyId, result.value.queryId));
        completedSearches = completedRankingKeys.size;
      }
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
          searchConcurrency
        }
      });
      if (failures.length > 0) {
        throw failures[0].reason;
      }
    }

    for (const ranking of rankings) {
      const query = queries.find(item => item.id === ranking.queryId);
      if (!query) continue;
      for (const item of ranking.items) {
        const itemView = buildItemJudgeView(item);
        const itemViewHash = sha256Hex(itemView);
        const cacheKey = buildLabelCacheKey({
          datasetId: options.context.datasetId,
          queryHash: ranking.queryHash,
          itemId: item.id,
          itemViewHash,
          judgeProfileHash
        });
        let label = labelsUsed.get(cacheKey) ?? labelCache.labels.get(cacheKey);
        if (!label) {
          label = await judgeRelevance({
            llmConfig: options.llmConfig,
            datasetId: options.context.datasetId,
            query,
            queryHash: ranking.queryHash,
            itemView,
            itemViewHash,
            judgeProfileHash,
            cacheKey
          });
          await appendLabel(labelCache, label);
        }
        labelsUsed.set(label.cache_key, label);
        completedLabels = labelsUsed.size;
        options.onProgress?.({
          phase: 'label',
          message: `Label available for query ${ranking.queryId}, item ${item.id}.`,
          completed: completedLabels,
          total: totalPossibleLabels,
          strategyId: ranking.strategyId,
          queryId: ranking.queryId
        });
      }
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
          searchConcurrency
        }
      });
    }
  } catch (error) {
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
      error: error instanceof Error ? error.message : String(error),
      artifacts
    });
    throw error;
  }

  options.onProgress?.({
    phase: 'metrics',
    message: 'Computing strategy metrics.',
    completed: completedSearches,
    total: totalSearches
  });
  const labels = [...labelsUsed.values()];
  const metrics = strategies.map(strategy =>
    computeStrategyMetrics({
      strategyId: strategy.id,
      rankings: rankings.filter(ranking => ranking.strategyId === strategy.id),
      labels
    })
  );
  const recommendedStrategyId = chooseRecommendedStrategy(metrics);
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
  await writeText(report.artifacts.labelsUsed, toJsonl(labels));
  await writeText(report.artifacts.rankings, toJsonl(rankings));
  await writeJson(report.artifacts.metrics, metrics);
  await writeJson(report.artifacts.recommendation, recommendation);
  await writeJson(report.artifacts.recommendedSearchDynamic, recommendation.search_dynamic ?? {});
  await writeJson(report.artifacts.recommendedRequestParams, recommendation.request_params ?? {});
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
    recommendedStrategyId,
    artifacts
  });
  options.onProgress?.({
    phase: 'done',
    message: `Search tuning complete. Recommended strategy: ${recommendedStrategyId ?? '(none)'}.`,
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
    artifacts: input.artifacts
  });
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

async function writeRunState(filePath: string, state: TuningRunStateShape): Promise<void> {
  await writeJson(filePath, state);
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
