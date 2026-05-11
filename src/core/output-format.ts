// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

export type OutputFormat = 'json' | 'table' | 'yaml' | 'pretty' | 'ndjson' | 'csv';

export interface OutputOptions {
  format: OutputFormat;
  jq?: string;
  outputPath?: string;
}

const OUTPUT_FORMATS: OutputFormat[] = ['json', 'table', 'yaml', 'pretty', 'ndjson', 'csv'];

const OUTPUT_FLAG_TO_FORMAT: Array<[string, OutputFormat]> = [
  ['--json', 'json'],
  ['--table', 'table'],
  ['--yaml', 'yaml'],
  ['--pretty', 'pretty'],
  ['--ndjson', 'ndjson'],
  ['--csv', 'csv']
];

const PRIMARY_COLLECTION_KEYS = [
  'items',
  'entries',
  'checks',
  'schemas',
  'consoleTopActions',
  'Applications',
  'applications',
  'Datasets',
  'datasets',
  'List',
  'list',
  'Rules',
  'rules',
  'Scenes',
  'scenes',
  'skills'
];

const ENVELOPE_KEYS = ['response', 'Response', 'data', 'Data', 'result', 'Result'];

export function resolveRequestedOutputFormat(argv: string[] = process.argv.slice(2)): OutputFormat {
  return resolveOutputOptions(argv).format;
}

export function resolveOutputOptions(argv: string[] = process.argv.slice(2)): OutputOptions {
  let format: OutputFormat = 'json';
  let jq: string | undefined;
  let outputPath: string | undefined;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    const matchedFlag = OUTPUT_FLAG_TO_FORMAT.find(([flag]) => flag === token);
    if (matchedFlag) {
      format = matchedFlag[1];
      continue;
    }

    if (token.startsWith('--format=')) {
      format = parseOutputFormat(token.slice('--format='.length));
      continue;
    }

    if (token === '--format') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error('Missing value for --format.');
      }
      format = parseOutputFormat(next);
      index += 1;
      continue;
    }

    if (token.startsWith('--jq=')) {
      jq = token.slice('--jq='.length);
      continue;
    }

    if (token.startsWith('-q=')) {
      jq = token.slice('-q='.length);
      continue;
    }

    if (token === '--jq' || token === '-q') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error(`Missing value for ${token}.`);
      }
      jq = next;
      index += 1;
      continue;
    }

    if (token.startsWith('--output=')) {
      outputPath = token.slice('--output='.length);
      continue;
    }

    if (token.startsWith('-o=')) {
      outputPath = token.slice('-o='.length);
      continue;
    }

    if (token === '--output' || token === '-o') {
      const next = argv[index + 1];
      if (!next) {
        throw new Error(`Missing value for ${token}.`);
      }
      outputPath = next;
      index += 1;
      continue;
    }
  }

  return { format, jq, outputPath };
}

export function hasExplicitOutputFormatFlag(argv: string[] = process.argv.slice(2)): boolean {
  return argv.some(token => token === '--format' || token.startsWith('--format=') || OUTPUT_FLAG_TO_FORMAT.some(([flag]) => flag === token));
}

export async function printOutput(value: unknown, argv: string[] = process.argv.slice(2)): Promise<void> {
  const resolved = await Promise.resolve(value);
  const options = resolveOutputOptions(argv);
  const transformed = options.jq ? applyBasicJqSelector(resolved, options.jq) : resolved;
  const rendered = `${formatOutput(transformed, options.format)}\n`;

  if (options.outputPath) {
    const absolutePath = path.resolve(options.outputPath);
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, rendered, 'utf8');
    return;
  }

  process.stdout.write(rendered);
}

export function formatOutput(value: unknown, format: OutputFormat): string {
  switch (format) {
    case 'table':
      return formatAsTable(preferCollection(value));
    case 'yaml':
      return formatAsYaml(value);
    case 'pretty':
      return formatAsPretty(value);
    case 'ndjson':
      return formatAsNdjson(preferCollection(value));
    case 'csv':
      return formatAsCsv(preferCollection(value));
    case 'json':
    default:
      return stringifyJson(value);
  }
}

function parseOutputFormat(value: string): OutputFormat {
  if ((OUTPUT_FORMATS as string[]).includes(value)) {
    return value as OutputFormat;
  }
  throw new Error(`Unsupported output format: ${value}. Use one of: ${OUTPUT_FORMATS.join(', ')}`);
}

function formatAsPretty(value: unknown): string {
  const collection = preferCollection(value);
  if (collection !== value) {
    return formatAsTable(collection);
  }

  if (Array.isArray(value)) {
    return formatAsTable(value);
  }

  if (isFlatRecord(value)) {
    return renderKeyValueTable(value);
  }

  if (isRecord(value)) {
    return formatAsYaml(value);
  }

  return stringifyScalar(value);
}

function formatAsTable(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '(empty)';
    }
    if (value.every(isRecord)) {
      return renderObjectArrayTable(value);
    }
    return renderScalarArrayTable(value);
  }

  if (isRecord(value)) {
    return renderKeyValueTable(value);
  }

  return stringifyScalar(value);
}

function renderObjectArrayTable(rows: Array<Record<string, unknown>>): string {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) {
        columns.push(key);
      }
    }
  }

  const body = rows.map(row => columns.map(column => stringifyCell(row[column])));
  return renderTable(columns, body);
}

function renderScalarArrayTable(values: unknown[]): string {
  const rows = values.map((value, index) => [String(index), stringifyCell(value)]);
  return renderTable(['index', 'value'], rows);
}

function renderKeyValueTable(record: Record<string, unknown>): string {
  const rows = Object.entries(record).map(([key, value]) => [key, stringifyCell(value)]);
  if (rows.length === 0) {
    return '(empty)';
  }
  return renderTable(['field', 'value'], rows);
}

function renderTable(headers: string[], rows: string[][]): string {
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map(row => (row[index] ?? '').length))
  );

  const renderRow = (row: string[]) =>
    row
      .map((cell, index) => (cell ?? '').padEnd(widths[index]))
      .join(' | ')
      .trimEnd();

  const divider = widths.map(width => '-'.repeat(width)).join('-+-');

  return [renderRow(headers), divider, ...rows.map(renderRow)].join('\n');
}

function formatAsYaml(value: unknown): string {
  return renderYaml(value, 0);
}

function renderYaml(value: unknown, indent: number): string {
  if (isScalar(value)) {
    return scalarToYaml(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }

    return value
      .map(item => {
        if (isScalar(item) || isEmptyContainer(item)) {
          return `${pad(indent)}- ${renderYaml(item, indent + 2)}`;
        }
        return `${pad(indent)}-\n${renderYaml(item, indent + 2)}`;
      })
      .join('\n');
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return '{}';
    }

    return entries
      .map(([key, inner]) => {
        if (isScalar(inner) || isEmptyContainer(inner)) {
          return `${pad(indent)}${key}: ${renderYaml(inner, indent + 2)}`;
        }
        return `${pad(indent)}${key}:\n${renderYaml(inner, indent + 2)}`;
      })
      .join('\n');
  }

  return scalarToYaml(value);
}

function formatAsNdjson(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '';
    }
    return value.map(item => stringifyJson(item, false)).join('\n');
  }
  return stringifyJson(value, false);
}

function formatAsCsv(value: unknown): string {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '';
    }
    if (value.every(isRecord)) {
      return renderObjectArrayCsv(value);
    }
    return renderScalarArrayCsv(value);
  }

  if (isRecord(value)) {
    return renderObjectArrayCsv([value]);
  }

  return renderScalarArrayCsv([value]);
}

function renderObjectArrayCsv(rows: Array<Record<string, unknown>>): string {
  const columns: string[] = [];
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (!columns.includes(key)) {
        columns.push(key);
      }
    }
  }

  const body = rows.map(row => columns.map(column => csvEscape(stringifyCell(row[column]))));
  return [columns.map(csvEscape).join(','), ...body.map(row => row.join(','))].join('\n');
}

function renderScalarArrayCsv(values: unknown[]): string {
  const rows = values.map((value, index) => [csvEscape(String(index)), csvEscape(stringifyCell(value))]);
  return [['index', 'value'].map(csvEscape).join(','), ...rows.map(row => row.join(','))].join('\n');
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function scalarToYaml(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();
  return stringifyJson(value, false);
}

function stringifyCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.replace(/\n/g, '\\n');
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value === 'bigint') return value.toString();
  return stringifyJson(value, false);
}

function stringifyScalar(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value === null || value === undefined) return '';
  if (typeof value === 'bigint') return value.toString();
  return stringifyJson(value);
}

function stringifyJson(value: unknown, pretty = true): string {
  return JSON.stringify(
    value,
    (_key, inner) => (typeof inner === 'bigint' ? inner.toString() : inner),
    pretty ? 2 : 0
  );
}

function preferCollection(value: unknown): unknown {
  return extractPrimaryCollection(value) ?? value;
}

function extractPrimaryCollection(value: unknown): unknown[] | undefined {
  if (Array.isArray(value)) return value;
  if (!isRecord(value)) return undefined;

  for (const key of PRIMARY_COLLECTION_KEYS) {
    const candidate = value[key];
    if (Array.isArray(candidate)) {
      return candidate;
    }
  }

  for (const key of ENVELOPE_KEYS) {
    const candidate = value[key];
    const extracted = extractPrimaryCollection(candidate);
    if (extracted) {
      return extracted;
    }
  }

  return undefined;
}

function applyBasicJqSelector(value: unknown, expression: string): unknown {
  const normalized = expression.trim();
  if (!normalized || normalized === '.') {
    return value;
  }
  if (!normalized.startsWith('.')) {
    throw new Error(`Unsupported --jq expression: ${expression}. Only basic selectors like .checks[] or .response.Result are supported.`);
  }

  let cursor: unknown[] = [value];
  let index = 0;
  while (index < normalized.length) {
    if (normalized.startsWith('[]', index)) {
      cursor = expandArrayCursor(cursor);
      index += 2;
      continue;
    }

    if (normalized[index] === '.') {
      index += 1;
      const matched = /^[A-Za-z0-9_-]+/.exec(normalized.slice(index));
      if (!matched) {
        throw new Error(`Unsupported --jq expression: ${expression}. Only dotted field access and [] expansion are supported.`);
      }
      cursor = readPropertyCursor(cursor, matched[0]);
      index += matched[0].length;
      continue;
    }

    throw new Error(`Unsupported --jq expression: ${expression}. Only dotted field access and [] expansion are supported.`);
  }

  if (cursor.length === 0) return null;
  if (cursor.length === 1) return cursor[0];
  return cursor;
}

function readPropertyCursor(values: unknown[], key: string): unknown[] {
  const next: unknown[] = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isRecord(item) && key in item) {
          next.push(item[key]);
        }
      }
      continue;
    }
    if (isRecord(value) && key in value) {
      next.push(value[key]);
    }
  }
  return next;
}

function expandArrayCursor(values: unknown[]): unknown[] {
  const next: unknown[] = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      next.push(...value);
    }
  }
  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFlatRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.values(value).every(inner => isScalar(inner) || isEmptyContainer(inner));
}

function isScalar(value: unknown): boolean {
  return (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'bigint'
  );
}

function isEmptyContainer(value: unknown): boolean {
  return (Array.isArray(value) && value.length === 0) || (isRecord(value) && Object.keys(value).length === 0);
}

function pad(indent: number): string {
  return ' '.repeat(indent);
}
