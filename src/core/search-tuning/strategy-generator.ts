// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import type { TuningStrategy, TuningStrategyCoverage, TuningStrategyOptimizer } from './types';

export const SEARCH_TUNING_OPTIMIZERS = ['matrix', 'spa'] as const;

export interface GenerateTuningStrategiesOptions {
  optimizer?: TuningStrategyOptimizer;
  maxStrategies?: number;
}

export function generateTuningStrategies(options: GenerateTuningStrategiesOptions = {}): TuningStrategy[] {
  const optimizer = options.optimizer ?? 'matrix';
  if (optimizer === 'spa') {
    return generateSpaStrategies(options.maxStrategies ?? 30);
  }
  return generateSimilarityOnlyStrategies(options.maxStrategies ?? 30);
}

export function generateSimilarityOnlyStrategies(maxStrategies = 30): TuningStrategy[] {
  const strategies: TuningStrategy[] = [
    buildKeywordOnlyStrategy(),
    buildSemanticOnlyStrategy()
  ];

  const denseWeights = [0, 0.25, 0.5, 0.75, 1];
  const keywordMatchPercents = [0, 0.3, 0.5, 0.7];
  const maxRetrievedNums = [50, 100, 200];

  for (const maxRetrievedNum of maxRetrievedNums) {
    strategies.push(buildKeywordSemanticStrategy(0.5, maxRetrievedNum, 0.5));
  }
  for (const queryKeywordMatchPercent of keywordMatchPercents) {
    strategies.push(buildKeywordSemanticStrategy(0.5, 100, queryKeywordMatchPercent));
  }
  for (const denseWeight of denseWeights) {
    strategies.push(buildKeywordSemanticStrategy(denseWeight, 100, 0.5));
  }

  for (const denseWeight of denseWeights) {
    for (const queryKeywordMatchPercent of keywordMatchPercents) {
      for (const maxRetrievedNum of maxRetrievedNums) {
        strategies.push(buildKeywordSemanticStrategy(denseWeight, maxRetrievedNum, queryKeywordMatchPercent));
      }
    }
  }

  return dedupeStrategies(strategies).slice(0, Math.max(1, maxStrategies));
}

export function generateSpaStrategies(maxStrategies = 30): TuningStrategy[] {
  const strategies: TuningStrategy[] = [
    buildKeywordOnlyStrategy('spa-'),
    buildSemanticOnlyStrategy('spa-'),
    buildKeywordSemanticStrategy(0.25, 50, 0, 'spa-'),
    buildKeywordSemanticStrategy(0.25, 100, 0, 'spa-'),
    buildKeywordSemanticStrategy(0.5, 100, 0.3, 'spa-'),
    buildKeywordSemanticStrategy(0.5, 100, 0.5, 'spa-'),
    buildKeywordSemanticStrategy(0.25, 50, 0.3, 'spa-'),
    buildKeywordSemanticStrategy(0.75, 100, 0, 'spa-')
  ];

  const centers = [
    { denseWeight: 0.25, maxRetrievedNum: 50, queryKeywordMatchPercent: 0 },
    { denseWeight: 0.25, maxRetrievedNum: 100, queryKeywordMatchPercent: 0.3 },
    { denseWeight: 0.5, maxRetrievedNum: 100, queryKeywordMatchPercent: 0.3 },
    { denseWeight: 0.75, maxRetrievedNum: 100, queryKeywordMatchPercent: 0 },
    { denseWeight: 0.5, maxRetrievedNum: 150, queryKeywordMatchPercent: 0.5 }
  ];
  const rings = [
    { denseDelta: 0.25, maxDelta: 50, keywordDelta: 0.3 },
    { denseDelta: 0.1, maxDelta: 25, keywordDelta: 0.1 }
  ];

  for (const center of centers) {
    strategies.push(
      buildKeywordSemanticStrategy(
        center.denseWeight,
        center.maxRetrievedNum,
        center.queryKeywordMatchPercent,
        'spa-'
      )
    );
    for (const ring of rings) {
      strategies.push(
        buildKeywordSemanticStrategy(
          clampWeight(center.denseWeight - ring.denseDelta),
          clampMaxRetrievedNum(center.maxRetrievedNum),
          clampKeywordMatch(center.queryKeywordMatchPercent),
          'spa-'
        ),
        buildKeywordSemanticStrategy(
          clampWeight(center.denseWeight + ring.denseDelta),
          clampMaxRetrievedNum(center.maxRetrievedNum),
          clampKeywordMatch(center.queryKeywordMatchPercent),
          'spa-'
        ),
        buildKeywordSemanticStrategy(
          clampWeight(center.denseWeight),
          clampMaxRetrievedNum(center.maxRetrievedNum - ring.maxDelta),
          clampKeywordMatch(center.queryKeywordMatchPercent),
          'spa-'
        ),
        buildKeywordSemanticStrategy(
          clampWeight(center.denseWeight),
          clampMaxRetrievedNum(center.maxRetrievedNum + ring.maxDelta),
          clampKeywordMatch(center.queryKeywordMatchPercent),
          'spa-'
        ),
        buildKeywordSemanticStrategy(
          clampWeight(center.denseWeight),
          clampMaxRetrievedNum(center.maxRetrievedNum),
          clampKeywordMatch(center.queryKeywordMatchPercent - ring.keywordDelta),
          'spa-'
        ),
        buildKeywordSemanticStrategy(
          clampWeight(center.denseWeight),
          clampMaxRetrievedNum(center.maxRetrievedNum),
          clampKeywordMatch(center.queryKeywordMatchPercent + ring.keywordDelta),
          'spa-'
        )
      );
    }
  }

  return dedupeStrategies(strategies).slice(0, Math.max(1, maxStrategies));
}

function buildKeywordOnlyStrategy(idPrefix = ''): TuningStrategy {
  return {
    id: `${idPrefix}keyword-only-mr100-qkm050`,
    title: 'Keyword only, medium keyword match',
    searchDynamic: {
      mode: 'UserDefined',
      user_defined_recall_mode: 'KeywordOnly',
      dense_weight: 0,
      text_weight: 1,
      max_retrieved_num: 100,
      rerank_enabled: false
    },
    requestParams: {
      query_keyword_match_percent: 0.5,
      disable_personalize: true
    }
  };
}

function buildSemanticOnlyStrategy(idPrefix = ''): TuningStrategy {
  return {
    id: `${idPrefix}semantic-only-mr100`,
    title: 'Semantic only',
    searchDynamic: {
      mode: 'UserDefined',
      user_defined_recall_mode: 'SemanticOnly',
      dense_weight: 1,
      text_weight: 0,
      max_retrieved_num: 100,
      rerank_enabled: false
    },
    requestParams: {
      disable_personalize: true
    }
  };
}

function buildKeywordSemanticStrategy(
  denseWeight: number,
  maxRetrievedNum: number,
  queryKeywordMatchPercent: number,
  idPrefix = ''
): TuningStrategy {
  return {
    id: `${idPrefix}ks-dw${formatNumberId(denseWeight)}-mr${maxRetrievedNum}-qkm${formatNumberId(queryKeywordMatchPercent)}`,
    title: `Keyword + semantic, dense weight ${denseWeight}, max recall ${maxRetrievedNum}, keyword match ${queryKeywordMatchPercent}`,
    searchDynamic: {
      mode: 'UserDefined',
      user_defined_recall_mode: 'KeywordSemantic',
      dense_weight: denseWeight,
      text_weight: roundWeight(1 - denseWeight),
      max_retrieved_num: maxRetrievedNum,
      rerank_enabled: false
    },
    requestParams: {
      query_keyword_match_percent: queryKeywordMatchPercent,
      disable_personalize: true
    }
  };
}

export function summarizeStrategyCoverage(strategies: TuningStrategy[]): TuningStrategyCoverage {
  return {
    mode: { values: uniqueValues(strategies.map(strategy => strategy.searchDynamic.mode)) },
    user_defined_recall_mode: { values: uniqueValues(strategies.map(strategy => strategy.searchDynamic.user_defined_recall_mode)) },
    dense_weight: { values: uniqueValues(strategies.map(strategy => strategy.searchDynamic.dense_weight)) },
    text_weight: { values: uniqueValues(strategies.map(strategy => strategy.searchDynamic.text_weight)) },
    query_keyword_match_percent: { values: uniqueValues(strategies.map(strategy => strategy.requestParams.query_keyword_match_percent)) },
    max_retrieved_num: { values: uniqueValues(strategies.map(strategy => strategy.searchDynamic.max_retrieved_num)) },
    rerank_enabled: { values: uniqueValues(strategies.map(strategy => strategy.searchDynamic.rerank_enabled)) },
    disable_personalize: { values: uniqueValues(strategies.map(strategy => strategy.requestParams.disable_personalize)) }
  };
}

export const SIMILARITY_TUNED_PARAMETERS = [
  'user_defined_recall_mode',
  'dense_weight',
  'text_weight',
  'query_keyword_match_percent',
  'max_retrieved_num'
] as const;

export const SIMILARITY_EXCLUDED_PARAMETERS = [
  'mode',
  'rerank',
  'personalization',
  'hotness',
  'boost_bury',
  'sort_rules',
  'serving_controls',
  'business_rules'
] as const;

function formatNumberId(value: number): string {
  return String(Math.round(value * 100)).padStart(3, '0');
}

function roundWeight(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function clampWeight(value: number): number {
  return roundWeight(Math.min(1, Math.max(0, value)));
}

function clampKeywordMatch(value: number): number {
  return roundWeight(Math.min(0.9, Math.max(0, value)));
}

function clampMaxRetrievedNum(value: number): number {
  const rounded = Math.round(value / 25) * 25;
  return Math.min(200, Math.max(50, rounded));
}

function uniqueValues(values: unknown[]): unknown[] {
  const seen = new Set<string>();
  const unique: unknown[] = [];
  for (const value of values) {
    if (value === undefined) continue;
    const key = JSON.stringify(value);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(value);
  }
  return unique.sort(compareValues);
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return String(left).localeCompare(String(right));
}

function dedupeStrategies(strategies: TuningStrategy[]): TuningStrategy[] {
  const seen = new Set<string>();
  return strategies.filter(strategy => {
    if (seen.has(strategy.id)) return false;
    seen.add(strategy.id);
    return true;
  });
}
