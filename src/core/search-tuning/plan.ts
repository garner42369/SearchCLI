// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import { loadSearchCases } from '../files';
import { generateSimilarityOnlyStrategies, SIMILARITY_EXCLUDED_PARAMETERS, SIMILARITY_TUNED_PARAMETERS, summarizeStrategyCoverage } from './strategy-generator';
import { loadTuningQueries, searchCaseToTuningQuery } from './query-generator';
import type { TuningPlanShape, TuningQuery } from './types';

export interface BuildSearchTuningPlanOptions {
  applicationId: string;
  datasetId?: string;
  sceneId?: string;
  queriesFile?: string;
  queryCount: number;
  topK: number;
  maxStrategies: number;
}

export async function buildSearchTuningPlan(options: BuildSearchTuningPlanOptions): Promise<TuningPlanShape> {
  const strategies = generateSimilarityOnlyStrategies(options.maxStrategies);
  const availableQueryCount = options.queriesFile ? await countQueries(options.queriesFile) : options.queryCount;
  const queryCount = Math.min(options.queryCount, availableQueryCount);
  const strategyCount = strategies.length;

  return {
    profile: 'similarity-only',
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
      maxPointwiseJudgements: queryCount * strategyCount * options.topK
    },
    coverage: summarizeStrategyCoverage(strategies),
    strategies
  };
}

async function countQueries(filePath: string): Promise<number> {
  if (/\.csv$/i.test(filePath)) {
    const cases = await loadSearchCases(filePath);
    return cases
      .map((searchCase, index) => searchCaseToTuningQuery(searchCase, index))
      .filter((query): query is TuningQuery => Boolean(query)).length;
  }
  return (await loadTuningQueries(filePath)).length;
}
