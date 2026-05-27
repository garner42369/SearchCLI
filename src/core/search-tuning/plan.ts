// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import { loadSearchCases } from '../files';
import { generateTuningStrategies, SIMILARITY_EXCLUDED_PARAMETERS, SIMILARITY_TUNED_PARAMETERS, summarizeStrategyCoverage } from './strategy-generator';
import { loadTuningQueries, searchCaseToTuningQuery } from './query-generator';
import type { TuningPlanShape, TuningQuery, TuningStrategyOptimizer } from './types';

export interface BuildSearchTuningPlanOptions {
  applicationId: string;
  datasetId?: string;
  sceneId?: string;
  queriesFile?: string;
  queryCount?: number;
  topK: number;
  maxStrategies: number;
  optimizer?: TuningStrategyOptimizer;
}

export async function buildSearchTuningPlan(options: BuildSearchTuningPlanOptions): Promise<TuningPlanShape> {
  const optimizer = options.optimizer ?? 'matrix';
  const strategies = generateTuningStrategies({ optimizer, maxStrategies: options.maxStrategies });
  const queryStats = options.queriesFile
    ? await loadQueryStats(options.queriesFile, options.queryCount)
    : { queryCount: options.queryCount ?? 100, sourceItemQueryCount: 0 };
  const queryCount = queryStats.queryCount;
  const strategyCount = strategies.length;
  const suggestedFirstPass = buildSuggestedFirstPass(queryCount, strategyCount, options.topK);
  const maxPointwiseJudgements = queryCount * strategyCount * options.topK;
  const sourceItemQueryCoverage = queryCount > 0 ? queryStats.sourceItemQueryCount / queryCount : 0;

  return {
    profile: 'similarity-only',
    optimizer,
    applicationId: options.applicationId,
    datasetId: options.datasetId,
    sceneId: options.sceneId,
    querySource: options.queriesFile ? 'user-provided' : 'generated',
    queryFile: options.queriesFile ? path.resolve(options.queriesFile) : undefined,
    fixed: {
      mode: 'UserDefined',
      rerank_enabled: false,
      disable_personalize: true
    },
    tunedParameters: [...SIMILARITY_TUNED_PARAMETERS],
    excludedParameters: [...SIMILARITY_EXCLUDED_PARAMETERS],
    estimated: {
      queryCount,
      strategyCount,
      topK: options.topK,
      searchRequests: queryCount * strategyCount,
      maxPointwiseJudgements,
      sourceItemQueryCount: queryStats.sourceItemQueryCount,
      sourceItemQueryCoverage
    },
    suggestedFirstPass,
    warnings: buildPlanWarnings({ maxPointwiseJudgements, sourceItemQueryCoverage, suggestedFirstPass }),
    coverage: summarizeStrategyCoverage(strategies),
    strategies
  };
}

async function loadQueryStats(filePath: string, limit?: number): Promise<{ queryCount: number; sourceItemQueryCount: number }> {
  let queries: TuningQuery[];
  if (/\.csv$/i.test(filePath)) {
    const cases = await loadSearchCases(filePath);
    queries = cases
      .map((searchCase, index) => searchCaseToTuningQuery(searchCase, index))
      .filter((query): query is TuningQuery => Boolean(query));
  } else {
    queries = await loadTuningQueries(filePath);
  }
  const evaluated = typeof limit === 'number' ? queries.slice(0, Math.max(0, Math.floor(limit))) : queries;
  return {
    queryCount: evaluated.length,
    sourceItemQueryCount: evaluated.filter(query => (query.sourceItemIds ?? []).length > 0).length
  };
}

function buildSuggestedFirstPass(queryCount: number, strategyCount: number, topK: number): TuningPlanShape['suggestedFirstPass'] {
  const suggestedQueryCount = Math.min(queryCount, 30);
  const suggestedStrategyCount = Math.min(strategyCount, 10);
  const suggestedTopK = Math.min(topK, 10);
  return {
    queryCount: suggestedQueryCount,
    strategyCount: suggestedStrategyCount,
    topK: suggestedTopK,
    searchRequests: suggestedQueryCount * suggestedStrategyCount,
    maxPointwiseJudgements: suggestedQueryCount * suggestedStrategyCount * suggestedTopK,
    reason: 'Use this first-pass scope when the full plan is expensive or when validating a new application before full LLM judging.'
  };
}

function buildPlanWarnings(input: {
  maxPointwiseJudgements: number;
  sourceItemQueryCoverage: number;
  suggestedFirstPass: TuningPlanShape['suggestedFirstPass'];
}): string[] {
  const warnings: string[] = [];
  if (input.maxPointwiseJudgements > input.suggestedFirstPass.maxPointwiseJudgements) {
    warnings.push(
      `Full LLM judging can require up to ${input.maxPointwiseJudgements} pointwise labels; first-pass scope reduces that to ${input.suggestedFirstPass.maxPointwiseJudgements}.`
    );
  }
  if (input.sourceItemQueryCoverage >= 0.8) {
    warnings.push('Most queries include sourceItemIds; --label-source source-item can provide a fast synthetic silver-label evaluation before LLM judging.');
  }
  return warnings;
}
