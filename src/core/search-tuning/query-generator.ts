// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { loadJsonOrJsonl } from '../files';
import { parseJsonResponse, requestChatCompletion, type LlmClientConfig } from '../llm-client';
import type { SearchCase } from '../types';
import type { TuningQuery } from './types';

const QUERY_GENERATION_PROMPT = `You generate realistic text search queries for evaluating a search application.
Return only JSON. The JSON must be an array of objects with:
- id: stable string
- text: query text
- type: one of title_rewrite, category, attribute_combo, scenario_need, vague_natural_language
- intent: short explanation of the user intent
- sourceItemIds: array of source item ids when available

Generate diverse queries grounded in the provided item samples. Do not invent hard attributes that are not supported by the samples.`;

export async function loadTuningQueries(filePath: string): Promise<TuningQuery[]> {
  const raw = await loadJsonOrJsonl<unknown>(filePath);
  return raw.map((entry, index) => normalizeQuery(entry, index)).filter((entry): entry is TuningQuery => Boolean(entry));
}

export async function generateTuningQueries(options: {
  llmConfig: LlmClientConfig;
  sampleItems: Array<Record<string, unknown>>;
  count: number;
}): Promise<TuningQuery[]> {
  if (options.sampleItems.length === 0) {
    throw new Error('Cannot generate queries because no dataset sample items were available. Pass --queries with a query file.');
  }

  const raw = await requestChatCompletion(options.llmConfig, QUERY_GENERATION_PROMPT, {
    count: options.count,
    item_samples: options.sampleItems.slice(0, 20)
  });
  const parsed = parseJsonResponse(raw);
  const list = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.queries) ? parsed.queries : [];
  const queries = list.map((entry, index) => normalizeQuery(entry, index)).filter((entry): entry is TuningQuery => Boolean(entry));
  if (queries.length === 0) {
    throw new Error('LLM query generation returned no valid queries.');
  }
  return queries.slice(0, options.count);
}

function normalizeQuery(value: unknown, index: number): TuningQuery | undefined {
  if (!isRecord(value)) return undefined;
  const text =
    typeof value.text === 'string'
      ? value.text.trim()
      : isRecord(value.query) && typeof value.query.text === 'string'
      ? value.query.text.trim()
      : undefined;
  if (!text) return undefined;

  const sourceItemIds = Array.isArray(value.sourceItemIds)
    ? value.sourceItemIds.map(item => String(item)).filter(Boolean)
    : Array.isArray(value.source_item_ids)
    ? value.source_item_ids.map(item => String(item)).filter(Boolean)
    : undefined;

  return {
    id: typeof value.id === 'string' && value.id.trim() ? value.id.trim() : `q_${String(index + 1).padStart(4, '0')}`,
    text,
    type: typeof value.type === 'string' ? value.type : typeof value.query_type === 'string' ? value.query_type : undefined,
    intent: typeof value.intent === 'string' ? value.intent : typeof value.expected_intent === 'string' ? value.expected_intent : undefined,
    sourceItemIds
  };
}

export function searchCaseToTuningQuery(searchCase: SearchCase, index: number): TuningQuery | undefined {
  const text = searchCase.query.text?.trim();
  if (!text) return undefined;
  return {
    id: searchCase.id ?? `q_${String(index + 1).padStart(4, '0')}`,
    text,
    intent: searchCase.notes
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
