// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import { loadJsonOrJsonl, loadSearchCases } from '../files';
import type { SearchCase } from '../types';
import type { TuningQuery } from './types';

export interface QueryValidationProblem {
  severity: 'error' | 'warning';
  code: string;
  message: string;
  index?: number;
  id?: string;
}

export interface QueryValidationResult {
  ok: boolean;
  queryFile: string;
  format: 'json' | 'jsonl' | 'csv' | 'unknown';
  requestedLimit?: number;
  queryCount: number;
  evaluatedQueryCount: number;
  validQueryCount: number;
  invalidQueryCount: number;
  duplicateIdCount: number;
  duplicateTextCount: number;
  sourceItemQueryCount: number;
  sourceItemQueryCoverage: number;
  labelSourceRecommendation: 'source-item' | 'llm';
  typeCounts: Record<string, number>;
  problems: QueryValidationProblem[];
  sampleQueries: TuningQuery[];
}

interface NormalizedQueryCandidate {
  query?: TuningQuery;
  problems: QueryValidationProblem[];
}

export async function validateTuningQueryFile(options: {
  queriesFile: string;
  queryCount?: number;
  maxProblems?: number;
}): Promise<QueryValidationResult> {
  const queryFile = path.resolve(options.queriesFile);
  const format = detectFormat(queryFile);
  const maxProblems = Math.max(1, Math.floor(options.maxProblems ?? 50));
  const problems: QueryValidationProblem[] = [];
  let rawEntries: unknown[];

  try {
    rawEntries = format === 'csv' ? await loadCsvAsRawQueries(queryFile) : await loadJsonOrJsonl<unknown>(queryFile);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      queryFile,
      format,
      requestedLimit: options.queryCount,
      queryCount: 0,
      evaluatedQueryCount: 0,
      validQueryCount: 0,
      invalidQueryCount: 0,
      duplicateIdCount: 0,
      duplicateTextCount: 0,
      sourceItemQueryCount: 0,
      sourceItemQueryCoverage: 0,
      labelSourceRecommendation: 'llm',
      typeCounts: {},
      problems: [
        {
          severity: 'error',
          code: 'parse_failed',
          message: `Failed to parse query file: ${message}`
        }
      ],
      sampleQueries: []
    };
  }

  const limit = options.queryCount && options.queryCount > 0 ? Math.floor(options.queryCount) : rawEntries.length;
  const evaluatedRawEntries = rawEntries.slice(0, limit);
  const validQueries: TuningQuery[] = [];

  for (let index = 0; index < evaluatedRawEntries.length; index += 1) {
    const candidate = normalizeQueryCandidate(evaluatedRawEntries[index], index);
    for (const problem of candidate.problems) problems.push(problem);
    if (candidate.query) validQueries.push(candidate.query);
  }

  const duplicateIdCount = markDuplicateIds(validQueries, problems);
  const duplicateTextCount = markDuplicateTexts(validQueries, problems);
  addDistributionWarnings(validQueries, evaluatedRawEntries.length, problems);
  const errorCount = problems.filter(problem => problem.severity === 'error').length;
  const sourceItemQueryCount = validQueries.filter(query => (query.sourceItemIds ?? []).length > 0).length;
  const sourceItemQueryCoverage = validQueries.length > 0 ? sourceItemQueryCount / validQueries.length : 0;

  return {
    ok: errorCount === 0 && validQueries.length > 0,
    queryFile,
    format,
    requestedLimit: options.queryCount,
    queryCount: rawEntries.length,
    evaluatedQueryCount: evaluatedRawEntries.length,
    validQueryCount: validQueries.length,
    invalidQueryCount: evaluatedRawEntries.length - validQueries.length,
    duplicateIdCount,
    duplicateTextCount,
    sourceItemQueryCount,
    sourceItemQueryCoverage,
    labelSourceRecommendation: sourceItemQueryCoverage >= 0.8 ? 'source-item' : 'llm',
    typeCounts: countBy(validQueries.map(query => query.type ?? 'unknown')),
    problems: problems.slice(0, maxProblems),
    sampleQueries: validQueries.slice(0, Math.min(20, validQueries.length))
  };
}

async function loadCsvAsRawQueries(filePath: string): Promise<unknown[]> {
  const cases = await loadSearchCases(filePath);
  return cases.map((searchCase, index) => searchCaseToRawQuery(searchCase, index));
}

function searchCaseToRawQuery(searchCase: SearchCase, index: number): Record<string, unknown> {
  return {
    id: searchCase.id ?? `csv-${index + 1}`,
    text: searchCase.query.text,
    intent: searchCase.notes,
    sourceItemIds: searchCase.expected_ids
  };
}

function normalizeQueryCandidate(value: unknown, index: number): NormalizedQueryCandidate {
  const problems: QueryValidationProblem[] = [];
  if (!isRecord(value)) {
    return {
      problems: [
        {
          severity: 'error',
          code: 'invalid_record',
          message: 'Query entry must be an object.',
          index
        }
      ]
    };
  }

  const id = typeof value.id === 'string' && value.id.trim() ? value.id.trim() : undefined;
  const text =
    typeof value.text === 'string'
      ? value.text.trim()
      : isRecord(value.query) && typeof value.query.text === 'string'
      ? value.query.text.trim()
      : undefined;

  if (!id) {
    problems.push({
      severity: 'warning',
      code: 'missing_id',
      message: 'Query entry has no stable id; tune run will synthesize one, but compare/report alignment is less reliable.',
      index
    });
  }
  if (!text) {
    problems.push({
      severity: 'error',
      code: 'missing_text',
      message: 'Query entry must contain text or query.text.',
      index,
      id
    });
    return { problems };
  }
  if (text.length > 200) {
    problems.push({
      severity: 'warning',
      code: 'long_text',
      message: `Query text is ${text.length} characters; very long queries can skew tuning metrics.`,
      index,
      id
    });
  }

  const sourceItemIds = normalizeSourceItemIds(value, index, id, problems);
  const query: TuningQuery = {
    id: id ?? `q_${String(index + 1).padStart(4, '0')}`,
    text,
    type: typeof value.type === 'string' ? value.type : typeof value.query_type === 'string' ? value.query_type : undefined,
    intent: typeof value.intent === 'string' ? value.intent : typeof value.expected_intent === 'string' ? value.expected_intent : undefined,
    sourceItemIds
  };
  return { query, problems };
}

function normalizeSourceItemIds(
  value: Record<string, unknown>,
  index: number,
  id: string | undefined,
  problems: QueryValidationProblem[]
): string[] | undefined {
  const raw = Array.isArray(value.sourceItemIds) ? value.sourceItemIds : Array.isArray(value.source_item_ids) ? value.source_item_ids : undefined;
  if (raw === undefined) return undefined;
  const normalized = raw
    .map(item => {
      if (typeof item === 'string' || typeof item === 'number') return String(item).trim();
      problems.push({
        severity: 'warning',
        code: 'invalid_source_item_id',
        message: 'sourceItemIds should contain only strings or numbers.',
        index,
        id
      });
      return '';
    })
    .filter(Boolean);
  if (normalized.length === 0) {
    problems.push({
      severity: 'warning',
      code: 'empty_source_item_ids',
      message: 'sourceItemIds is present but empty; source-item silver-label evaluation cannot use this query.',
      index,
      id
    });
  }
  return normalized;
}

function markDuplicateIds(queries: TuningQuery[], problems: QueryValidationProblem[]): number {
  const seen = new Map<string, number>();
  let duplicateCount = 0;
  queries.forEach((query, index) => {
    const previous = seen.get(query.id);
    if (previous !== undefined) {
      duplicateCount += 1;
      problems.push({
        severity: 'error',
        code: 'duplicate_id',
        message: `Duplicate query id '${query.id}' also appears at index ${previous}.`,
        index,
        id: query.id
      });
      return;
    }
    seen.set(query.id, index);
  });
  return duplicateCount;
}

function markDuplicateTexts(queries: TuningQuery[], problems: QueryValidationProblem[]): number {
  const seen = new Map<string, number>();
  let duplicateCount = 0;
  queries.forEach((query, index) => {
    const key = normalizeQueryText(query.text);
    const previous = seen.get(key);
    if (previous !== undefined) {
      duplicateCount += 1;
      problems.push({
        severity: 'warning',
        code: 'duplicate_text',
        message: `Duplicate query text also appears at index ${previous}.`,
        index,
        id: query.id
      });
      return;
    }
    seen.set(key, index);
  });
  return duplicateCount;
}

function addDistributionWarnings(queries: TuningQuery[], evaluatedRawCount: number, problems: QueryValidationProblem[]): void {
  if (queries.length === 0) return;
  if (queries.length < 20) {
    problems.push({
      severity: 'warning',
      code: 'small_query_set',
      message: `Only ${queries.length} valid queries were found; first-pass tuning is possible, but high-confidence tuning usually needs more coverage.`
    });
  }
  const sourceItemQueryCount = queries.filter(query => (query.sourceItemIds ?? []).length > 0).length;
  if (sourceItemQueryCount > 0 && sourceItemQueryCount < queries.length) {
    problems.push({
      severity: 'warning',
      code: 'partial_source_item_coverage',
      message: `${sourceItemQueryCount}/${queries.length} valid queries have sourceItemIds; use LLM judging or accept mixed coverage risk.`
    });
  }
  if (evaluatedRawCount > 0 && queries.length / evaluatedRawCount < 0.8) {
    problems.push({
      severity: 'warning',
      code: 'low_valid_ratio',
      message: `${queries.length}/${evaluatedRawCount} evaluated entries are valid queries.`
    });
  }
  const typeCounts = countBy(queries.map(query => query.type ?? 'unknown'));
  const largestType = Object.entries(typeCounts).sort((left, right) => right[1] - left[1])[0];
  if (largestType && largestType[1] / queries.length >= 0.8 && queries.length >= 10) {
    problems.push({
      severity: 'warning',
      code: 'query_type_skew',
      message: `Query type '${largestType[0]}' accounts for ${largestType[1]}/${queries.length} queries; metrics may be biased toward this type.`
    });
  }
}

function detectFormat(filePath: string): QueryValidationResult['format'] {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') return 'csv';
  if (ext === '.jsonl' || ext === '.ndjson') return 'jsonl';
  if (ext === '.json') return 'json';
  return 'unknown';
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function normalizeQueryText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
