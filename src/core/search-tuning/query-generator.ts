// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { loadJsonOrJsonl } from '../files';
import { parseJsonResponse, requestChatCompletion, type LlmClientConfig } from '../llm-client';
import type { SearchCase } from '../types';
import { textRetrievableFields } from './inspect';
import type { TuningFieldContext, TuningQuery } from './types';

const QUERY_GENERATION_PROMPT = `You generate realistic text search queries for evaluating a search application.
Return only JSON. The JSON must be an array of objects with:
- id: stable string
- text: query text
- type: one of title_rewrite, category, attribute_combo, scenario_need, vague_natural_language
- intent: short explanation of the user intent
- sourceItemIds: array of source item ids when available

Generate exactly the requested count for this batch. Generate diverse queries grounded in the provided item samples. Do not invent hard attributes that are not supported by the samples. Avoid query texts listed in existing_query_texts.

If field_context.retrievable_field_only is true, generate queries only from field_context.text_retrievable_fields and the provided item samples. Image fields are media assets and must not be treated as text-searchable attributes.`;

export interface GenerateTuningQuerySetResult {
  queries: TuningQuery[];
  requestedQueryCount: number;
  actualQueryCount: number;
  shortfall: number;
  duplicateQueryCount: number;
  llmRequestCount: number;
  llmWallMs: number;
  warnings: string[];
}

export async function loadTuningQueries(filePath: string): Promise<TuningQuery[]> {
  const raw = await loadJsonOrJsonl<unknown>(filePath);
  return raw.map((entry, index) => normalizeQuery(entry, index)).filter((entry): entry is TuningQuery => Boolean(entry));
}

export async function generateTuningQueries(options: {
  llmConfig: LlmClientConfig;
  sampleItems: Array<Record<string, unknown>>;
  count: number;
  batchSize?: number;
  llmConcurrency?: number;
  fieldContext?: TuningFieldContext;
  retrievableFieldOnly?: boolean;
}): Promise<TuningQuery[]> {
  return (await generateTuningQuerySet(options)).queries;
}

export async function generateTuningQuerySet(options: {
  llmConfig: LlmClientConfig;
  sampleItems: Array<Record<string, unknown>>;
  count: number;
  batchSize?: number;
  llmConcurrency?: number;
  fieldContext?: TuningFieldContext;
  retrievableFieldOnly?: boolean;
}): Promise<GenerateTuningQuerySetResult> {
  if (options.sampleItems.length === 0) {
    throw new Error('Cannot generate queries because no dataset sample items were available. Pass --queries with a query file.');
  }
  const fieldContext = options.fieldContext;
  if (options.retrievableFieldOnly && !options.fieldContext) {
    throw new Error('Cannot generate retrievable-field-only queries because app dataset field config was not available.');
  }
  if (options.retrievableFieldOnly && fieldContext && textRetrievableFields(fieldContext).length === 0) {
    throw new Error('Cannot generate retrievable-field-only queries because GetAppDataConfig returned no text IndexFields.');
  }

  const requestedQueryCount = Math.max(1, Math.floor(options.count));
  const batchSize = Math.max(1, Math.floor(options.batchSize ?? 10));
  const llmConcurrency = Math.max(1, Math.floor(options.llmConcurrency ?? 100));
  const maxRequests = Math.max(Math.ceil(requestedQueryCount / batchSize) * 3, 1);
  const sampleItems = options.retrievableFieldOnly && fieldContext
    ? filterSampleItemsToTextRetrievableFields(options.sampleItems, fieldContext)
    : options.sampleItems;
  const fieldContextPayload = buildFieldContextPayload(fieldContext, Boolean(options.retrievableFieldOnly));
  const queries: TuningQuery[] = [];
  const seenTexts = new Set<string>();
  const warnings: string[] = [];
  let duplicateQueryCount = 0;
  let llmRequestCount = 0;
  let llmWallMs = 0;
  let nextBatchIndex = 1;

  while (queries.length < requestedQueryCount && llmRequestCount < maxRequests) {
    const remaining = requestedQueryCount - queries.length;
    const availableRequests = maxRequests - llmRequestCount;
    const batchCount = Math.min(llmConcurrency, availableRequests, Math.ceil(remaining / batchSize));
    const batchInputs = Array.from({ length: batchCount }, () => {
      const batchIndex = nextBatchIndex;
      nextBatchIndex += 1;
      return {
        batchIndex,
        count: Math.min(batchSize, requestedQueryCount - queries.length),
        itemSamples: pickSampleWindow(sampleItems, batchIndex, 20),
        existingQueryTexts: queries.map(query => query.text).slice(-50)
      };
    });

    const batchStartedAt = Date.now();
    const results = await Promise.allSettled(
      batchInputs.map(input =>
        requestChatCompletion(options.llmConfig, QUERY_GENERATION_PROMPT, {
          count: input.count,
          requested_total_count: requestedQueryCount,
          batch_index: input.batchIndex,
          item_samples: input.itemSamples,
          existing_query_texts: input.existingQueryTexts,
          field_context: fieldContextPayload
        })
      )
    );
    llmWallMs += Date.now() - batchStartedAt;
    llmRequestCount += batchInputs.length;

    for (let resultIndex = 0; resultIndex < results.length; resultIndex += 1) {
      const result = results[resultIndex];
      const batchIndex = batchInputs[resultIndex].batchIndex;
      if (result.status === 'rejected') {
        warnings.push(`query generation batch ${batchIndex} failed: ${formatError(result.reason)}`);
        continue;
      }
      const parsed = parseJsonResponse(result.value);
      const list = Array.isArray(parsed) ? parsed : isRecord(parsed) && Array.isArray(parsed.queries) ? parsed.queries : [];
      const normalized = list
        .map((entry, index) => normalizeQuery(entry, queries.length + index))
        .filter((entry): entry is TuningQuery => Boolean(entry));
      for (const query of normalized) {
        const textKey = normalizeQueryText(query.text);
        if (seenTexts.has(textKey)) {
          duplicateQueryCount += 1;
          continue;
        }
        seenTexts.add(textKey);
        queries.push({
          ...query,
          id: `query_${String(queries.length + 1).padStart(3, '0')}`
        });
        if (queries.length >= requestedQueryCount) break;
      }
    }
  }

  if (queries.length === 0) {
    throw new Error('LLM query generation returned no valid queries.');
  }
  if (queries.length < requestedQueryCount) {
    warnings.push(`requested ${requestedQueryCount} queries but generated ${queries.length} unique queries after ${llmRequestCount} LLM request(s).`);
  }
  if (duplicateQueryCount > 0) {
    warnings.push(`discarded ${duplicateQueryCount} duplicate generated query text(s).`);
  }

  return {
    queries: queries.slice(0, requestedQueryCount),
    requestedQueryCount,
    actualQueryCount: Math.min(queries.length, requestedQueryCount),
    shortfall: Math.max(0, requestedQueryCount - queries.length),
    duplicateQueryCount,
    llmRequestCount,
    llmWallMs,
    warnings
  };
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

export function filterSampleItemsToTextRetrievableFields(
  sampleItems: Array<Record<string, unknown>>,
  fieldContext: TuningFieldContext
): Array<Record<string, unknown>> {
  const allowedFields = textRetrievableFields(fieldContext);
  return sampleItems.map(item => {
    const filtered: Record<string, unknown> = {};
    if (item.item_id !== undefined) {
      filtered.item_id = item.item_id;
    }
    for (const field of allowedFields) {
      const value = readFieldValue(item, field);
      if (value !== undefined) {
        filtered[field] = value;
      }
    }
    return filtered;
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function pickSampleWindow(
  sampleItems: Array<Record<string, unknown>>,
  batchIndex: number,
  windowSize: number
): Array<Record<string, unknown>> {
  if (sampleItems.length <= windowSize) return sampleItems;
  const offset = ((batchIndex - 1) * windowSize) % sampleItems.length;
  const window = sampleItems.slice(offset, offset + windowSize);
  if (window.length >= windowSize) return window;
  return [...window, ...sampleItems.slice(0, windowSize - window.length)];
}

function buildFieldContextPayload(fieldContext: TuningFieldContext | undefined, retrievableFieldOnly: boolean): Record<string, unknown> | undefined {
  if (!fieldContext) return undefined;
  return {
    retrievable_field_only: retrievableFieldOnly,
    text_retrievable_fields: textRetrievableFields(fieldContext),
    filter_fields: fieldContext.filterFields,
    suggest_fields: fieldContext.suggestFields,
    field_descriptions: fieldContext.fieldDescriptions
  };
}

function readFieldValue(item: Record<string, unknown>, field: string): unknown {
  if (Object.prototype.hasOwnProperty.call(item, field)) {
    return item[field];
  }
  if (!field.includes('.')) {
    return undefined;
  }
  const segments = field.split('.').filter(Boolean);
  let current: unknown = item;
  for (const segment of segments) {
    if (!isRecord(current) || !Object.prototype.hasOwnProperty.call(current, segment)) {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function normalizeQueryText(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ');
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
