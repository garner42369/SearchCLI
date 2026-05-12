// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import { loadSearchCases, writeJson, writeText } from '../files';
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
import type { JudgeLabel, TuningQuery, TuningRunReportShape, TuningSearchRanking } from './types';
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
  outputDir?: string;
  onProgress?: (event: TuningProgressEvent) => void;
}

export async function runSearchTuning(options: RunSearchTuningOptions): Promise<TuningRunReportShape> {
  const generatedAt = new Date().toISOString();
  const runId = `run_${generatedAt.replaceAll(':', '-').replace(/\.\d+Z$/, 'Z')}`;
  const rootDir = path.resolve(options.outputDir ?? '.viking/search-tuning');
  const runDir = path.join(rootDir, 'runs', runId);
  const cachePath = path.join(rootDir, 'cache', 'labels.jsonl');
  const client = new VikingSearchClient(options.runtimeConfig);
  const labelCache = await loadLabelCache(cachePath);
  const judgeProfileHash = buildJudgeProfileHash(options.llmConfig);
  const queries = await resolveQueries(options);
  const strategies = generateSimilarityOnlyStrategies(options.maxStrategies);
  const querySource = options.queriesFile ? 'user-provided' : 'generated';
  const strategyCoverage = summarizeStrategyCoverage(strategies);
  const rankings: TuningSearchRanking[] = [];
  const labelsUsed = new Map<string, JudgeLabel>();
  const totalSearches = strategies.length * queries.length;
  const totalPossibleLabels = totalSearches * options.topK;
  let completedSearches = 0;
  let completedLabels = 0;

  options.onProgress?.({
    phase: 'start',
    message: `Starting search tuning: ${queries.length} queries, ${strategies.length} strategies, topK=${options.topK}, up to ${totalPossibleLabels} pointwise judgements.`,
    completed: 0,
    total: totalSearches
  });

  await writeJson(path.join(runDir, 'context.json'), options.context);
  await writeText(path.join(runDir, 'queries.jsonl'), toJsonl(queries));
  await writeJson(path.join(runDir, 'strategies.json'), strategies);
  await writeJson(path.join(runDir, 'strategy-coverage.json'), strategyCoverage);

  for (const strategy of strategies) {
    options.onProgress?.({
      phase: 'strategy',
      message: `Evaluating strategy ${strategy.id}.`,
      completed: completedSearches,
      total: totalSearches,
      strategyId: strategy.id
    });
    for (const query of queries) {
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
      const latencyMs = Date.now() - startedAt;
      const topItems = response.results.slice(0, options.topK);

      rankings.push({
        strategyId: strategy.id,
        queryId: query.id,
        queryHash,
        queryText: query.text,
        latencyMs,
        totalItems: response.totalItems,
        items: topItems
      });

      for (const item of topItems) {
        const itemView = buildItemJudgeView(item);
        const itemViewHash = sha256Hex(itemView);
        const cacheKey = buildLabelCacheKey({
          datasetId: options.context.datasetId,
          queryHash,
          itemId: item.id,
          itemViewHash,
          judgeProfileHash
        });
        let label = labelCache.labels.get(cacheKey);
        if (!label) {
          label = await judgeRelevance({
            llmConfig: options.llmConfig,
            datasetId: options.context.datasetId,
            query,
            queryHash,
            itemView,
            itemViewHash,
            judgeProfileHash,
            cacheKey
          });
          await appendLabel(labelCache, label);
        }
        labelsUsed.set(label.cache_key, label);
        completedLabels += 1;
        options.onProgress?.({
          phase: 'label',
          message: `Label available for query ${query.id}, item ${item.id}.`,
          completed: completedLabels,
          total: totalPossibleLabels,
          strategyId: strategy.id,
          queryId: query.id
        });
      }
      completedSearches += 1;
    }
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
      context: path.join(runDir, 'context.json'),
      queries: path.join(runDir, 'queries.jsonl'),
      strategies: path.join(runDir, 'strategies.json'),
      strategyCoverage: path.join(runDir, 'strategy-coverage.json'),
      labelsUsed: path.join(runDir, 'labels-used.jsonl'),
      rankings: path.join(runDir, 'rankings.jsonl'),
      metrics: path.join(runDir, 'metrics.json'),
      recommendation: path.join(runDir, 'recommendation.json'),
      recommendedSearchDynamic: path.join(runDir, 'recommended-search-dynamic.json'),
      recommendedRequestParams: path.join(runDir, 'recommended-request-params.json'),
      reportJson: path.join(runDir, 'report.json'),
      reportMarkdown: path.join(runDir, 'report.md')
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

function buildQueryHash(query: TuningQuery): string {
  return sha256Hex({
    text: query.text.trim().toLowerCase(),
    intent: query.intent
  });
}

function toJsonl(values: unknown[]): string {
  return `${values.map(value => stableStringify(value)).join('\n')}\n`;
}
