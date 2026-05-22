// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { loadSearchCases } from '../files';
import { VikingSearchClient } from '../search-client';
import type { RuntimeConfig, SearchCase, SearchResultItem } from '../types';
import { computeStrategyMetrics } from './metrics';
import { loadTuningQueries, searchCaseToTuningQuery } from './query-generator';
import { loadTuningReport } from './runner';
import { sha256Hex } from './hash';
import type { JudgeLabel, StrategyMetrics, TuningQuery, TuningRunReportShape, TuningSearchRanking } from './types';

export interface SearchTuneRunCompareResult {
  ok: true;
  mode: 'run-ids';
  baselineRunId: string;
  winnerRunId?: string;
  rows: RunComparisonRow[];
  warnings: string[];
}

export interface SearchTuneSceneCompareResult {
  ok: true;
  mode: 'scene-ids';
  applicationId: string;
  datasetId: string;
  queryFile: string;
  sceneIds: string[];
  baselineSceneId: string;
  winnerSceneId?: string;
  queryCount: number;
  topK: number;
  labelSource: 'source-item';
  metrics: StrategyMetrics[];
  rows: SceneComparisonRow[];
  performance: {
    durationMs: number;
    searchWallMs: number;
    searchRequests: number;
    searchRequestsPerSecond: number;
    averageSearchLatencyMs: number;
    searchConcurrency: number;
  };
  warnings: string[];
}

export interface RunComparisonRow {
  runId: string;
  applicationId: string;
  datasetId: string;
  sceneId?: string;
  optimizer: string;
  labelSource: string;
  querySource: string;
  queryCount: number;
  strategyCount: number;
  topK: number;
  recommendedStrategyId?: string;
  querySetHash?: string;
  averageNdcgAt20: number;
  averageNdcgAt10: number;
  averageMrrAt10: number;
  averagePrecisionAt10: number;
  zeroResultRate: number;
  averageLatencyMs: number;
  deltaNdcgAt20: number;
  deltaMrrAt10: number;
  deltaZeroResultRate: number;
  deltaLatencyMs: number;
}

export interface SceneComparisonRow {
  sceneId: string;
  queryCount: number;
  averageNdcgAt20: number;
  averageNdcgAt10: number;
  averageMrrAt10: number;
  averagePrecisionAt10: number;
  zeroResultRate: number;
  averageLatencyMs: number;
  deltaNdcgAt20: number;
  deltaMrrAt10: number;
  deltaZeroResultRate: number;
  deltaLatencyMs: number;
}

export async function compareTuningRuns(options: {
  runIds: string[];
  outputDir?: string;
  baselineRunId?: string;
}): Promise<SearchTuneRunCompareResult> {
  const runIds = uniqueNonEmpty(options.runIds);
  if (runIds.length < 2) {
    throw new Error('Run comparison requires at least two --run-ids.');
  }
  const baselineRunId = options.baselineRunId ?? runIds[0];
  if (!runIds.includes(baselineRunId)) {
    throw new Error(`--baseline-run-id ${baselineRunId} must be included in --run-ids.`);
  }

  const reports = await Promise.all(runIds.map(runId => loadTuningReport(options.outputDir, runId)));
  const rowsWithoutDeltas = await Promise.all(reports.map(report => buildRunComparisonRow(report)));
  const baseline = rowsWithoutDeltas.find(row => row.runId === baselineRunId);
  if (!baseline) {
    throw new Error(`Baseline run ${baselineRunId} was not loaded.`);
  }
  const rows = rowsWithoutDeltas
    .map(row => ({
      ...row,
      deltaNdcgAt20: row.averageNdcgAt20 - baseline.averageNdcgAt20,
      deltaMrrAt10: row.averageMrrAt10 - baseline.averageMrrAt10,
      deltaZeroResultRate: row.zeroResultRate - baseline.zeroResultRate,
      deltaLatencyMs: row.averageLatencyMs - baseline.averageLatencyMs
    }))
    .sort(compareRowsByQuality);

  return {
    ok: true,
    mode: 'run-ids',
    baselineRunId,
    winnerRunId: rows[0]?.runId,
    rows,
    warnings: buildRunCompareWarnings(rowsWithoutDeltas, reports)
  };
}

export async function compareSearchScenes(options: {
  runtimeConfig: RuntimeConfig;
  queriesFile: string;
  sceneIds: string[];
  topK: number;
  searchConcurrency: number;
  baselineSceneId?: string;
}): Promise<SearchTuneSceneCompareResult> {
  const startedAt = Date.now();
  const queryFile = path.resolve(options.queriesFile);
  const sceneIds = uniqueNonEmpty(options.sceneIds);
  if (sceneIds.length < 2) {
    throw new Error('Scene comparison requires at least two --scene-ids.');
  }
  const baselineSceneId = options.baselineSceneId ?? sceneIds[0];
  if (!sceneIds.includes(baselineSceneId)) {
    throw new Error(`--baseline-scene-id ${baselineSceneId} must be included in --scene-ids.`);
  }
  const queries = await loadQueriesForCompare(queryFile);
  if (queries.length === 0) {
    throw new Error('No valid queries were found in --queries.');
  }
  const sourceItemQueries = queries.filter(query => (query.sourceItemIds ?? []).length > 0);
  if (sourceItemQueries.length !== queries.length) {
    throw new Error(
      `Scene compare v1 uses source-item silver labels and requires every query to have sourceItemIds. Found ${sourceItemQueries.length}/${queries.length}.`
    );
  }

  const searchConcurrency = Math.max(1, Math.floor(options.searchConcurrency));
  const pending = sceneIds.flatMap(sceneId => queries.map(query => ({ sceneId, query })));
  const rankings: TuningSearchRanking[] = [];
  const latencies: number[] = [];
  const clients = new Map<string, VikingSearchClient>();
  let nextIndex = 0;
  let searchWallMs = 0;

  const getClient = (sceneId: string): VikingSearchClient => {
    const cached = clients.get(sceneId);
    if (cached) return cached;
    const client = new VikingSearchClient({
      ...options.runtimeConfig,
      sceneId,
      defaultPageSize: options.topK
    });
    clients.set(sceneId, client);
    return client;
  };

  const workerCount = Math.min(searchConcurrency, pending.length);
  const worker = async (): Promise<void> => {
    while (nextIndex < pending.length) {
      const task = pending[nextIndex];
      nextIndex += 1;
      const started = Date.now();
      const response = await getClient(task.sceneId).search({
        id: task.query.id,
        query: { text: task.query.text },
        dataset_id: options.runtimeConfig.datasetId,
        page_number: 1,
        page_size: options.topK,
        disable_personalize: true
      });
      const latencyMs = Date.now() - started;
      latencies.push(latencyMs);
      rankings.push({
        strategyId: task.sceneId,
        queryId: task.query.id,
        queryHash: buildQueryHash(task.query),
        queryText: task.query.text,
        latencyMs,
        totalItems: response.totalItems,
        items: response.results.slice(0, options.topK)
      });
    }
  };

  const searchStartedAt = Date.now();
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  searchWallMs = Date.now() - searchStartedAt;

  const labels = buildSourceItemLabels({
    datasetId: options.runtimeConfig.datasetId,
    queries,
    rankings
  });
  const metrics = sceneIds.map(sceneId =>
    computeStrategyMetrics({
      strategyId: sceneId,
      rankings: rankings.filter(ranking => ranking.strategyId === sceneId),
      labels
    })
  );
  const baseline = metrics.find(metric => metric.strategyId === baselineSceneId);
  if (!baseline) {
    throw new Error(`Baseline scene ${baselineSceneId} produced no metrics.`);
  }
  const rows = metrics
    .map(metric => ({
      sceneId: metric.strategyId,
      queryCount: metric.queryCount,
      averageNdcgAt20: metric.averageNdcgAt20,
      averageNdcgAt10: metric.averageNdcgAt10,
      averageMrrAt10: metric.averageMrrAt10,
      averagePrecisionAt10: metric.averagePrecisionAt10,
      zeroResultRate: metric.zeroResultRate,
      averageLatencyMs: metric.averageLatencyMs,
      deltaNdcgAt20: metric.averageNdcgAt20 - baseline.averageNdcgAt20,
      deltaMrrAt10: metric.averageMrrAt10 - baseline.averageMrrAt10,
      deltaZeroResultRate: metric.zeroResultRate - baseline.zeroResultRate,
      deltaLatencyMs: metric.averageLatencyMs - baseline.averageLatencyMs
    }))
    .sort(compareSceneRowsByQuality);

  return {
    ok: true,
    mode: 'scene-ids',
    applicationId: options.runtimeConfig.applicationId,
    datasetId: options.runtimeConfig.datasetId,
    queryFile,
    sceneIds,
    baselineSceneId,
    winnerSceneId: rows[0]?.sceneId,
    queryCount: queries.length,
    topK: options.topK,
    labelSource: 'source-item',
    metrics,
    rows,
    performance: {
      durationMs: Date.now() - startedAt,
      searchWallMs,
      searchRequests: rankings.length,
      searchRequestsPerSecond: safeRate(rankings.length, searchWallMs),
      averageSearchLatencyMs: average(latencies),
      searchConcurrency
    },
    warnings: [
      'Scene compare v1 uses source-item silver labels from query.sourceItemIds; use LLM or human labels for higher-confidence validation.'
    ]
  };
}

async function buildRunComparisonRow(report: TuningRunReportShape): Promise<Omit<RunComparisonRow, 'deltaNdcgAt20' | 'deltaMrrAt10' | 'deltaZeroResultRate' | 'deltaLatencyMs'>> {
  const metric =
    report.metrics.find(item => item.strategyId === report.recommendedStrategyId) ??
    [...report.metrics].sort((left, right) => right.averageNdcgAt20 - left.averageNdcgAt20)[0];
  return {
    runId: report.runId,
    applicationId: report.applicationId,
    datasetId: report.datasetId,
    sceneId: report.sceneId,
    optimizer: report.optimizer,
    labelSource: report.labelSource,
    querySource: report.querySource,
    queryCount: report.queryCount,
    strategyCount: report.strategyCount,
    topK: report.topK,
    recommendedStrategyId: report.recommendedStrategyId,
    querySetHash: await hashOptionalFile(report.artifacts.queries),
    averageNdcgAt20: metric?.averageNdcgAt20 ?? 0,
    averageNdcgAt10: metric?.averageNdcgAt10 ?? 0,
    averageMrrAt10: metric?.averageMrrAt10 ?? 0,
    averagePrecisionAt10: metric?.averagePrecisionAt10 ?? 0,
    zeroResultRate: metric?.zeroResultRate ?? 0,
    averageLatencyMs: metric?.averageLatencyMs ?? 0
  };
}

function buildRunCompareWarnings(rows: Array<Omit<RunComparisonRow, 'deltaNdcgAt20' | 'deltaMrrAt10' | 'deltaZeroResultRate' | 'deltaLatencyMs'>>, reports: TuningRunReportShape[]): string[] {
  const warnings: string[] = [];
  if (new Set(rows.map(row => row.applicationId)).size > 1) warnings.push('Compared runs belong to different applications.');
  if (new Set(rows.map(row => row.datasetId)).size > 1) warnings.push('Compared runs belong to different datasets.');
  if (new Set(rows.map(row => row.topK)).size > 1) warnings.push('Compared runs used different topK values.');
  if (new Set(rows.map(row => row.labelSource)).size > 1) warnings.push('Compared runs used different label sources.');
  if (new Set(rows.map(row => row.querySetHash).filter(Boolean)).size > 1) warnings.push('Compared runs appear to use different query sets.');
  for (const report of reports) {
    if (!report.recommendedStrategyId) {
      warnings.push(`Run ${report.runId} has no recommendedStrategyId; using the highest NDCG@20 metric row for comparison.`);
    }
  }
  return warnings;
}

async function loadQueriesForCompare(filePath: string): Promise<TuningQuery[]> {
  if (/\.csv$/i.test(filePath)) {
    const cases = await loadSearchCases(filePath);
    return cases
      .map((searchCase, index) => searchCaseToTuningQuery(searchCase, index))
      .filter((query): query is TuningQuery => Boolean(query));
  }
  return loadTuningQueries(filePath);
}

function buildSourceItemLabels(input: { datasetId: string; queries: TuningQuery[]; rankings: TuningSearchRanking[] }): JudgeLabel[] {
  const queryById = new Map(input.queries.map(query => [query.id, query]));
  const labelsByKey = new Map<string, JudgeLabel>();
  for (const ranking of input.rankings) {
    const query = queryById.get(ranking.queryId);
    if (!query) continue;
    const sourceItemIds = new Set((query.sourceItemIds ?? []).map(String));
    for (const item of ranking.items) {
      const itemView = buildItemView(item);
      const itemViewHash = sha256Hex(itemView);
      const cacheKey = sha256Hex({
        source: 'compare-source-item-v1',
        datasetId: input.datasetId,
        queryHash: ranking.queryHash,
        itemId: item.id,
        itemViewHash
      });
      if (labelsByKey.has(cacheKey)) continue;
      const relevant = sourceItemIds.has(String(item.id));
      labelsByKey.set(cacheKey, {
        cache_key: cacheKey,
        dataset_id: input.datasetId,
        query_hash: ranking.queryHash,
        item_id: item.id,
        item_view_hash: itemViewHash,
        judge_profile_hash: 'compare-source-item-v1',
        query_text: ranking.queryText,
        item_view: itemView,
        grade: relevant ? 3 : 0,
        confidence: 1,
        reason: relevant ? 'Item id matched query sourceItemIds.' : 'Item id did not match query sourceItemIds.',
        llm_model: 'source-item-silver-v1',
        created_at: new Date().toISOString()
      });
    }
  }
  return [...labelsByKey.values()];
}

function buildItemView(item: SearchResultItem): JudgeLabel['item_view'] {
  return {
    item_id: item.id,
    title: item.title,
    display_fields: item.displayFields
  };
}

function buildQueryHash(query: TuningQuery): string {
  return sha256Hex({
    text: query.text.trim().toLowerCase(),
    intent: query.intent
  });
}

async function hashOptionalFile(filePath: string | undefined): Promise<string | undefined> {
  if (!filePath) return undefined;
  try {
    const raw = await readFile(filePath, 'utf8');
    return sha256Hex(raw);
  } catch {
    return undefined;
  }
}

function uniqueNonEmpty(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function compareRowsByQuality(left: RunComparisonRow, right: RunComparisonRow): number {
  return (
    right.averageNdcgAt20 - left.averageNdcgAt20 ||
    right.averageNdcgAt10 - left.averageNdcgAt10 ||
    right.averageMrrAt10 - left.averageMrrAt10 ||
    left.zeroResultRate - right.zeroResultRate ||
    left.averageLatencyMs - right.averageLatencyMs
  );
}

function compareSceneRowsByQuality(left: SceneComparisonRow, right: SceneComparisonRow): number {
  return (
    right.averageNdcgAt20 - left.averageNdcgAt20 ||
    right.averageNdcgAt10 - left.averageNdcgAt10 ||
    right.averageMrrAt10 - left.averageMrrAt10 ||
    left.zeroResultRate - right.zeroResultRate ||
    left.averageLatencyMs - right.averageLatencyMs
  );
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function safeRate(count: number, durationMs: number): number {
  return durationMs > 0 ? count / (durationMs / 1000) : 0;
}
