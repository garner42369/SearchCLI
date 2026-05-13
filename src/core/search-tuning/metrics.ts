// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import type { JudgeLabel, QueryMetrics, StrategyMetrics, TuningSearchRanking } from './types';

export function computeStrategyMetrics(input: {
  strategyId: string;
  rankings: TuningSearchRanking[];
  labels: JudgeLabel[];
}): StrategyMetrics {
  const labelsByQuery = buildLabelMap(input.labels);
  const queryMetrics = input.rankings.map(ranking => computeQueryMetrics(ranking, labelsByQuery.get(ranking.queryHash) ?? new Map()));

  return {
    strategyId: input.strategyId,
    queryCount: queryMetrics.length,
    averageNdcgAt20: average(queryMetrics.map(metric => metric.ndcgAt20)),
    averageNdcgAt10: average(queryMetrics.map(metric => metric.ndcgAt10)),
    averageMrrAt10: average(queryMetrics.map(metric => metric.mrrAt10)),
    averagePrecisionAt10: average(queryMetrics.map(metric => metric.precisionAt10)),
    zeroResultRate: average(queryMetrics.map(metric => (metric.zeroResult ? 1 : 0))),
    averageLatencyMs: average(queryMetrics.map(metric => metric.latencyMs)),
    queryMetrics
  };
}

export function chooseRecommendedStrategy(metrics: StrategyMetrics[]): string | undefined {
  if (metrics.length === 0) return undefined;
  return [...metrics].sort(compareStrategyMetrics)[0]?.strategyId;
}

function computeQueryMetrics(ranking: TuningSearchRanking, labels: Map<string, number>): QueryMetrics {
  const ids = ranking.items.map(item => item.id);
  return {
    queryId: ranking.queryId,
    ndcgAt20: ndcgAtK(ids, labels, 20),
    ndcgAt10: ndcgAtK(ids, labels, 10),
    mrrAt10: reciprocalRankAtK(ids, labels, 10),
    precisionAt10: precisionAtK(ids, labels, 10),
    zeroResult: ranking.items.length === 0,
    latencyMs: ranking.latencyMs
  };
}

function buildLabelMap(labels: JudgeLabel[]): Map<string, Map<string, number>> {
  const byQuery = new Map<string, Map<string, number>>();
  for (const label of labels) {
    let byItem = byQuery.get(label.query_hash);
    if (!byItem) {
      byItem = new Map<string, number>();
      byQuery.set(label.query_hash, byItem);
    }
    byItem.set(label.item_id, label.grade);
  }
  return byQuery;
}

function ndcgAtK(itemIds: string[], labels: Map<string, number>, k: number): number {
  const dcg = itemIds.slice(0, k).reduce((sum, itemId, index) => sum + discountedGain(labels.get(itemId) ?? 0, index), 0);
  const idealGrades = [...labels.values()].sort((left, right) => right - left).slice(0, k);
  const idcg = idealGrades.reduce((sum, grade, index) => sum + discountedGain(grade, index), 0);
  return idcg === 0 ? 0 : dcg / idcg;
}

function reciprocalRankAtK(itemIds: string[], labels: Map<string, number>, k: number): number {
  for (let index = 0; index < Math.min(k, itemIds.length); index += 1) {
    if ((labels.get(itemIds[index]) ?? 0) >= 2) {
      return 1 / (index + 1);
    }
  }
  return 0;
}

function precisionAtK(itemIds: string[], labels: Map<string, number>, k: number): number {
  const topK = itemIds.slice(0, k);
  if (topK.length === 0) return 0;
  const relevant = topK.filter(itemId => (labels.get(itemId) ?? 0) >= 2).length;
  return relevant / topK.length;
}

function discountedGain(grade: number, index: number): number {
  if (grade <= 0) return 0;
  return (2 ** grade - 1) / Math.log2(index + 2);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function compareStrategyMetrics(a: StrategyMetrics, b: StrategyMetrics): number {
  const ndcg20 = b.averageNdcgAt20 - a.averageNdcgAt20;
  if (ndcg20 !== 0) return ndcg20;
  const ndcg10 = b.averageNdcgAt10 - a.averageNdcgAt10;
  if (ndcg10 !== 0) return ndcg10;
  const mrr = b.averageMrrAt10 - a.averageMrrAt10;
  if (mrr !== 0) return mrr;
  return a.averageLatencyMs - b.averageLatencyMs;
}
