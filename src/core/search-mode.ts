// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

export const SEARCH_MODE_ENUM = {
  ModeUnknown: 0,
  Balanced: 1,
  SemanticPriority: 2,
  KeywordPriority: 3,
  UserDefined: 4
} as const;

export const SEARCH_MODE_LABELS: Record<keyof typeof SEARCH_MODE_ENUM, string> = {
  ModeUnknown: 'unknown',
  Balanced: 'balanced retrieval',
  SemanticPriority: 'semantic retrieval priority',
  KeywordPriority: 'keyword retrieval priority',
  UserDefined: 'user-defined retrieval weights'
};

export type SearchModeName = keyof typeof SEARCH_MODE_ENUM;
export type SearchModeValue = (typeof SEARCH_MODE_ENUM)[SearchModeName];
export type SearchMode = Exclude<SearchModeName, 'ModeUnknown'>;

export const USER_DEFINED_RECALL_MODE_ENUM = {
  KeywordSemantic: 0,
  KeywordOnly: 1,
  SemanticOnly: 2
} as const;

export const USER_DEFINED_RECALL_MODE_LABELS: Record<keyof typeof USER_DEFINED_RECALL_MODE_ENUM, string> = {
  KeywordSemantic: 'keyword + semantic retrieval',
  KeywordOnly: 'keyword-only retrieval',
  SemanticOnly: 'semantic-only retrieval'
};

export type UserDefinedRecallModeName = keyof typeof USER_DEFINED_RECALL_MODE_ENUM;
export type UserDefinedRecallModeValue = (typeof USER_DEFINED_RECALL_MODE_ENUM)[UserDefinedRecallModeName];

const SEARCH_MODE_VALUES = new Set<number>(Object.values(SEARCH_MODE_ENUM));
const USER_DEFINED_RECALL_MODE_VALUES = new Set<number>(Object.values(USER_DEFINED_RECALL_MODE_ENUM));

function normalizeEnumNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    return Number.parseInt(value.trim(), 10);
  }
  return undefined;
}

export function normalizeSearchMode(value: unknown): SearchModeValue | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed in SEARCH_MODE_ENUM) {
      return SEARCH_MODE_ENUM[trimmed as SearchModeName];
    }
  }
  const numeric = normalizeEnumNumber(value);
  if (numeric !== undefined && SEARCH_MODE_VALUES.has(numeric)) {
    return numeric as SearchModeValue;
  }
  return undefined;
}

export function normalizeUserDefinedRecallMode(value: unknown): UserDefinedRecallModeValue | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed in USER_DEFINED_RECALL_MODE_ENUM) {
      return USER_DEFINED_RECALL_MODE_ENUM[trimmed as UserDefinedRecallModeName];
    }
  }
  const numeric = normalizeEnumNumber(value);
  if (numeric !== undefined && USER_DEFINED_RECALL_MODE_VALUES.has(numeric)) {
    return numeric as UserDefinedRecallModeValue;
  }
  return undefined;
}

export function describeSearchModeOptions(): string {
  return Object.entries(SEARCH_MODE_ENUM)
    .map(([name, value]) => `${name}(${value}, ${SEARCH_MODE_LABELS[name as SearchModeName]})`)
    .join(', ');
}

export function describeUserDefinedRecallModeOptions(): string {
  return Object.entries(USER_DEFINED_RECALL_MODE_ENUM)
    .map(
      ([name, value]) =>
        `${name}(${value}, ${USER_DEFINED_RECALL_MODE_LABELS[name as UserDefinedRecallModeName]})`
    )
    .join(', ');
}
