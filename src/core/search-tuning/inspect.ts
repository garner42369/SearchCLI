// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import type { ServiceConfig } from '../service-config';
import { VikingRuntimeApiClient } from '../runtime-api-client';
import { VikingOpenApiClient } from '../openapi-client';
import { fetchAppStatusSnapshot } from '../app-status';
import type { TuningFieldContext } from './types';

export interface TuningContext {
  applicationId: string;
  datasetId: string;
  sceneId?: string;
  sampleItems: Array<Record<string, unknown>>;
  fieldContext?: TuningFieldContext;
  imageIndexFields?: string[];
}

export async function inspectTuningContext(options: {
  config: ServiceConfig;
  applicationId: string;
  datasetId?: string;
  sceneId?: string;
  sampleSize?: number;
  includeFieldContext?: boolean;
  includeImageIndexFields?: boolean;
}): Promise<TuningContext> {
  let datasetId = options.datasetId;
  if (!datasetId) {
    const snapshot = await fetchAppStatusSnapshot(options.config, {
      applicationId: options.applicationId
    });
    datasetId = snapshot.inferredSearchDataset?.datasetId;
    if (!datasetId) {
      throw new Error(`Could not infer a unique dataset for application ${options.applicationId}. Pass --dataset-id.`);
    }
  }

  const fieldContext =
    options.includeFieldContext || options.includeImageIndexFields
      ? await loadTuningFieldContext(options.config, options.applicationId, datasetId)
      : undefined;

  return {
    applicationId: options.applicationId,
    datasetId,
    sceneId: options.sceneId,
    sampleItems: await loadDatasetSamples(options.config, datasetId, options.sampleSize ?? 20),
    ...(options.includeFieldContext ? { fieldContext } : {}),
    ...(options.includeImageIndexFields
      ? { imageIndexFields: fieldContext?.imageIndexFields ?? [] }
      : {})
  };
}

async function loadTuningFieldContext(config: ServiceConfig, applicationId: string, datasetId: string): Promise<TuningFieldContext> {
  const client = new VikingOpenApiClient(config);
  const response = await client.post('/api/v1/GetAppDataConfig', {
    AppID: applicationId,
    DatasetID: datasetId,
    ProjectName: config.projectName
  });
  return readTuningFieldContext(response);
}

export function readTuningFieldContext(response: unknown): TuningFieldContext {
  const result = isRecord(response) ? response.Result : undefined;
  const config = isRecord(result) ? result.Config : undefined;
  const dataConfig = isRecord(config) && isRecord(config.DataConfig) ? config.DataConfig : undefined;
  const fieldDescMap = isRecord(dataConfig?.FieldDescMap) ? dataConfig.FieldDescMap : undefined;
  const fieldDescriptions: Record<string, string> = {};
  if (fieldDescMap) {
    for (const [key, value] of Object.entries(fieldDescMap)) {
      if (typeof value === 'string' && value.trim()) {
        fieldDescriptions[key] = value.trim();
      }
    }
  }
  return {
    indexFields: asStringArray(dataConfig?.IndexFields),
    filterFields: asStringArray(dataConfig?.FilterFields),
    suggestFields: asStringArray(dataConfig?.SuggestFields),
    imageIndexFields: asStringArray(dataConfig?.ImageIndexFields),
    fieldDescriptions
  };
}

export function textRetrievableFields(context: TuningFieldContext): string[] {
  const imageFields = new Set(context.imageIndexFields);
  return context.indexFields.filter(field => !imageFields.has(field));
}

async function loadDatasetSamples(
  config: ServiceConfig,
  datasetId: string,
  sampleSize: number
): Promise<Array<Record<string, unknown>>> {
  try {
    const client = new VikingRuntimeApiClient(config);
    const samples: Array<Record<string, unknown>> = [];
    const pageSize = Math.min(10, Math.max(1, sampleSize));
    for (let pageNumber = 1; samples.length < sampleSize; pageNumber += 1) {
      const response = await client.dataList(datasetId, {
        page_number: pageNumber,
        page_size: Math.min(pageSize, sampleSize - samples.length)
      });
      const pageItems = normalizeDataListResponse(response);
      if (pageItems.length === 0) break;
      samples.push(...pageItems);
    }
    return samples.slice(0, sampleSize);
  } catch {
    return [];
  }
}

function normalizeDataListResponse(response: unknown): Array<Record<string, unknown>> {
  const body = unwrapResult(response);
  const candidates = [
    readArray(body, 'items'),
    readArray(body, 'Items'),
    readArray(body, 'list'),
    readArray(body, 'List'),
    readArray(body, 'data'),
    readArray(body, 'Data')
  ].find(value => value.length > 0);
  return (candidates ?? [])
    .map(item => normalizeDatasetItem(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function normalizeDatasetItem(item: unknown): Record<string, unknown> | undefined {
  if (!isRecord(item)) return undefined;
  const rawData = parseRawData(item.raw_data ?? item.rawData ?? item.fields ?? item.Fields);
  const id = item._id ?? item.id ?? item.ID ?? rawData._id ?? rawData.id;
  return {
    ...(id !== undefined ? { item_id: String(id) } : {}),
    ...rawData
  };
}

function parseRawData(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value) as unknown;
      return isRecord(parsed) ? parsed : { value };
    } catch {
      return { value };
    }
  }
  if (isRecord(value)) return value;
  return {};
}

function unwrapResult(value: unknown): unknown {
  if (isRecord(value) && value.result !== undefined) return value.result;
  if (isRecord(value) && value.Result !== undefined) return value.Result;
  return value;
}

function readArray(value: unknown, key: string): unknown[] {
  return isRecord(value) && Array.isArray(value[key]) ? value[key] : [];
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(item => String(item).trim()).filter(Boolean) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
