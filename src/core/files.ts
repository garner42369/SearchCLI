// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SearchCase } from './types';

const legacyBuildTypeColumn = '\u6784\u5efa\u7c7b\u578b';
const legacyAuthorColumn = '\u63d0\u4f9b\u4eba';

export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true });
}

export async function loadJsonOrJsonl<T>(filePath: string): Promise<T[]> {
  const content = await readFile(filePath, 'utf8');
  const trimmed = content.trim();
  if (trimmed.length === 0) return [];
  if (trimmed.startsWith('[')) {
    return JSON.parse(trimmed) as T[];
  }

  return trimmed
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => JSON.parse(line) as T);
}

export async function loadSearchCases(filePath: string): Promise<SearchCase[]> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') {
    return loadSearchCasesFromCsv(filePath);
  }
  return loadJsonOrJsonl<SearchCase>(filePath);
}

export async function loadOptionalJson<T>(filePath?: string): Promise<T | undefined> {
  if (!filePath) return undefined;
  const content = await readFile(filePath, 'utf8');
  return JSON.parse(content) as T;
}

export async function writeText(filePath: string, content: string): Promise<void> {
  await ensureDir(path.dirname(filePath));
  await writeFile(filePath, content, 'utf8');
}

export async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

async function loadSearchCasesFromCsv(filePath: string): Promise<SearchCase[]> {
  const content = await readFile(filePath, 'utf8');
  const rows = parseCsvRecords(content);

  return rows
    .map((row, index) => {
      const queryText = row.text?.trim();
      if (!queryText) return null;

      const relevanceTiers = parseContextTiers(row.context);
      const expectedIds = [...new Set(relevanceTiers.flat())];

      const searchCase: SearchCase = {
        id: row.row_id?.trim() || `csv-${index + 1}`,
        query: {
          text: queryText
        },
        expected_ids: expectedIds,
        relevance_tiers: relevanceTiers,
        notes:
          row.build_type?.trim() ||
          row.author?.trim() ||
          row[legacyBuildTypeColumn]?.trim() ||
          row[legacyAuthorColumn]?.trim() ||
          undefined
      };

      return searchCase;
    })
    .filter((item): item is SearchCase => item !== null);
}

function parseCsvRecords(content: string): Record<string, string>[] {
  const normalized = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let index = 0; index < normalized.length; index += 1) {
    const char = normalized[index];
    const next = normalized[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        currentCell += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (!inQuotes && char === ',') {
      currentRow.push(currentCell.trim());
      currentCell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      currentRow.push(currentCell.trim());
      currentCell = '';
      if (currentRow.some(cell => cell.length > 0)) rows.push(currentRow);
      currentRow = [];
      continue;
    }

    currentCell += char;
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell.length > 0)) rows.push(currentRow);
  }

  if (rows.length === 0) return [];

  const headers = rows[0];
  return rows.slice(1).map(row => {
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = row[index] ?? '';
    });
    return record;
  });
}

function parseContextTiers(raw: string | undefined): string[][] {
  if (!raw || raw.trim().length === 0) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(Array.isArray)
      .map(group =>
        group
          .map(item => String(item).trim())
          .filter(Boolean)
      )
      .filter(group => group.length > 0);
  } catch {
    return [];
  }
}
