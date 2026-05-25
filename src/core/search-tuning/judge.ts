// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { parseJsonResponse, requestChatCompletion, type LlmClientConfig } from '../llm-client';
import type { SearchResultItem } from '../types';
import { sha256Hex } from './hash';
import type { ItemJudgeView, JudgeLabel, TuningJudgeInput, TuningQuery } from './types';

const TEXT_JUDGE_PROMPT = `You are judging text search relevance.
Only evaluate semantic and lexical relevance between the query and the item text. Ignore popularity, personalization, business rules, inventory, and operational promotion rules.

Use this grade rubric:
3 = highly relevant; the item fully satisfies the main query intent.
2 = relevant; the item satisfies the main intent but has missing or weak details.
1 = weakly relevant; the item only matches a broad category or a few terms.
0 = not relevant.

Return only JSON with: grade, confidence, reason. confidence must be between 0 and 1.`;

const TEXT_IMAGE_JUDGE_PROMPT = `You are judging text search relevance with optional item images.
Evaluate semantic, lexical, and visual relevance between the text query and the item. Use the item text and any provided images. Ignore popularity, personalization, business rules, inventory, and operational promotion rules.

Use this grade rubric:
3 = highly relevant; the item fully satisfies the main query intent.
2 = relevant; the item satisfies the main intent but has missing or weak details.
1 = weakly relevant; the item only matches a broad category or a few terms.
0 = not relevant.

Return only JSON with: grade, confidence, reason. confidence must be between 0 and 1.`;

export interface JudgeInputOptions {
  judgeInput: TuningJudgeInput;
  imageIndexFields?: string[];
  maxJudgeImages?: number;
}

export function buildJudgeProfileHash(llmConfig: LlmClientConfig, options: JudgeInputOptions): string {
  const prompt = options.judgeInput === 'text-image' ? TEXT_IMAGE_JUDGE_PROMPT : TEXT_JUDGE_PROMPT;
  return sha256Hex({
    prompt,
    judge_input: options.judgeInput,
    image_index_fields: options.judgeInput === 'text-image' ? [...(options.imageIndexFields ?? [])].sort() : [],
    max_judge_images: options.judgeInput === 'text-image' ? options.maxJudgeImages ?? 1 : 0,
    output_schema: {
      grade: 'integer 0..3',
      confidence: 'number 0..1',
      reason: 'string'
    },
    model: llmConfig.model
  });
}

export function buildItemJudgeView(item: SearchResultItem, options: JudgeInputOptions = { judgeInput: 'text' }): ItemJudgeView {
  const view: ItemJudgeView = {
    item_id: item.id,
    title: item.title,
    display_fields: compactDisplayFields(item.displayFields)
  };
  if (options.judgeInput === 'text-image') {
    const imageUrls = extractImageUrlsFromFields(item.displayFields, options.imageIndexFields ?? [], options.maxJudgeImages ?? 1);
    view.image_urls = imageUrls;
  }
  return view;
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
  const judgePrompt = Array.isArray(options.itemView.image_urls) ? TEXT_IMAGE_JUDGE_PROMPT : TEXT_JUDGE_PROMPT;
  const raw = await requestChatCompletion(
    options.llmConfig,
    judgePrompt,
    {
      query: {
        id: options.query.id,
        text: options.query.text,
        intent: options.query.intent
      },
      item: options.itemView
    },
    {
      imageUrls: options.itemView.image_urls
    }
  );
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

function extractImageUrlsFromFields(displayFields: Record<string, unknown>, imageIndexFields: string[], maxImages: number): string[] {
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const field of imageIndexFields) {
    collectImageUrls(displayFields[field], urls, seen);
    if (urls.length >= maxImages) break;
  }
  return urls.slice(0, maxImages);
}

function collectImageUrls(value: unknown, urls: string[], seen: Set<string>): void {
  if (urls.length >= 20) return;
  if (typeof value === 'string') {
    addImageUrl(value, urls, seen);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectImageUrls(item, urls, seen);
    }
    return;
  }
  if (isRecord(value)) {
    for (const key of ['url', 'image_url', 'imageUrl', 'uri']) {
      if (typeof value[key] === 'string') {
        addImageUrl(value[key], urls, seen);
      }
    }
  }
}

function addImageUrl(value: string, urls: string[], seen: Set<string>): void {
  const url = value.trim();
  if (!isSupportedImageUrl(url) || seen.has(url)) return;
  seen.add(url);
  urls.push(url);
}

function isSupportedImageUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value) || /^data:image\//iu.test(value);
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
