// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { parseJsonResponse, requestChatCompletion, type LlmClientConfig } from '../llm-client';
import type { SearchResultItem } from '../types';
import { sha256Hex } from './hash';
import type { ItemJudgeView, JudgeLabel, TuningQuery } from './types';

const JUDGE_PROMPT = `You are judging text search relevance.
Only evaluate semantic and lexical relevance between the query and the item. Ignore popularity, personalization, business rules, inventory, and operational promotion rules.

Use this grade rubric:
3 = highly relevant; the item fully satisfies the main query intent.
2 = relevant; the item satisfies the main intent but has missing or weak details.
1 = weakly relevant; the item only matches a broad category or a few terms.
0 = not relevant.

Return only JSON with: grade, confidence, reason. confidence must be between 0 and 1.`;

export function buildJudgeProfileHash(llmConfig: LlmClientConfig): string {
  return sha256Hex({
    prompt: JUDGE_PROMPT,
    output_schema: {
      grade: 'integer 0..3',
      confidence: 'number 0..1',
      reason: 'string'
    },
    model: llmConfig.model
  });
}

export function buildItemJudgeView(item: SearchResultItem): ItemJudgeView {
  return {
    item_id: item.id,
    title: item.title,
    display_fields: compactDisplayFields(item.displayFields)
  };
}

export async function judgeRelevance(options: {
  llmConfig: LlmClientConfig;
  datasetId: string;
  query: TuningQuery;
  queryHash: string;
  itemView: ItemJudgeView;
  itemViewHash: string;
  judgeProfileHash: string;
  cacheKey: string;
}): Promise<JudgeLabel> {
  const raw = await requestChatCompletion(options.llmConfig, JUDGE_PROMPT, {
    query: {
      id: options.query.id,
      text: options.query.text,
      intent: options.query.intent
    },
    item: options.itemView
  });
  const parsed = parseJsonResponse(raw);
  const record = isRecord(parsed) ? parsed : {};

  return {
    cache_key: options.cacheKey,
    dataset_id: options.datasetId,
    query_hash: options.queryHash,
    item_id: options.itemView.item_id,
    item_view_hash: options.itemViewHash,
    judge_profile_hash: options.judgeProfileHash,
    query_text: options.query.text,
    item_view: options.itemView,
    grade: clampInteger(record.grade, 0, 3),
    confidence: clampNumber(record.confidence, 0, 1),
    reason: typeof record.reason === 'string' ? record.reason : undefined,
    llm_model: options.llmConfig.model,
    created_at: new Date().toISOString()
  };
}

function compactDisplayFields(displayFields: Record<string, unknown>): Record<string, unknown> {
  const preferredKeys = [
    'title',
    'name',
    'item_title',
    'content_title',
    'category',
    'brand',
    'tags',
    'description',
    'summary',
    'content'
  ];
  const output: Record<string, unknown> = {};
  for (const key of preferredKeys) {
    if (displayFields[key] !== undefined) {
      output[key] = compactValue(displayFields[key]);
    }
  }
  for (const [key, value] of Object.entries(displayFields)) {
    if (Object.keys(output).length >= 12) break;
    if (output[key] === undefined) {
      output[key] = compactValue(value);
    }
  }
  return output;
}

function compactValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value.length > 600 ? `${value.slice(0, 600)}...` : value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 20).map(compactValue);
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).slice(0, 20);
    return Object.fromEntries(entries.map(([key, entry]) => [key, compactValue(entry)]));
  }
  return value;
}

function clampInteger(value: unknown, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number.parseInt(String(value), 10);
  if (!Number.isFinite(numeric)) return min;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function clampNumber(value: unknown, min: number, max: number): number | undefined {
  if (value === undefined) return undefined;
  const numeric = typeof value === 'number' ? value : Number.parseFloat(String(value));
  if (!Number.isFinite(numeric)) return undefined;
  return Math.max(min, Math.min(max, numeric));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
