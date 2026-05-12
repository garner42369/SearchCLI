// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureDir } from '../files';
import type { JudgeLabel } from './types';
import { sha256Hex } from './hash';

export interface LabelCache {
  path: string;
  labels: Map<string, JudgeLabel>;
}

export async function loadLabelCache(filePath: string): Promise<LabelCache> {
  const labels = new Map<string, JudgeLabel>();
  try {
    const raw = await readFile(filePath, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const parsed = JSON.parse(trimmed) as JudgeLabel;
      if (parsed.cache_key) {
        labels.set(parsed.cache_key, parsed);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  return { path: filePath, labels };
}

export async function appendLabel(cache: LabelCache, label: JudgeLabel): Promise<void> {
  cache.labels.set(label.cache_key, label);
  await ensureDir(path.dirname(cache.path));
  await appendFile(cache.path, `${JSON.stringify(label)}\n`, 'utf8');
}

export function buildLabelCacheKey(input: {
  datasetId: string;
  queryHash: string;
  itemId: string;
  itemViewHash: string;
  judgeProfileHash: string;
}): string {
  return sha256Hex({
    dataset_id: input.datasetId,
    query_hash: input.queryHash,
    item_id: input.itemId,
    item_view_hash: input.itemViewHash,
    judge_profile_hash: input.judgeProfileHash
  });
}
