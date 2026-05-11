// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ensureDir, slugify, writeJson, writeText } from './files';

export type ItemSourceFormat = 'json' | 'jsonl' | 'csv';
export type ItemFieldType =
  | 'string'
  | 'int64'
  | 'float'
  | 'boolean'
  | 'array<string>'
  | 'array<int64>'
  | 'array<float>'
  | 'object'
  | 'array<object>';

export type ItemValidationSeverity = 'error' | 'warning';

export interface ItemCleanupSummary {
  trimmedStringValues: number;
  emptyStringValuesNormalized: number;
  specialValueNormalizations: number;
}

export interface ItemValidationIssue {
  severity: ItemValidationSeverity;
  code: string;
  field?: string;
  detail: string;
  affectedCount?: number;
  examples?: unknown[];
}

export interface ItemValidationSummary {
  totalRecords: number;
  cleanedRecords: number;
  blockingIssueCount: number;
  warningCount: number;
  missingPrimaryKeyCount: number;
  duplicatePrimaryKeyCount: number;
  missingTitleCount: number;
  mixedTypeFieldCount: number;
  emptyRecordCount: number;
}

export interface ItemValidationResult {
  ok: boolean;
  cleanup: ItemCleanupSummary;
  summary: ItemValidationSummary;
  issues: ItemValidationIssue[];
}

export interface ItemFieldProfile {
  sourceName: string;
  name: string;
  inferredType: ItemFieldType;
  nullable: boolean;
  missingCount: number;
  distinctCount: number;
  uniqueRatio: number;
  examples: unknown[];
  roles: string[];
  warnings: string[];
}

export interface ItemProfileResult {
  ok: true;
  source: {
    file: string;
    format: ItemSourceFormat;
    totalRecords: number;
    sampledRecords: number;
  };
  inferred: {
    primaryKeyField: string;
    syntheticPrimaryKey: boolean;
    titleField: string | null;
    indexFields: string[];
    filterFields: string[];
    suggestFields: string[];
    imageFields: string[];
  };
  sanitizedFields: Array<{
    sourceName: string;
    name: string;
  }>;
  fields: ItemFieldProfile[];
  warnings: string[];
  validation: ItemValidationResult;
  sample: Record<string, unknown>[];
}

export interface ItemPlanOptions {
  file: string;
  goal?: string;
  outputDir?: string;
  datasetName?: string;
  applicationName?: string;
  force?: boolean;
  projectName?: string;
}

export interface ItemPlanResult {
  ok: true;
  planDir: string;
  reportPath: string;
  planPath: string;
  generatedFiles: string[];
  profile: ItemProfileResult;
  plan: ItemPlanFile;
}

export interface ItemApplyPlanOptions {
  planDir: string;
  applicationId?: string;
  datasetId?: string;
  applicationName?: string;
  datasetName?: string;
  projectName?: string;
  waitReady?: boolean;
  runTrials?: boolean;
  searchQuery?: string;
  chatMessage?: string;
  confirmReview?: boolean;
  confirmRecommendEntryBinding?: boolean;
  force?: boolean;
  recommendSceneType?: string;
  recommendSceneName?: string;
  recommendBhvSceneTypes?: string[];
  recommendUserId?: string;
  recommendParentId?: string;
  dryRun?: boolean;
}

export interface ItemPlanFile {
  version: 1;
  createdAt: string;
  source: {
    file: string;
    format: ItemSourceFormat;
    totalRecords: number;
  };
  goal: string | null;
  names: {
    dataset: string;
    application: string;
  };
  inferred: ItemProfileResult['inferred'];
  warnings: string[];
  validation: ItemValidationResult;
  files: {
    normalizedItems: string;
    schema: string;
    fieldConfig: string;
    onlineConfig: string;
    validation: string;
    datasetCreate: string;
    appCreate: string;
    schemaCheck: string;
    searchSceneCreate: string;
    searchSceneUpdate: string;
    recommendSceneCreate: string;
    recommendSceneUpdate: string;
    report: string;
  };
  defaults: {
    searchQuery: string;
    chatMessage: string;
    search: {
      sceneName: string;
      sceneDescription: string;
      pageSize: number;
    };
    recommend: {
      sceneType: string;
      sceneName: string;
      sceneDescription: string;
      bhvSceneTypes: string[];
      pageSize: number;
      userId: string;
      parentItemId: string | null;
    };
  };
  reviewChecklist: string[];
}

interface LoadedItemSource {
  format: ItemSourceFormat;
  records: Array<Record<string, unknown>>;
  cleanup: ItemCleanupSummary;
}

interface SanitizedRecordSet {
  sanitizedFields: Array<{ sourceName: string; name: string }>;
  fieldMap: Map<string, string>;
  records: Array<Record<string, unknown>>;
}

const STRONG_PRIMARY_KEY_NAMES = [
  'item_id',
  'itemid',
  'id',
  'doc_id',
  'docid',
  'sku_id',
  'skuid',
  'product_id',
  'productid',
  'content_id',
  'contentid'
] as const;

const STRONG_TITLE_NAMES = [
  'title',
  'name',
  'item_name',
  'product_name',
  'doc_title',
  'subject'
] as const;

const STRONG_INDEX_NAMES = [
  'title',
  'name',
  'keywords',
  'abstract',
  'summary',
  'description',
  'desc',
  'content',
  'body',
  'brand',
  'category',
  'tags'
] as const;

const STRONG_FILTER_NAMES = [
  'category',
  'brand',
  'channel',
  'type',
  'status',
  'language',
  'creator',
  'operator',
  'region',
  'site',
  'shop'
] as const;

const STRONG_IMAGE_NAMES = ['image', 'image_url', 'image_urls', 'picture', 'cover', 'cover_url', 'thumbnail', 'icon'] as const;

const SYNTHETIC_PRIMARY_KEY = '_viking_item_id';

const DATASET_FIELD_TYPE_CODES: Record<ItemFieldType, number> = {
  string: 1,
  int64: 3,
  float: 4,
  boolean: 5,
  'array<string>': 6,
  'array<int64>': 8,
  'array<float>': 9,
  object: 10,
  'array<object>': 11
};

export async function buildItemProfile(filePath: string): Promise<ItemProfileResult> {
  const source = await loadItemSource(filePath);
  if (source.records.length === 0) {
    throw new Error(`No records found in ${filePath}.`);
  }

  const sanitized = sanitizeRecords(source.records);
  const profiled = profileSanitizedRecords(sanitized.records);
  const inference = inferRoles(profiled, sanitized.records);
  const normalizedRecords = applySyntheticPrimaryKeyIfNeeded(sanitized.records, inference.primaryKeyField, inference.syntheticPrimaryKey);
  const fields = attachFieldRoles(profiled, inference);
  const validation = buildValidationResult(fields, inference, normalizedRecords, source.cleanup);
  const warnings = collectProfileWarnings(fields, inference, sanitized.sanitizedFields, validation);

  return {
    ok: true,
    source: {
      file: path.resolve(filePath),
      format: source.format,
      totalRecords: source.records.length,
      sampledRecords: Math.min(source.records.length, 3)
    },
    inferred: {
      primaryKeyField: inference.primaryKeyField,
      syntheticPrimaryKey: inference.syntheticPrimaryKey,
      titleField: inference.titleField,
      indexFields: inference.indexFields,
      filterFields: inference.filterFields,
      suggestFields: inference.suggestFields,
      imageFields: inference.imageFields
    },
    sanitizedFields: sanitized.sanitizedFields,
    fields,
    warnings,
    validation,
    sample: normalizedRecords.slice(0, 3)
  };
}

export async function buildItemPlan(options: ItemPlanOptions): Promise<ItemPlanResult> {
  const profile = await buildItemProfile(options.file);
  const planDir =
    options.outputDir
      ? path.resolve(options.outputDir)
      : path.resolve('.viking', 'item-plans', `${slugify(path.parse(options.file).name || 'item-data') || 'item-data'}-${Date.now()}`);
  const names = {
    dataset: options.datasetName ?? `${slugify(path.parse(options.file).name || 'items') || 'items'}-dataset`,
    application: options.applicationName ?? `${slugify(path.parse(options.file).name || 'items') || 'items'}-app`
  };

  const normalizedItems = profile.sample.length > 0 ? await loadNormalizedItems(options.file, profile) : [];
  const schema = buildSchemaArtifact(profile);
  const fieldConfig = buildFieldConfigArtifact(profile);
  const onlineConfig: Record<string, unknown> = {};
  const defaults = buildDefaultTrials(profile);
  const validation = profile.validation;
  const searchSceneCreate = buildSearchSceneCreateArtifact(defaults);
  const searchSceneUpdate = buildSearchSceneUpdateArtifact(defaults);
  const recommendSceneCreate = buildRecommendSceneCreateArtifact(profile, defaults);
  const recommendSceneUpdate = buildRecommendSceneUpdateArtifact(defaults);
  const schemaCheck = {
    Type: 'item',
    Schema: schema,
    DataFieldConfig: fieldConfig,
    ProjectName: options.projectName
  };
  const datasetCreate = {
    Name: names.dataset,
    Type: 'item',
    Description: buildDatasetDescription(options.file, options.goal),
    Schema: schema,
    DataFieldConfig: fieldConfig
  };
  const appCreate = {
    Name: names.application,
    Industry: 1
  };

  const plan: ItemPlanFile = {
    version: 1,
    createdAt: new Date().toISOString(),
    source: {
      file: path.resolve(options.file),
      format: profile.source.format,
      totalRecords: profile.source.totalRecords
    },
    goal: options.goal ?? null,
    names,
    inferred: profile.inferred,
    warnings: profile.warnings,
    validation,
    files: {
      normalizedItems: 'normalized-items.json',
      schema: 'schema.json',
      fieldConfig: 'field-config.json',
      onlineConfig: 'online-config.json',
      validation: 'validation.json',
      datasetCreate: 'dataset-create.json',
      appCreate: 'app-create.json',
      schemaCheck: 'schema-check.json',
      searchSceneCreate: 'search-scene-create.json',
      searchSceneUpdate: 'search-scene-update.json',
      recommendSceneCreate: 'recommend-scene-create.json',
      recommendSceneUpdate: 'recommend-scene-update.json',
      report: 'report.md'
    },
    defaults,
    reviewChecklist: buildReviewChecklist(profile)
  };

  const reportPath = path.join(planDir, plan.files.report);
  const planPath = path.join(planDir, 'plan.json');
  const generatedFiles = [
    path.join(planDir, plan.files.normalizedItems),
    path.join(planDir, plan.files.schema),
    path.join(planDir, plan.files.fieldConfig),
    path.join(planDir, plan.files.onlineConfig),
    path.join(planDir, plan.files.validation),
    path.join(planDir, plan.files.datasetCreate),
    path.join(planDir, plan.files.appCreate),
    path.join(planDir, plan.files.schemaCheck),
    path.join(planDir, plan.files.searchSceneCreate),
    path.join(planDir, plan.files.searchSceneUpdate),
    path.join(planDir, plan.files.recommendSceneCreate),
    path.join(planDir, plan.files.recommendSceneUpdate),
    reportPath,
    planPath
  ];

  await ensureDir(planDir);
  await writeJson(path.join(planDir, plan.files.normalizedItems), normalizedItems);
  await writeJson(path.join(planDir, plan.files.schema), schema);
  await writeJson(path.join(planDir, plan.files.fieldConfig), fieldConfig);
  await writeJson(path.join(planDir, plan.files.onlineConfig), onlineConfig);
  await writeJson(path.join(planDir, plan.files.validation), validation);
  await writeJson(path.join(planDir, plan.files.datasetCreate), datasetCreate);
  await writeJson(path.join(planDir, plan.files.appCreate), appCreate);
  await writeJson(path.join(planDir, plan.files.schemaCheck), schemaCheck);
  await writeJson(path.join(planDir, plan.files.searchSceneCreate), searchSceneCreate);
  await writeJson(path.join(planDir, plan.files.searchSceneUpdate), searchSceneUpdate);
  await writeJson(path.join(planDir, plan.files.recommendSceneCreate), recommendSceneCreate);
  await writeJson(path.join(planDir, plan.files.recommendSceneUpdate), recommendSceneUpdate);
  await writeJson(planPath, plan);
  await writeText(reportPath, renderPlanReport(plan, profile));

  return {
    ok: true,
    planDir,
    reportPath,
    planPath,
    generatedFiles,
    profile,
    plan
  };
}

export async function loadItemPlan(planDir: string): Promise<{ planDir: string; plan: ItemPlanFile }> {
  const resolvedPlanDir = path.resolve(planDir);
  const planPath = path.join(resolvedPlanDir, 'plan.json');
  const raw = JSON.parse(await readFile(planPath, 'utf8')) as ItemPlanFile;
  return {
    planDir: resolvedPlanDir,
    plan: raw
  };
}

export async function loadPlanArtifact<T>(planDir: string, relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(planDir, relativePath), 'utf8')) as T;
}

export function buildApplyDryRunSummary(
  planDir: string,
  plan: ItemPlanFile,
  options: ItemApplyPlanOptions
): {
  ok: true;
  dryRun: true;
  planDir: string;
  applicationId: string | null;
  datasetId: string | null;
  steps: Array<{ step: string; action: string; payloadSource?: string; detail?: string }>;
  defaults: ItemPlanFile['defaults'];
  reviewChecklist: string[];
  validation: ItemValidationResult;
} {
  const recommendBootstrapReady = Array.isArray(options.recommendBhvSceneTypes) && options.recommendBhvSceneTypes.length > 0;
  const recommendEntryBindingConfirmed = options.confirmRecommendEntryBinding === true;
  return {
    ok: true,
    dryRun: true,
    planDir,
    applicationId: options.applicationId ?? null,
    datasetId: options.datasetId ?? null,
    steps: [
      {
        step: 'validation_gate',
        action: plan.validation.ok || options.force ? 'pass' : 'block apply until validation issues are fixed or --force is used',
        payloadSource: plan.files.validation,
        detail: `${plan.validation.summary.blockingIssueCount} blocking issues, ${plan.validation.summary.warningCount} warnings`
      },
      {
        step: 'review_confirmation',
        action: options.confirmReview
          ? 'pass'
          : 'block apply until schema, field attributes, display style, and index choices are confirmed with the user',
        detail: options.confirmReview
          ? 'Review confirmation acknowledged.'
          : 'Pass --confirm-review after the user confirms the generated plan.'
      },
      { step: 'schema_check', action: 'CheckDatasetSchema', payloadSource: plan.files.schemaCheck },
      { step: 'create_dataset', action: options.datasetId ? 'skip (use existing dataset)' : 'CreateDataset', payloadSource: plan.files.datasetCreate },
      { step: 'ingest_items', action: 'runtime dataWrite', payloadSource: plan.files.normalizedItems },
      { step: 'create_application', action: options.applicationId ? 'skip (use existing application)' : 'CreateApplication', payloadSource: plan.files.appCreate },
      { step: 'activate_application', action: 'BindAppDataset + UpdateAppDataConfig' },
      { step: 'wait_ready', action: options.waitReady ? 'poll app status until ready' : 'skip' },
      {
        step: 'search_scene_bootstrap',
        action: options.runTrials ? 'CreateSearchScene + update search scene + bind ChatConfig.SearchSceneID' : 'skip',
        payloadSource: plan.files.searchSceneCreate
      },
      { step: 'search_trial', action: options.runTrials ? `search "${options.searchQuery ?? plan.defaults.searchQuery}"` : 'skip' },
      { step: 'chat_trial', action: options.runTrials ? `chat "${options.chatMessage ?? plan.defaults.chatMessage}"` : 'skip' },
      {
        step: 'recommend_bootstrap',
        action: recommendBootstrapReady
          ? recommendEntryBindingConfirmed
            ? 'CreateRecommendScene + update recommend scene'
            : 'block recommend bootstrap until page/module binding is confirmed with the user'
          : 'skip',
        payloadSource: plan.files.recommendSceneCreate,
        detail: recommendBootstrapReady
          ? recommendEntryBindingConfirmed
            ? `scene=${options.recommendSceneName ?? plan.defaults.recommend.sceneName}, bhv_scene_types=${options.recommendBhvSceneTypes?.join(',')}`
            : 'Pass --confirm-recommend-entry-binding only after the user confirms which page or module this recommend scene belongs to.'
          : 'Pass --recommend-bhv-scene-types only after the user confirms the target page / module for recommend.'
      },
      {
        step: 'recommend_trial',
        action: options.runTrials && recommendBootstrapReady ? 'recommend runtime smoke (if recommend user/parent context is provided)' : 'skip',
        payloadSource: plan.files.recommendSceneUpdate
      }
    ],
    defaults: plan.defaults,
    reviewChecklist: plan.reviewChecklist,
    validation: plan.validation
  };
}

async function loadNormalizedItems(sourcePath: string, profile: ItemProfileResult): Promise<Record<string, unknown>[]> {
  const source = await loadItemSource(sourcePath);
  const sanitized = sanitizeRecords(source.records);
  return applySyntheticPrimaryKeyIfNeeded(sanitized.records, profile.inferred.primaryKeyField, profile.inferred.syntheticPrimaryKey);
}

async function loadItemSource(filePath: string): Promise<LoadedItemSource> {
  const absolutePath = path.resolve(filePath);
  const content = await readFile(absolutePath, 'utf8');
  const format = resolveSourceFormat(absolutePath, content);
  const cleanup = createCleanupSummary();

  if (format === 'csv') {
    return {
      format,
      records: parseCsvRecords(content).map(record => normalizeRawRecord(record, cleanup)),
      cleanup
    };
  }

  if (format === 'jsonl') {
    const records = content
      .split(/\r?\n/u)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => JSON.parse(line) as unknown)
      .map(value => normalizeRawRecord(value, cleanup))
      .filter(isRecord);
    return { format, records, cleanup };
  }

  const parsed = JSON.parse(content) as unknown;
  const extracted = extractRecordArray(parsed).map(value => normalizeRawRecord(value, cleanup));
  return { format, records: extracted, cleanup };
}

function resolveSourceFormat(filePath: string, content: string): ItemSourceFormat {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.csv') return 'csv';
  if (ext === '.jsonl' || ext === '.ndjson') return 'jsonl';
  if (ext === '.json') {
    const trimmed = content.trim();
    if (!trimmed.startsWith('[') && trimmed.split(/\r?\n/u).length > 1) {
      const firstLine = trimmed.split(/\r?\n/u)[0]?.trim();
      if (firstLine?.startsWith('{')) {
        return 'jsonl';
      }
    }
    return 'json';
  }
  const trimmed = content.trim();
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) return 'json';
  return 'csv';
}

function extractRecordArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) {
    return value.filter(isRecord);
  }

  if (isRecord(value)) {
    for (const key of ['items', 'records', 'data', 'list', 'fields']) {
      const candidate = value[key];
      if (Array.isArray(candidate) && candidate.every(isRecord)) {
        return candidate;
      }
    }
  }

  throw new Error('Structured item onboarding expects a JSON array, JSONL objects, CSV rows, or an object containing items/records/data/list.');
}

function normalizeRawRecord(value: unknown, cleanup: ItemCleanupSummary): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error('Item onboarding only supports object records.');
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeSpecialValue(entry, cleanup)])
  );
}

function normalizeSpecialValue(value: unknown, cleanup: ItemCleanupSummary): unknown {
  if (Array.isArray(value)) {
    return value.map(item => normalizeSpecialValue(item, cleanup));
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed !== value) {
      cleanup.trimmedStringValues += 1;
    }
    if (trimmed.length === 0) {
      cleanup.emptyStringValuesNormalized += 1;
      return null;
    }
    return trimmed;
  }

  if (!isRecord(value)) {
    return value;
  }

  const keys = Object.keys(value);
  if (keys.length === 1) {
    if (keys[0] === '$numberInt' || keys[0] === '$numberLong') {
      const parsed = Number.parseInt(String(value[keys[0]]), 10);
      if (Number.isFinite(parsed)) {
        cleanup.specialValueNormalizations += 1;
        return parsed;
      }
    }
    if (keys[0] === '$numberDouble' || keys[0] === '$numberDecimal') {
      const parsed = Number.parseFloat(String(value[keys[0]]));
      if (Number.isFinite(parsed)) {
        cleanup.specialValueNormalizations += 1;
        return parsed;
      }
    }
    if (keys[0] === '$date') {
      cleanup.specialValueNormalizations += 1;
      return String(value.$date);
    }
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeSpecialValue(entry, cleanup)])
  );
}

function createCleanupSummary(): ItemCleanupSummary {
  return {
    trimmedStringValues: 0,
    emptyStringValuesNormalized: 0,
    specialValueNormalizations: 0
  };
}

function sanitizeRecords(records: Array<Record<string, unknown>>): SanitizedRecordSet {
  const seen = new Map<string, string>();
  const sourceKeys = [...new Set(records.flatMap(record => Object.keys(record)))];
  const sanitizedFields = sourceKeys.map(sourceName => {
    const baseName = sanitizeFieldName(sourceName);
    let candidate = baseName;
    let suffix = 2;
    while ([...seen.values()].includes(candidate)) {
      candidate = `${baseName}_${suffix}`;
      suffix += 1;
    }
    seen.set(sourceName, candidate);
    return {
      sourceName,
      name: candidate
    };
  });

  const fieldMap = new Map(sanitizedFields.map(entry => [entry.sourceName, entry.name]));
  const sanitizedRecords = records.map(record =>
    Object.fromEntries(
      Object.entries(record).map(([key, value]) => [fieldMap.get(key) ?? sanitizeFieldName(key), value])
    )
  );

  return {
    sanitizedFields,
    fieldMap,
    records: sanitizedRecords
  };
}

function sanitizeFieldName(sourceName: string): string {
  const trimmed = sourceName.trim();
  const normalized = trimmed
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  const candidate = normalized.length > 0 ? normalized : `field_${randomUUID().slice(0, 8)}`;
  return /^\d/u.test(candidate) ? `f_${candidate}` : candidate;
}

function profileSanitizedRecords(records: Array<Record<string, unknown>>): ItemFieldProfile[] {
  const fields = [...new Set(records.flatMap(record => Object.keys(record)))];
  const total = records.length;

  return fields.map(name => {
    const values = records.map(record => normalizeValueForInference(record[name]));
    const nonNull = values.filter(value => value !== undefined && value !== null);
    const inferredType = inferFieldType(nonNull);
    const distinctValues = new Set(nonNull.map(stableKey));
    const warnings: string[] = [];

    if (isLongTextField(name, inferredType, nonNull)) {
      warnings.push('high-cardinality text field');
    }
    if (looksLikeUrlField(name, nonNull)) {
      warnings.push('contains URL-like values');
    }

    return {
      sourceName: name,
      name,
      inferredType,
      nullable: nonNull.length < total,
      missingCount: total - nonNull.length,
      distinctCount: distinctValues.size,
      uniqueRatio: nonNull.length === 0 ? 0 : distinctValues.size / nonNull.length,
      examples: uniqueExampleValues(nonNull, 3),
      roles: [],
      warnings
    };
  });
}

function inferRoles(
  fields: ItemFieldProfile[],
  records: Array<Record<string, unknown>>
): {
  primaryKeyField: string;
  syntheticPrimaryKey: boolean;
  titleField: string | null;
  indexFields: string[];
  filterFields: string[];
  suggestFields: string[];
  imageFields: string[];
} {
  const total = records.length;
  const byName = new Map(fields.map(field => [field.name, field]));
  const scalarUniqueCandidates = fields.filter(field =>
    ['string', 'int64'].includes(field.inferredType) && field.missingCount === 0 && field.distinctCount === total
  );
  const strongPkCandidates = fields
    .filter(field => ['string', 'int64'].includes(field.inferredType) && STRONG_PRIMARY_KEY_NAMES.includes(field.name as never))
    .sort((left, right) => {
      if (left.missingCount !== right.missingCount) return left.missingCount - right.missingCount;
      if (left.uniqueRatio !== right.uniqueRatio) return right.uniqueRatio - left.uniqueRatio;
      return right.distinctCount - left.distinctCount;
    });
  const strongPk = strongPkCandidates[0];
  const primaryKeyField = strongPk?.name ?? scalarUniqueCandidates[0]?.name ?? SYNTHETIC_PRIMARY_KEY;
  const syntheticPrimaryKey = primaryKeyField === SYNTHETIC_PRIMARY_KEY;

  const stringFields = fields.filter(field => field.inferredType === 'string');
  const strongTitle = stringFields.find(field => STRONG_TITLE_NAMES.includes(field.name as never) && !looksLikeUrlField(field.name, field.examples));
  const titleField = strongTitle?.name ?? pickBestFallbackTitleField(stringFields);

  const imageFields = fields
    .filter(field => (field.inferredType === 'string' || field.inferredType === 'array<string>') && STRONG_IMAGE_NAMES.some(name => field.name.includes(name)))
    .map(field => field.name);

  const filterFields = fields
    .filter(field => field.name !== primaryKeyField && field.name !== titleField)
    .filter(field => {
      if (!['string', 'int64', 'float', 'boolean'].includes(field.inferredType)) return false;
      if (field.examples.length === 0) return false;
      if (looksLikeUrlField(field.name, field.examples)) return false;
      if (STRONG_FILTER_NAMES.includes(field.name as never)) return true;
      return field.distinctCount > 1 && (field.distinctCount <= 50 || field.uniqueRatio <= 0.35);
    })
    .map(field => field.name)
    .slice(0, 8);

  const indexFields = [
    ...(titleField ? [titleField] : []),
    ...fields
      .filter(field => field.name !== primaryKeyField && field.name !== titleField)
      .filter(field => field.inferredType === 'string' || field.inferredType === 'array<string>')
      .filter(field => STRONG_INDEX_NAMES.includes(field.name as never) || (!looksLikeUrlField(field.name, field.examples) && !isCategoricalField(field)))
      .map(field => field.name)
  ];

  const dedupedIndexFields = [...new Set(indexFields)].slice(0, 8);
  const suggestFields = [
    ...new Set(
      [
        titleField,
        ...fields
          .filter(field => ['string', 'array<string>'].includes(field.inferredType))
          .filter(field => ['keywords', 'brand', 'category', 'name', 'title'].includes(field.name))
          .map(field => field.name)
      ].filter(Boolean) as string[]
    )
  ].slice(0, 4);

  if (syntheticPrimaryKey && !byName.has(SYNTHETIC_PRIMARY_KEY)) {
    fields.unshift({
      sourceName: SYNTHETIC_PRIMARY_KEY,
      name: SYNTHETIC_PRIMARY_KEY,
      inferredType: 'string',
      nullable: false,
      missingCount: 0,
      distinctCount: total,
      uniqueRatio: 1,
      examples: ['item_000001'],
      roles: [],
      warnings: ['synthetic primary key']
    });
  }

  return {
    primaryKeyField,
    syntheticPrimaryKey,
    titleField: titleField ?? null,
    indexFields: dedupedIndexFields.length > 0 ? dedupedIndexFields : [primaryKeyField],
    filterFields,
    suggestFields,
    imageFields
  };
}

function attachFieldRoles(
  fields: ItemFieldProfile[],
  inference: ReturnType<typeof inferRoles>
): ItemFieldProfile[] {
  return fields.map(field => ({
    ...field,
    roles: [
      ...(field.name === inference.primaryKeyField ? ['primary_key'] : []),
      ...(field.name === inference.titleField ? ['title'] : []),
      ...(inference.indexFields.includes(field.name) ? ['index'] : []),
      ...(inference.filterFields.includes(field.name) ? ['filter'] : []),
      ...(inference.suggestFields.includes(field.name) ? ['suggest'] : []),
      ...(inference.imageFields.includes(field.name) ? ['image'] : [])
    ]
  }));
}

function applySyntheticPrimaryKeyIfNeeded(
  records: Array<Record<string, unknown>>,
  primaryKeyField: string,
  syntheticPrimaryKey: boolean
): Array<Record<string, unknown>> {
  if (!syntheticPrimaryKey) {
    return records;
  }

  return records.map((record, index) => ({
    [primaryKeyField]: `item_${String(index + 1).padStart(6, '0')}`,
    ...record
  }));
}

function collectProfileWarnings(
  fields: ItemFieldProfile[],
  inference: ReturnType<typeof inferRoles>,
  sanitizedFields: Array<{ sourceName: string; name: string }>,
  validation: ItemValidationResult
): string[] {
  const warnings: string[] = [];

  if (inference.syntheticPrimaryKey) {
    warnings.push(`No stable unique primary key was found; ${SYNTHETIC_PRIMARY_KEY} will be generated during apply.`);
  }

  if (!inference.titleField) {
    warnings.push('No strong title-like field was found; search quality may require manual review of IndexFields.');
  }

  const renamed = sanitizedFields.filter(field => field.sourceName !== field.name);
  if (renamed.length > 0) {
    warnings.push(`${renamed.length} field names were sanitized to snake_case for schema safety.`);
  }

  if (fields.some(field => field.inferredType === 'object' || field.inferredType === 'array<object>')) {
    warnings.push('Nested object fields were preserved as object types. Review whether any nested content should be flattened before production ingest.');
  }

  if (!validation.ok) {
    warnings.push(
      `${validation.summary.blockingIssueCount} blocking validation issues were found. Run item plan, inspect validation.json / report.md, and fix the data before item apply.`
    );
  }

  return warnings;
}

function buildValidationResult(
  fields: ItemFieldProfile[],
  inference: ReturnType<typeof inferRoles>,
  records: Array<Record<string, unknown>>,
  cleanup: ItemCleanupSummary
): ItemValidationResult {
  const issues: ItemValidationIssue[] = [];
  const primaryKeyField = inference.primaryKeyField;
  const primaryKeyValues = records.map(record => record[primaryKeyField]);
  const missingPrimaryKeyValues = primaryKeyValues.filter(isMissingValue);
  const duplicatePrimaryKeyCount = inference.syntheticPrimaryKey ? 0 : countDuplicateNonMissingValues(primaryKeyValues);
  const titleValues = inference.titleField ? records.map(record => record[inference.titleField as string]) : [];
  const missingTitleCount = inference.titleField ? titleValues.filter(isMissingValue).length : records.length;
  const mixedTypeFields = fields.filter(field => detectObservedKinds(records, field.name).length > 1);
  const emptyRecordCount = records.filter(isEffectivelyEmptyRecord).length;

  if (inference.syntheticPrimaryKey) {
    issues.push({
      severity: 'warning',
      code: 'synthetic_primary_key',
      field: primaryKeyField,
      detail: `No stable unique primary key was found. ${primaryKeyField} will be generated during apply.`,
      affectedCount: records.length
    });
  } else {
    if (missingPrimaryKeyValues.length > 0) {
      issues.push({
        severity: 'error',
        code: 'primary_key_missing',
        field: primaryKeyField,
        detail: `Primary key field "${primaryKeyField}" is missing in ${missingPrimaryKeyValues.length} records.`,
        affectedCount: missingPrimaryKeyValues.length
      });
    }

    if (duplicatePrimaryKeyCount > 0) {
      issues.push({
        severity: 'error',
        code: 'primary_key_duplicate',
        field: primaryKeyField,
        detail: `Primary key field "${primaryKeyField}" contains ${duplicatePrimaryKeyCount} duplicate values.`,
        affectedCount: duplicatePrimaryKeyCount,
        examples: collectDuplicateExamples(primaryKeyValues)
      });
    }
  }

  if (!inference.titleField) {
    issues.push({
      severity: 'warning',
      code: 'title_field_missing',
      detail: 'No strong title-like field was inferred. Review IndexFields before production ingest.'
    });
  } else if (missingTitleCount > 0) {
    issues.push({
      severity: missingTitleCount === records.length ? 'error' : 'warning',
      code: 'title_values_missing',
      field: inference.titleField,
      detail: `Title field "${inference.titleField}" is empty in ${missingTitleCount} records.`,
      affectedCount: missingTitleCount
    });
  }

  for (const field of mixedTypeFields) {
    issues.push({
      severity: 'error',
      code: 'mixed_field_types',
      field: field.name,
      detail: `Field "${field.name}" has mixed non-null value types across records. Normalize it before ingest.`,
      examples: field.examples
    });
  }

  if (emptyRecordCount > 0) {
    issues.push({
      severity: 'warning',
      code: 'empty_records',
      detail: `${emptyRecordCount} records are effectively empty after normalization.`,
      affectedCount: emptyRecordCount
    });
  }

  return {
    ok: !issues.some(issue => issue.severity === 'error'),
    cleanup,
    summary: {
      totalRecords: records.length,
      cleanedRecords: records.length,
      blockingIssueCount: issues.filter(issue => issue.severity === 'error').length,
      warningCount: issues.filter(issue => issue.severity === 'warning').length,
      missingPrimaryKeyCount: missingPrimaryKeyValues.length,
      duplicatePrimaryKeyCount,
      missingTitleCount,
      mixedTypeFieldCount: mixedTypeFields.length,
      emptyRecordCount
    },
    issues
  };
}

function buildSchemaArtifact(profile: ItemProfileResult): Array<Record<string, unknown>> {
  return profile.fields.map(field => ({
    Name: field.name,
    Type: field.inferredType,
    ...(field.name === profile.inferred.primaryKeyField ? { PK: true } : {})
  }));
}

function buildFieldConfigArtifact(profile: ItemProfileResult): Record<string, unknown> {
  return compactObject({
    TitleField: profile.inferred.titleField ?? undefined,
    IndexFields: profile.inferred.indexFields,
    FilterFields: profile.inferred.filterFields.length > 0 ? profile.inferred.filterFields : undefined,
    SuggestFields: profile.inferred.suggestFields.length > 0 ? profile.inferred.suggestFields : undefined,
    ImageFields: profile.inferred.imageFields.length > 0 ? profile.inferred.imageFields : undefined
  });
}

function buildDefaultTrials(profile: ItemProfileResult): ItemPlanFile['defaults'] {
  const titleField = profile.inferred.titleField;
  const sample = profile.sample[0] ?? {};
  const titleValue = titleField ? normalizeDisplayText(sample[titleField]) : '';
  const categoryField = profile.fields.find(field => field.name === 'category' || field.name.endsWith('_category'))?.name;
  const categoryValue = categoryField ? normalizeDisplayText(sample[categoryField]) : '';
  const searchQuery = (titleValue || categoryValue || 'recommended items')?.slice(0, 24) || 'recommended items';
  const primaryKeySample = normalizeDisplayText(sample[profile.inferred.primaryKeyField]);

  return {
    searchQuery,
    chatMessage: `Based on the item data in this application, recommend a few results related to "${searchQuery}".`,
    search: {
      sceneName: 'default-search',
      sceneDescription: 'Generated default search scene for item onboarding.',
      pageSize: 10
    },
    recommend: {
      sceneType: 'for_you',
      sceneName: 'homepage',
      sceneDescription: 'Generated default recommend scene for item onboarding.',
      bhvSceneTypes: ['REPLACE_WITH_BHV_SCENE_TYPE'],
      pageSize: 10,
      userId: 'user_demo',
      parentItemId: primaryKeySample || null
    }
  };
}

function buildReviewChecklist(profile: ItemProfileResult): string[] {
  return [
    'Review schema.json and confirm that PK, text fields, and categorical filter fields match the business goal.',
    'Review field-config.json and confirm field attributes, display-facing fields, and IndexFields / FilterFields / SuggestFields before activating the app.',
    'Confirm the intended item display style and result-card expectations before the real apply.',
    'Review validation.json and fix duplicate keys, mixed types, or critical missing values before running item apply.',
    'If you need recommend bootstrap, confirm the target page / module first and then replace the placeholder BhvSceneTypes in recommend-scene-create.json / recommend-scene-update.json.',
    'If the source data is not product-like item data, adjust the generated plan before running item apply.',
    ...(profile.validation.ok ? [] : ['Resolve blocking validation issues before production-scale ingest or use --force only for controlled tests.']),
    ...(profile.warnings.length > 0 ? ['Resolve warnings listed in report.md before production-scale ingest.'] : [])
  ];
}

function buildRecommendSceneCreateArtifact(
  _profile: ItemProfileResult,
  defaults: ItemPlanFile['defaults']
): Record<string, unknown> {
  return {
    Type: defaults.recommend.sceneType,
    Name: defaults.recommend.sceneName,
    Description: defaults.recommend.sceneDescription,
    RecommendModel: 0,
    RecommendOptimizationTarget: 0,
    BhvSceneTypes: defaults.recommend.bhvSceneTypes
  };
}

function buildSearchSceneCreateArtifact(defaults: ItemPlanFile['defaults']): Record<string, unknown> {
  return {
    Name: defaults.search.sceneName,
    Description: defaults.search.sceneDescription
  };
}

function buildSearchSceneUpdateArtifact(defaults: ItemPlanFile['defaults']): Record<string, unknown> {
  return {
    Name: defaults.search.sceneName,
    Description: defaults.search.sceneDescription,
    Config: {
      SearchConfig: {
        RetrieveConfigs: []
      }
    }
  };
}

function buildRecommendSceneUpdateArtifact(defaults: ItemPlanFile['defaults']): Record<string, unknown> {
  return {
    Type: defaults.recommend.sceneType,
    Name: defaults.recommend.sceneName,
    Description: defaults.recommend.sceneDescription,
    BhvSceneTypes: defaults.recommend.bhvSceneTypes,
    Config: {
      Count: defaults.recommend.pageSize
    }
  };
}

function buildDatasetDescription(sourcePath: string, goal?: string): string {
  const sourceName = path.parse(sourcePath).name;
  if (goal && goal.trim().length > 0) {
    return `Generated from ${sourceName}. Goal: ${goal.trim()}`;
  }
  return `Generated from ${sourceName} by viking item plan.`;
}

function renderPlanReport(plan: ItemPlanFile, profile: ItemProfileResult): string {
  const lines = [
    '# Viking Item Onboarding Plan',
    '',
    `Source file: \`${plan.source.file}\``,
    `Detected format: \`${plan.source.format}\``,
    `Record count: \`${plan.source.totalRecords}\``,
    `Dataset name: \`${plan.names.dataset}\``,
    `Application name: \`${plan.names.application}\``,
    '',
    '## Inference',
    '',
    `- Primary key: \`${plan.inferred.primaryKeyField}\`${plan.inferred.syntheticPrimaryKey ? ' (synthetic)' : ''}`,
    `- Title field: ${plan.inferred.titleField ? `\`${plan.inferred.titleField}\`` : '(none inferred)'}`,
    `- Index fields: ${formatInlineList(plan.inferred.indexFields)}`,
    `- Filter fields: ${formatInlineList(plan.inferred.filterFields)}`,
    `- Suggest fields: ${formatInlineList(plan.inferred.suggestFields)}`,
    `- Image fields: ${formatInlineList(plan.inferred.imageFields)}`,
    '',
    '## Generated Files',
    '',
    `- \`${plan.files.normalizedItems}\``,
    `- \`${plan.files.schema}\``,
    `- \`${plan.files.fieldConfig}\``,
    `- \`${plan.files.onlineConfig}\``,
    `- \`${plan.files.validation}\``,
    `- \`${plan.files.datasetCreate}\``,
    `- \`${plan.files.appCreate}\``,
    `- \`${plan.files.schemaCheck}\``,
    `- \`${plan.files.searchSceneCreate}\``,
    `- \`${plan.files.searchSceneUpdate}\``,
    `- \`${plan.files.recommendSceneCreate}\``,
    `- \`${plan.files.recommendSceneUpdate}\``,
    '',
    '## Suggested Commands',
    '',
    '```bash',
    `viking item apply --plan-dir ${quoteShellPath('.')} --dry-run`,
    `viking item apply --plan-dir ${quoteShellPath('.')} --confirm-review --wait-ready --run-trials`,
    '```',
    '',
    '## Validation',
    '',
    `- Blocking issues: \`${plan.validation.summary.blockingIssueCount}\``,
    `- Warnings: \`${plan.validation.summary.warningCount}\``,
    `- Missing primary-key values: \`${plan.validation.summary.missingPrimaryKeyCount}\``,
    `- Duplicate primary-key values: \`${plan.validation.summary.duplicatePrimaryKeyCount}\``,
    `- Missing title values: \`${plan.validation.summary.missingTitleCount}\``,
    `- Mixed-type fields: \`${plan.validation.summary.mixedTypeFieldCount}\``,
    '',
    '## Cleanup',
    '',
    `- Trimmed string values: \`${plan.validation.cleanup.trimmedStringValues}\``,
    `- Empty strings normalized to null: \`${plan.validation.cleanup.emptyStringValuesNormalized}\``,
    `- Special values normalized: \`${plan.validation.cleanup.specialValueNormalizations}\``,
    '',
    '## Recommend Bootstrap',
    '',
    `- Default search scene: \`${plan.defaults.search.sceneName}\``,
    `- Search scene template: \`${plan.files.searchSceneCreate}\` + \`${plan.files.searchSceneUpdate}\``,
    '',
    `- Default scene type: \`${plan.defaults.recommend.sceneType}\``,
    `- Default scene name: \`${plan.defaults.recommend.sceneName}\``,
    `- BhvSceneTypes placeholder: ${formatInlineList(plan.defaults.recommend.bhvSceneTypes)}`,
    '- Confirm the target page / module before creating or updating any recommend scene.',
    `- To bootstrap recommend later: \`viking item apply --plan-dir ${quoteShellPath('.')} --confirm-review --confirm-recommend-entry-binding --run-trials --recommend-bhv-scene-types your_scene_type\``,
    '',
    '## Warnings',
    ''
  ];

  if (profile.warnings.length === 0) {
    lines.push('- None');
  } else {
    for (const warning of profile.warnings) {
      lines.push(`- ${warning}`);
    }
  }

  lines.push('', '## Review Checklist', '');
  for (const item of plan.reviewChecklist) {
    lines.push(`- ${item}`);
  }

  lines.push('', '## Validation Issues', '');
  if (plan.validation.issues.length === 0) {
    lines.push('- None');
  } else {
    for (const issue of plan.validation.issues) {
      const field = issue.field ? ` [field=${issue.field}]` : '';
      lines.push(`- [${issue.severity}] ${issue.code}${field}: ${issue.detail}`);
    }
  }

  lines.push('', '## Sample Fields', '');
  for (const field of profile.fields.slice(0, 12)) {
    lines.push(`- \`${field.name}\`: ${field.inferredType}${field.roles.length > 0 ? ` (${field.roles.join(', ')})` : ''}`);
  }

  return `${lines.join('\n')}\n`;
}

function inferFieldType(values: unknown[]): ItemFieldType {
  if (values.length === 0) return 'string';

  if (values.every(value => typeof value === 'boolean')) return 'boolean';
  if (values.every(value => Number.isInteger(value))) return 'int64';
  if (values.every(value => typeof value === 'number' && Number.isFinite(value))) return 'float';
  if (values.every(value => typeof value === 'string')) return 'string';

  if (values.every(Array.isArray)) {
    const flattened = values.flatMap(value => value as unknown[]).filter(value => value !== undefined && value !== null);
    if (flattened.length === 0 || flattened.every(value => typeof value === 'string')) return 'array<string>';
    if (flattened.every(value => Number.isInteger(value))) return 'array<int64>';
    if (flattened.every(value => typeof value === 'number' && Number.isFinite(value))) return 'array<float>';
    if (flattened.every(isRecord)) return 'array<object>';
    return 'array<object>';
  }

  if (values.some(isRecord)) return 'object';
  if (values.some(Array.isArray)) return 'array<object>';

  return 'string';
}

function detectObservedKinds(records: Array<Record<string, unknown>>, fieldName: string): string[] {
  return [
    ...new Set(
      records
        .map(record => record[fieldName])
        .filter(value => value !== undefined && value !== null)
        .map(observedKind)
    )
  ];
}

function observedKind(value: unknown): string {
  if (Array.isArray(value)) {
    const nestedKinds = [...new Set(value.filter(item => item !== undefined && item !== null).map(observedKind))];
    return nestedKinds.length <= 1 ? `array:${nestedKinds[0] ?? 'unknown'}` : 'array:mixed';
  }
  if (isRecord(value)) return 'object';
  if (typeof value === 'string') return 'string';
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') return Number.isInteger(value) ? 'int64' : 'float';
  return typeof value;
}

function isCategoricalField(field: ItemFieldProfile): boolean {
  return ['string', 'boolean', 'int64'].includes(field.inferredType) && (field.distinctCount <= 30 || field.uniqueRatio <= 0.35);
}

function pickBestFallbackTitleField(fields: ItemFieldProfile[]): string | null {
  const candidates = fields.filter(field => !looksLikeUrlField(field.name, field.examples) && field.distinctCount > 1);
  if (candidates.length === 0) return null;
  candidates.sort((left, right) => scoreTitleCandidate(right) - scoreTitleCandidate(left));
  return candidates[0]?.name ?? null;
}

function scoreTitleCandidate(field: ItemFieldProfile): number {
  const averageLength =
    field.examples.length === 0
      ? 0
      : (field.examples as unknown[]).reduce<number>((sum, value) => sum + String(value).length, 0) / field.examples.length;
  let score = 0;
  if (averageLength >= 4 && averageLength <= 80) score += 2;
  if (field.uniqueRatio > 0.5) score += 1;
  if (field.name.includes('title') || field.name.includes('name')) score += 4;
  return score;
}

function isLongTextField(name: string, type: ItemFieldType, values: unknown[]): boolean {
  if (type !== 'string') return false;
  if (['url', 'image_url'].includes(name)) return false;
  if (values.length === 0) return false;
  const averageLength = values.reduce<number>((sum, value) => sum + String(value).length, 0) / values.length;
  return averageLength > 80;
}

function looksLikeUrlField(name: string, values: unknown[]): boolean {
  if (name.includes('url')) return true;
  return values.some(value => typeof value === 'string' && /^https?:\/\//u.test(value));
}

function stableKey(value: unknown): string {
  if (typeof value === 'string') return `s:${value}`;
  if (typeof value === 'number') return `n:${value}`;
  if (typeof value === 'boolean') return `b:${value}`;
  return JSON.stringify(value);
}

function isMissingValue(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === 'string' && value.trim().length === 0);
}

function countDuplicateNonMissingValues(values: unknown[]): number {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (isMissingValue(value)) continue;
    const key = stableKey(value);
    if (seen.has(key)) {
      duplicates.add(key);
      continue;
    }
    seen.add(key);
  }
  return duplicates.size;
}

function collectDuplicateExamples(values: unknown[]): unknown[] {
  const counts = new Map<string, { raw: unknown; count: number }>();
  for (const value of values) {
    if (isMissingValue(value)) continue;
    const key = stableKey(value);
    const existing = counts.get(key);
    if (existing) {
      existing.count += 1;
      continue;
    }
    counts.set(key, { raw: value, count: 1 });
  }

  return [...counts.values()]
    .filter(entry => entry.count > 1)
    .slice(0, 3)
    .map(entry => entry.raw);
}

function isEffectivelyEmptyRecord(record: Record<string, unknown>): boolean {
  return Object.values(record).every(value => {
    if (isMissingValue(value)) return true;
    if (Array.isArray(value)) return value.length === 0;
    if (isRecord(value)) return Object.keys(value).length === 0;
    return false;
  });
}

function uniqueExampleValues(values: unknown[], limit: number): unknown[] {
  const seen = new Set<string>();
  const results: unknown[] = [];
  for (const value of values) {
    const key = stableKey(value);
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(value);
    if (results.length >= limit) break;
  }
  return results;
}

function normalizeDisplayText(value: unknown): string {
  if (value === undefined || value === null) return '';
  if (typeof value === 'string') return value.trim();
  return JSON.stringify(value);
}

function normalizeValueForInference(value: unknown): unknown {
  if (typeof value === 'string' && value.trim().length === 0) {
    return null;
  }
  return value;
}

function formatInlineList(values: string[]): string {
  if (values.length === 0) return '(none)';
  return values.map(value => `\`${value}\``).join(', ');
}

function quoteShellPath(value: string): string {
  return value.includes(' ') ? `"${value}"` : value;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

export function normalizeFieldConfigForApi(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) {
    return {};
  }

  const titleField = typeof value.TitleField === 'string' ? value.TitleField : undefined;
  const indexFields = mergeStringLists(value.IndexFields, value.IndexField, titleField);
  const filterFields = mergeStringLists(value.FilterFields, value.FilterField);
  const suggestFields = mergeStringLists(value.SuggestFields, value.SuggestField);
  const imageIndexFields = mergeStringLists(value.ImageIndexFields, value.ImageFields, value.ImageField);

  return compactObject({
    ...(indexFields ? { IndexFields: indexFields } : {}),
    ...(filterFields ? { FilterFields: filterFields } : {}),
    ...(suggestFields ? { SuggestFields: suggestFields } : {}),
    ...(imageIndexFields ? { ImageIndexFields: imageIndexFields } : {})
  });
}

export function normalizeSchemaForApi(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    throw new Error('schema.json must contain an array of schema fields.');
  }

  return value.map(entry => {
    if (!isRecord(entry)) {
      throw new Error('Every schema field must be an object.');
    }

    const fieldName = typeof entry.Name === 'string' ? entry.Name : typeof entry.FieldName === 'string' ? entry.FieldName : undefined;
    const rawType = entry.Type ?? entry.FieldType;
    if (!fieldName || rawType === undefined) {
      throw new Error('Every schema field needs Name/FieldName and Type/FieldType.');
    }

    return compactObject({
      Name: fieldName,
      Type: normalizeSchemaFieldType(rawType),
      PK: entry.PK === true ? true : undefined,
      Fields: Array.isArray(entry.Fields) ? normalizeSchemaForApi(entry.Fields) : undefined
    });
  });
}

function normalizeSchemaFieldType(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    const code = DATASET_FIELD_TYPE_CODES[normalized as ItemFieldType];
    if (code) return code;
  }

  throw new Error(`Unsupported dataset field type: ${String(value)}`);
}

function mergeStringLists(...values: unknown[]): string[] | undefined {
  const merged: string[] = [];
  for (const value of values) {
    if (Array.isArray(value)) {
      for (const entry of value) {
        if (typeof entry === 'string' && entry.trim().length > 0 && !merged.includes(entry.trim())) {
          merged.push(entry.trim());
        }
      }
      continue;
    }

    if (typeof value === 'string' && value.trim().length > 0) {
      if (!merged.includes(value.trim())) {
        merged.push(value.trim());
      }
    }
  }
  return merged.length > 0 ? merged : undefined;
}
