// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import type { SearchDynamic } from '../types';
import { normalizeSearchMode, normalizeUserDefinedRecallMode } from '../search-mode';
import type { TuningRequestParams, TuningRunReportShape, TuningStrategy } from './types';

export interface SceneApplyDraft {
  runId: string;
  applicationId: string;
  datasetId: string;
  recommendedStrategyId: string;
  sceneName: string;
  sceneDescription: string;
  createPayload: Record<string, unknown>;
  onlinePayload: Record<string, unknown>;
  appliedSearchConfig: Record<string, unknown>;
  unappliedRequestParams: TuningRequestParams;
}

export interface BuildSceneApplyDraftOptions {
  applicationId: string;
  projectName?: string;
  sceneName?: string;
  sceneDescription?: string;
}

export function buildSceneApplyDraft(report: TuningRunReportShape, options: BuildSceneApplyDraftOptions): SceneApplyDraft {
  if (report.applicationId !== options.applicationId) {
    throw new Error(`Run ${report.runId} belongs to application ${report.applicationId}, not ${options.applicationId}.`);
  }
  if (!report.recommendedStrategyId) {
    throw new Error(`Run ${report.runId} has no recommended strategy.`);
  }
  const strategy = report.strategies.find(item => item.id === report.recommendedStrategyId);
  if (!strategy) {
    throw new Error(`Run ${report.runId} recommended strategy ${report.recommendedStrategyId}, but it is missing from report.strategies.`);
  }

  const sceneName = options.sceneName ?? defaultSceneName(report.runId, strategy.id);
  const sceneDescription =
    options.sceneDescription ??
    `SearchCLI tuning candidate from run ${report.runId}, strategy ${strategy.id}. Request-only params are not persisted in scene config.`;
  const appliedSearchConfig = {
    RetrieveConfigs: [buildRetrieveConfig(report.datasetId, strategy)]
  };

  return {
    runId: report.runId,
    applicationId: options.applicationId,
    datasetId: report.datasetId,
    recommendedStrategyId: strategy.id,
    sceneName,
    sceneDescription,
    createPayload: compactObject({
      AppID: options.applicationId,
      ProjectName: options.projectName,
      Name: sceneName,
      Description: sceneDescription
    }),
    onlinePayload: compactObject({
      AppID: options.applicationId,
      ProjectName: options.projectName,
      Name: sceneName,
      Description: sceneDescription,
      Config: {
        SearchConfig: appliedSearchConfig
      }
    }),
    appliedSearchConfig,
    unappliedRequestParams: strategy.requestParams
  };
}

export function withSceneId(payload: Record<string, unknown>, sceneId: string): Record<string, unknown> {
  return {
    ...payload,
    SceneID: sceneId
  };
}

function buildRetrieveConfig(datasetId: string, strategy: TuningStrategy): Record<string, unknown> {
  const dynamic = strategy.searchDynamic;
  return compactObject({
    DatasetID: datasetId,
    Mode: normalizeSceneMode(dynamic.mode),
    UserDefinedRecallMode: normalizeSceneUserDefinedRecallMode(dynamic.user_defined_recall_mode),
    MaxRecallNum: dynamic.max_retrieved_num,
    DenseWeight: dynamic.dense_weight,
    TextWeight: dynamic.text_weight,
    RerankEnabled: dynamic.rerank_enabled,
    RerankTopK: dynamic.rerank_topk,
    EnableImage: dynamic.enable_image,
    EnableRerankWithHot: dynamic.enable_rerank_with_hot,
    RerankModel: dynamic.rerank_model,
    RerankDoubaoConfig: toPascalObject(dynamic.rerank_doubao_config)
  });
}

function normalizeSceneMode(value: SearchDynamic['mode']): number | undefined {
  if (value === undefined) return undefined;
  const normalized = normalizeSearchMode(value);
  if (normalized === undefined) {
    throw new Error(`Invalid recommended search_dynamic.mode: ${String(value)}.`);
  }
  return normalized;
}

function normalizeSceneUserDefinedRecallMode(value: SearchDynamic['user_defined_recall_mode']): number | undefined {
  if (value === undefined) return undefined;
  const normalized = normalizeUserDefinedRecallMode(value);
  if (normalized === undefined) {
    throw new Error(`Invalid recommended search_dynamic.user_defined_recall_mode: ${String(value)}.`);
  }
  return normalized;
}

function defaultSceneName(runId: string, strategyId: string): string {
  return `search-tuning-${runId.replace(/^run_/, '')}-${strategyId}`.slice(0, 120);
}

function toPascalObject(value: unknown): unknown {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  return compactObject({
    ItemFeature: input.item_feature,
    Instruction: input.instruction
  });
}

function compactObject<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined));
}
