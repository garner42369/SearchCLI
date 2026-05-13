// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import type { SearchDynamic, SearchResultItem } from '../types';

export interface TuningQuery {
  id: string;
  text: string;
  type?: string;
  intent?: string;
  sourceItemIds?: string[];
}

export interface TuningRequestParams {
  query_keyword_match_percent?: number;
  disable_personalize?: boolean;
}

export interface TuningStrategy {
  id: string;
  title: string;
  searchDynamic: SearchDynamic;
  requestParams: TuningRequestParams;
}

export interface TuningParameterCoverageEntry {
  values: unknown[];
}

export type TuningStrategyCoverage = Record<string, TuningParameterCoverageEntry>;

export interface TuningPlanShape {
  profile: 'similarity-only';
  applicationId: string;
  datasetId?: string;
  sceneId?: string;
  querySource: 'user-provided' | 'generated';
  queryFile?: string;
  fixed: Record<string, unknown>;
  tunedParameters: string[];
  excludedParameters: string[];
  estimated: {
    queryCount: number;
    strategyCount: number;
    topK: number;
    searchRequests: number;
    maxPointwiseJudgements: number;
  };
  coverage: TuningStrategyCoverage;
  strategies: TuningStrategy[];
}

export interface TuningSearchRanking {
  strategyId: string;
  queryId: string;
  queryHash: string;
  queryText: string;
  latencyMs: number;
  totalItems: number;
  items: SearchResultItem[];
}

export interface ItemJudgeView {
  item_id: string;
  title?: string;
  display_fields: Record<string, unknown>;
}

export interface JudgeLabel {
  cache_key: string;
  dataset_id: string;
  query_hash: string;
  item_id: string;
  item_view_hash: string;
  judge_profile_hash: string;
  query_text: string;
  item_view: ItemJudgeView;
  grade: number;
  confidence?: number;
  reason?: string;
  llm_model?: string;
  created_at: string;
}

export interface QueryMetrics {
  queryId: string;
  ndcgAt20: number;
  ndcgAt10: number;
  mrrAt10: number;
  precisionAt10: number;
  zeroResult: boolean;
  latencyMs: number;
}

export interface StrategyMetrics {
  strategyId: string;
  queryCount: number;
  averageNdcgAt20: number;
  averageNdcgAt10: number;
  averageMrrAt10: number;
  averagePrecisionAt10: number;
  zeroResultRate: number;
  averageLatencyMs: number;
  queryMetrics: QueryMetrics[];
}

export interface TuningPerformanceSummary {
  startedAt: string;
  endedAt?: string;
  totalElapsedMs: number;
  setupMs: number;
  searchWallMs: number;
  llmWallMs: number;
  metricsMs: number;
  writeMs: number;
  searchRequestsCompleted: number;
  labelRequestsCompleted: number;
  labelCacheHits: number;
  labelCacheMisses: number;
  averageSearchLatencyMs: number;
  averageLlmLatencyMs: number;
  searchRequestsPerSecond: number;
  llmRequestsPerSecond: number;
  searchConcurrency: number;
  llmConcurrency: number;
}

export interface TuningRunReportShape {
  runId: string;
  generatedAt: string;
  applicationId: string;
  datasetId: string;
  sceneId?: string;
  profile: 'similarity-only';
  querySource: 'user-provided' | 'generated';
  topK: number;
  queryCount: number;
  strategyCount: number;
  labelCount: number;
  recommendedStrategyId?: string;
  strategyCoverage: TuningStrategyCoverage;
  strategies: TuningStrategy[];
  metrics: StrategyMetrics[];
  performance?: TuningPerformanceSummary;
  artifacts: Record<string, string>;
}

export interface TuningRunStateShape {
  runId: string;
  generatedAt: string;
  updatedAt: string;
  status: 'running' | 'completed' | 'failed';
  applicationId: string;
  datasetId: string;
  sceneId?: string;
  profile: 'similarity-only';
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
  performance?: TuningPerformanceSummary;
  recommendedStrategyId?: string;
  error?: string;
  artifacts: Record<string, string>;
}
