// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import type {
  CandidateEvaluationSummary,
  CandidateStrategy,
  CaseEvaluation,
  QualitativeDiff,
  SearchCase,
  SearchResponseShape
} from './types';
import { VikingSearchClient } from './search-client';

export async function evaluateCandidate(
  client: VikingSearchClient,
  candidate: CandidateStrategy,
  cases: SearchCase[],
  baselineResponses?: Map<string, SearchResponseShape>
): Promise<CandidateEvaluationSummary> {
  const candidateResponses = new Map<string, SearchResponseShape>();
  for (const [index, searchCase] of cases.entries()) {
    const caseId = searchCase.id ?? `case-${index + 1}`;
    candidateResponses.set(caseId, await client.search(searchCase, candidate.searchDynamic));
  }

  return summarizeCandidateResponses(candidate, cases, candidateResponses, baselineResponses);
}

export function summarizeCandidateResponses(
  candidate: CandidateStrategy,
  cases: SearchCase[],
  candidateResponses: Map<string, SearchResponseShape>,
  baselineResponses?: Map<string, SearchResponseShape>
): CandidateEvaluationSummary {
  const labeledCases: CaseEvaluation[] = [];
  const unlabeledCases: QualitativeDiff[] = [];

  for (const [index, searchCase] of cases.entries()) {
    const caseId = searchCase.id ?? `case-${index + 1}`;
    const candidateResponse = candidateResponses.get(caseId) ?? candidateResponses.get(`case-${index + 1}`);
    if (!candidateResponse) {
      continue;
    }
    const expectedIds = searchCase.expected_ids ?? [];
    const relevanceTiers = searchCase.relevance_tiers ?? (expectedIds.length > 0 ? [expectedIds] : []);
    const candidateTopIds = candidateResponse.results.map(item => item.id);

    if (expectedIds.length > 0) {
      labeledCases.push({
        caseId,
        notes: searchCase.notes,
        query: searchCase.query,
        expectedIds,
        relevanceTiers,
        topIds: candidateTopIds,
        ndcgAt10: ndcgAt10(candidateTopIds, relevanceTiers),
        reciprocalRank: reciprocalRank(candidateTopIds, expectedIds),
        recallAt10: recallAt10(candidateTopIds, expectedIds)
      });
    } else {
      const baselineResponse = baselineResponses?.get(caseId);
      const baselineTopIds = baselineResponse?.results.map(item => item.id) ?? [];
      unlabeledCases.push({
        caseId,
        notes: searchCase.notes,
        query: searchCase.query,
        baselineTopIds: baselineTopIds.slice(0, 10),
        candidateTopIds: candidateTopIds.slice(0, 10),
        baselineTitles: baselineResponse?.results.slice(0, 5).map(item => item.title ?? item.id) ?? [],
        candidateTitles: candidateResponse.results.slice(0, 5).map(item => item.title ?? item.id)
      });
    }
  }

  const averageNdcgAt10 =
    labeledCases.length > 0
      ? labeledCases.reduce((sum, item) => sum + item.ndcgAt10, 0) / labeledCases.length
      : undefined;
  const averageReciprocalRank =
    labeledCases.length > 0
      ? labeledCases.reduce((sum, item) => sum + item.reciprocalRank, 0) / labeledCases.length
      : undefined;
  const averageRecallAt10 =
    labeledCases.length > 0
      ? labeledCases.reduce((sum, item) => sum + item.recallAt10, 0) / labeledCases.length
      : undefined;

  return {
    candidate,
    labeledCount: labeledCases.length,
    unlabeledCount: unlabeledCases.length,
    averageNdcgAt10,
    averageReciprocalRank,
    averageRecallAt10,
    labeledCases,
    unlabeledCases
  };
}

export function chooseBestCandidate(
  baseline: CandidateEvaluationSummary | undefined,
  candidates: CandidateEvaluationSummary[]
): string | undefined {
  const scored = candidates.filter(item => item.labeledCount > 0 && item.averageNdcgAt10 !== undefined);
  if (scored.length === 0) return undefined;

  scored.sort(compareCandidateSummaries);

  const best = scored[0];
  if (!baseline || baseline.averageNdcgAt10 === undefined) return best.candidate.id;

  if ((best.averageNdcgAt10 ?? 0) > baseline.averageNdcgAt10) {
    return best.candidate.id;
  }

  return undefined;
}

export function compareCandidateSummaries(a: CandidateEvaluationSummary, b: CandidateEvaluationSummary): number {
  const ndcgDiff = (b.averageNdcgAt10 ?? 0) - (a.averageNdcgAt10 ?? 0);
  if (ndcgDiff !== 0) return ndcgDiff;
  const mrrDiff = (b.averageReciprocalRank ?? 0) - (a.averageReciprocalRank ?? 0);
  if (mrrDiff !== 0) return mrrDiff;
  return (b.averageRecallAt10 ?? 0) - (a.averageRecallAt10 ?? 0);
}

function reciprocalRank(topIds: string[], expectedIds: string[]): number {
  const expected = new Set(expectedIds);
  for (let index = 0; index < topIds.length; index += 1) {
    if (expected.has(topIds[index])) {
      return 1 / (index + 1);
    }
  }
  return 0;
}

function recallAt10(topIds: string[], expectedIds: string[]): number {
  if (expectedIds.length === 0) return 0;
  const top10 = new Set(topIds.slice(0, 10));
  const hits = expectedIds.filter(id => top10.has(id)).length;
  return hits / expectedIds.length;
}

function ndcgAt10(topIds: string[], relevanceTiers: string[][]): number {
  if (relevanceTiers.length === 0) return 0;

  const relevanceById = new Map<string, number>();
  const maxGrade = relevanceTiers.length;

  relevanceTiers.forEach((group, index) => {
    const grade = maxGrade - index;
    for (const id of group) {
      if (!relevanceById.has(id)) {
        relevanceById.set(id, grade);
      }
    }
  });

  const dcg = topIds
    .slice(0, 10)
    .reduce((sum, id, index) => sum + discountedGain(relevanceById.get(id) ?? 0, index), 0);

  const idealGrades = [...relevanceById.values()].sort((a, b) => b - a).slice(0, 10);
  const idcg = idealGrades.reduce((sum, grade, index) => sum + discountedGain(grade, index), 0);

  if (idcg === 0) return 0;
  return dcg / idcg;
}

function discountedGain(grade: number, index: number): number {
  if (grade <= 0) return 0;
  return (2 ** grade - 1) / Math.log2(index + 2);
}
