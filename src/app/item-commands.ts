// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { fetchAppStatusSnapshot, type AppStatusSnapshot } from '../core/app-status';
import {
  buildApplyDryRunSummary,
  buildItemPlan,
  buildItemProfile,
  loadItemPlan,
  loadPlanArtifact,
  normalizeFieldConfigForApi,
  normalizeSchemaForApi,
  type ItemApplyPlanOptions
} from '../core/item-onboarding';
import { printOutput } from '../core/output-format';
import { VikingOpenApiClient } from '../core/openapi-client';
import { VikingRuntimeApiClient } from '../core/runtime-api-client';
import { resolveServiceConfig, type ServiceConfigInput } from '../core/service-config';

export interface ItemProfileCommandOptions {
  file: string;
}

export interface ItemPlanCommandOptions {
  file: string;
  goal?: string;
  outputDir?: string;
  datasetName?: string;
  applicationName?: string;
  projectName?: string;
}

export interface ItemApplyCommandOptions extends ServiceConfigInput, ItemApplyPlanOptions {
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
}

interface StepResult {
  step: string;
  ok: boolean;
  skipped?: boolean;
  detail?: string;
  response?: unknown;
}

export async function runItemProfileCommand(options: ItemProfileCommandOptions): Promise<void> {
  await printOutput(await buildItemProfile(options.file));
}

export async function runItemPlanCommand(options: ItemPlanCommandOptions): Promise<void> {
  await printOutput(await buildItemPlan(options));
}

export async function runItemApplyCommand(options: ItemApplyCommandOptions): Promise<void> {
  const { planDir, plan } = await loadItemPlan(options.planDir);
  if (options.dryRun) {
    await printOutput(buildApplyDryRunSummary(planDir, plan, options));
    return;
  }

  if (!options.confirmReview) {
    throw new Error(buildReviewConfirmationMessage());
  }

  if (!plan.validation.ok && !options.force) {
    throw new Error(buildValidationBlockMessage(plan));
  }

  const config = resolveServiceConfig({
    baseUrl: options.baseUrl,
    accessKeyId: options.accessKeyId,
    secretKey: options.secretKey,
    region: options.region,
    timeoutMs: options.timeoutMs
  });
  const openapi = new VikingOpenApiClient(config);
  const runtime = new VikingRuntimeApiClient(config);

  const schema = normalizeSchemaForApi(await loadPlanArtifact<unknown>(planDir, plan.files.schema));
  const fieldConfig = normalizeFieldConfigForApi(await loadPlanArtifact<unknown>(planDir, plan.files.fieldConfig));
  const onlineConfig = await loadPlanArtifact<Record<string, unknown>>(planDir, plan.files.onlineConfig);
  const normalizedItems = await loadPlanArtifact<Array<Record<string, unknown>>>(planDir, plan.files.normalizedItems);
  const datasetCreateArtifact = await loadPlanArtifact<Record<string, unknown>>(planDir, plan.files.datasetCreate);
  const appCreateArtifact = await loadPlanArtifact<Record<string, unknown>>(planDir, plan.files.appCreate);
  const searchSceneCreateArtifact = await loadPlanArtifact<Record<string, unknown>>(planDir, plan.files.searchSceneCreate);
  const searchSceneUpdateArtifact = await loadPlanArtifact<Record<string, unknown>>(planDir, plan.files.searchSceneUpdate);
  const recommendSceneCreateArtifact = await loadPlanArtifact<Record<string, unknown>>(planDir, plan.files.recommendSceneCreate);
  const recommendSceneUpdateArtifact = await loadPlanArtifact<Record<string, unknown>>(planDir, plan.files.recommendSceneUpdate);
  const steps: StepResult[] = [];

  steps.push({
    step: 'validation_gate',
    ok: true,
    detail: plan.validation.ok
      ? 'Validation passed.'
      : `Continuing with --force despite ${plan.validation.summary.blockingIssueCount} blocking issues.`
  });
  steps.push({
    step: 'review_confirmation',
    ok: true,
    detail: 'Confirmed by user: schema, field attributes, display style, and index choices were reviewed before apply.'
  });

  const schemaCheckPayload = compactObject({
    Type: 1,
    Schema: schema,
    DataFieldConfig: fieldConfig,
    ProjectName: options.projectName
  });
  const schemaCheckResponse = await openapi.post('/api/v1/CheckDatasetSchema', schemaCheckPayload);
  steps.push({ step: 'schema_check', ok: true, response: schemaCheckResponse });

  let datasetId = options.datasetId;
  if (!datasetId) {
    const datasetCreatePayload = compactObject({
      ...datasetCreateArtifact,
      Name: options.datasetName ?? asOptionalString(datasetCreateArtifact.Name) ?? plan.names.dataset,
      Type: 1,
      Schema: schema,
      DataFieldConfig: fieldConfig
    });
    const datasetCreateResponse = await openapi.post('/api/v1/CreateDataset', datasetCreatePayload);
    datasetId = extractStringField(datasetCreateResponse, ['DatasetID', 'DatasetId']);
    if (!datasetId) {
      throw new Error('CreateDataset did not return DatasetID.');
    }
    steps.push({ step: 'create_dataset', ok: true, response: datasetCreateResponse });
  } else {
    steps.push({ step: 'create_dataset', ok: true, skipped: true, detail: `Using existing dataset ${datasetId}.` });
  }

  const ingestResponse = await runtime.dataWrite(datasetId, { fields: normalizedItems });
  steps.push({
    step: 'ingest_items',
    ok: true,
    detail: `Imported ${normalizedItems.length} records.`,
    response: ingestResponse
  });

  let applicationId = options.applicationId;
  if (!applicationId) {
    const appCreatePayload = compactObject({
      ...appCreateArtifact,
      Name: options.applicationName ?? asOptionalString(appCreateArtifact.Name) ?? plan.names.application,
      Industry: 1,
      ProjectName: options.projectName
    });
    const appCreateResponse = await openapi.post('/api/v1/CreateApplication', appCreatePayload);
    applicationId = extractStringField(appCreateResponse, ['AppID', 'AppId', 'ApplicationId']);
    if (!applicationId) {
      throw new Error('CreateApplication did not return AppID.');
    }
    steps.push({ step: 'create_application', ok: true, response: appCreateResponse });
  } else {
    steps.push({ step: 'create_application', ok: true, skipped: true, detail: `Using existing application ${applicationId}.` });
  }

  const bindResponse = await openapi.post(
    '/api/v1/BindAppDataset',
    compactObject({
      AppID: applicationId,
      DatasetIDs: [datasetId],
      ProjectName: options.projectName
    })
  );
  steps.push({ step: 'bind_dataset', ok: true, response: bindResponse });

  const datasetConfigResponse = await openapi.post(
    '/api/v1/UpdateAppDataConfig',
    compactObject({
      AppID: applicationId,
      DatasetID: datasetId,
      DataConfig: fieldConfig,
      ProjectName: options.projectName
    })
  );
  steps.push({ step: 'update_dataset_config', ok: true, response: datasetConfigResponse });
  const datasetConfigReadback = await openapi.post(
    '/api/v1/GetAppDataConfig',
    compactObject({
      AppID: applicationId,
      DatasetID: datasetId,
      ProjectName: options.projectName
    })
  );
  assertReadbackField(datasetConfigReadback, ['Dataset.DatasetID', 'DatasetID'], datasetId, 'GetAppDataConfig');
  steps.push({
    step: 'verify_dataset_config',
    ok: true,
    detail: `dataset_id=${datasetId}`,
    response: datasetConfigReadback
  });

  if (isNonEmptyRecord(onlineConfig)) {
    const onlineConfigResponse = await openapi.post(
      '/api/v1/UpsertAppOnlineConfig',
      compactObject({
        AppID: applicationId,
        Config: onlineConfig,
        ProjectName: options.projectName
      })
    );
    steps.push({ step: 'update_online_config', ok: true, response: onlineConfigResponse });
    const onlineConfigReadback = await openapi.post(
      '/api/v1/GetAppOnlineConfig',
      compactObject({
        AppID: applicationId,
        ProjectName: options.projectName
      })
    );
    steps.push({
      step: 'verify_online_config',
      ok: true,
      detail: 'Fetched app runtime config after update.',
      response: onlineConfigReadback
    });
  } else {
    steps.push({
      step: 'update_online_config',
      ok: true,
      skipped: true,
      detail: 'online-config.json is empty; skipped UpsertAppOnlineConfig.'
    });
  }

  let status: AppStatusSnapshot | undefined;
  if (options.waitReady) {
    status = await waitForReady(config, applicationId, options.projectName, options.waitTimeoutMs, options.pollIntervalMs);
    steps.push({
      step: 'wait_ready',
      ok: true,
      detail: `phase=${status.phase}, runtimeSearchReady=${String(status.runtimeSearchReady)}`
    });
  } else {
    status = await fetchAppStatusSnapshot(config, {
      applicationId,
      projectName: options.projectName
    });
    steps.push({
      step: 'wait_ready',
      ok: true,
      skipped: true,
      detail: `Skipped wait-ready. Current phase=${status.phase}.`
    });
  }

  let searchResult: unknown;
  let chatResult: unknown;
  let searchSceneId: string | undefined;
  let recommendSceneId: string | undefined;
  let recommendResult: unknown;
  if (options.runTrials) {
    const searchQuery = options.searchQuery ?? plan.defaults.searchQuery;
    const chatMessage = options.chatMessage ?? plan.defaults.chatMessage;
    const recommendSceneType = options.recommendSceneType ?? asOptionalString(recommendSceneCreateArtifact.Type) ?? plan.defaults.recommend.sceneType;
    const recommendSceneName = options.recommendSceneName ?? asOptionalString(recommendSceneCreateArtifact.Name) ?? plan.defaults.recommend.sceneName;
    const recommendSceneDescription =
      asOptionalString(recommendSceneCreateArtifact.Description) ?? plan.defaults.recommend.sceneDescription;
    const recommendBhvSceneTypes = normalizeStringArray(
      options.recommendBhvSceneTypes?.length ? options.recommendBhvSceneTypes : asStringArray(recommendSceneCreateArtifact.BhvSceneTypes)
    ).filter(value => value !== 'REPLACE_WITH_BHV_SCENE_TYPE');
    const searchSceneName = asOptionalString(searchSceneCreateArtifact.Name) ?? plan.defaults.search.sceneName;
    const searchSceneDescription = asOptionalString(searchSceneCreateArtifact.Description) ?? plan.defaults.search.sceneDescription;

    const searchSceneCreateResponse = await openapi.post(
      '/api/v1/CreateSearchScene',
      compactObject({
        AppID: applicationId,
        ProjectName: options.projectName,
        Name: searchSceneName,
        Description: searchSceneDescription
      })
    );
    searchSceneId = extractStringField(searchSceneCreateResponse, ['SceneID', 'SceneId']);
    if (!searchSceneId) {
      throw new Error('CreateSearchScene did not return SceneID.');
    }
    steps.push({
      step: 'search_scene_bootstrap_create',
      ok: true,
      detail: `scene=${searchSceneName}`,
      response: searchSceneCreateResponse
    });

    const searchSceneUpdateResponse = await openapi.post(
      '/api/v1/OnlineSearchScene',
      compactObject({
        AppID: applicationId,
        SceneID: searchSceneId,
        Name: asOptionalString(searchSceneUpdateArtifact.Name) ?? searchSceneName,
        Description: asOptionalString(searchSceneUpdateArtifact.Description) ?? searchSceneDescription,
        Config: isRecord(searchSceneUpdateArtifact.Config) ? searchSceneUpdateArtifact.Config : undefined,
        ProjectName: options.projectName
      })
    );
    steps.push({
      step: 'search_scene_bootstrap_update',
      ok: true,
      detail: `scene_id=${searchSceneId}`,
      response: searchSceneUpdateResponse
    });
    const searchSceneReadback = await openapi.post(
      '/api/v1/GetSearchScene',
      compactObject({
        AppID: applicationId,
        SceneID: searchSceneId,
        ProjectName: options.projectName
      })
    );
    assertReadbackField(searchSceneReadback, ['SceneID'], searchSceneId, 'GetSearchScene');
    steps.push({
      step: 'verify_search_scene',
      ok: true,
      detail: `scene_id=${searchSceneId}`,
      response: searchSceneReadback
    });

    const mergedChatConfig = mergeChatOnlineConfig(onlineConfig, searchSceneId);
    const chatOnlineConfigResponse = await openapi.post(
      '/api/v1/UpsertAppOnlineConfig',
      compactObject({
        AppID: applicationId,
        Config: mergedChatConfig,
        ProjectName: options.projectName
      })
    );
    steps.push({
      step: 'bind_chat_search_scene',
      ok: true,
      detail: `search_scene_id=${searchSceneId}`,
      response: chatOnlineConfigResponse
    });
    const chatConfigReadback = await openapi.post(
      '/api/v1/GetAppOnlineConfig',
      compactObject({
        AppID: applicationId,
        ProjectName: options.projectName
      })
    );
    assertReadbackField(chatConfigReadback, ['Config.ChatConfig.SearchSceneID', 'ChatConfig.SearchSceneID'], searchSceneId, 'GetAppOnlineConfig');
    steps.push({
      step: 'verify_chat_search_binding',
      ok: true,
      detail: `search_scene_id=${searchSceneId}`,
      response: chatConfigReadback
    });

    searchResult = await runtime.search(applicationId, searchSceneId, {
      query: {
        text: searchQuery
      },
      page_number: 1,
      page_size: plan.defaults.search.pageSize
    });
    steps.push({ step: 'search_trial', ok: true, detail: `scene_id=${searchSceneId}, query=${searchQuery}`, response: searchResult });

    chatResult = await runtime.chatSearch(applicationId, {
      session_id: randomUUID(),
      input_message: {
        content: [
          {
            type: 'text',
            text: chatMessage
          }
        ]
      }
    });
    steps.push({ step: 'chat_trial', ok: true, detail: `message=${chatMessage}`, response: chatResult });

    if (recommendBhvSceneTypes.length > 0) {
      if (!options.confirmRecommendEntryBinding) {
        throw new Error(buildRecommendEntryBindingMessage());
      }
      const recommendCreatePayload = compactObject({
        AppID: applicationId,
        ProjectName: options.projectName,
        Type: recommendSceneType,
        Name: recommendSceneName,
        Description: recommendSceneDescription,
        ItemDatasetID: datasetId,
        RecommendModel: recommendSceneCreateArtifact.RecommendModel,
        RecommendOptimizationTarget: recommendSceneCreateArtifact.RecommendOptimizationTarget,
        BhvSceneTypes: recommendBhvSceneTypes
      });
      const recommendSceneCreateResponse = await openapi.post('/api/v1/CreateRecommendScene', recommendCreatePayload);
      recommendSceneId = extractStringField(recommendSceneCreateResponse, ['SceneID', 'SceneId']);
      if (!recommendSceneId) {
        throw new Error('CreateRecommendScene did not return SceneID.');
      }
      steps.push({
        step: 'recommend_bootstrap_create',
        ok: true,
        detail: `scene=${recommendSceneName}, bhv_scene_types=${recommendBhvSceneTypes.join(',')}, entry_binding_confirmed=true`,
        response: recommendSceneCreateResponse
      });

      const recommendOnlinePayload = compactObject({
        AppID: applicationId,
        SceneID: recommendSceneId,
        Type: recommendSceneType,
        Name: recommendSceneName,
        Description: recommendSceneDescription,
        ItemDatasetID: datasetId,
        BhvSceneTypes: recommendBhvSceneTypes,
        Config: isRecord(recommendSceneUpdateArtifact.Config) ? recommendSceneUpdateArtifact.Config : undefined,
        ProjectName: options.projectName
      });
      const recommendSceneUpdateResponse = await openapi.post('/api/v1/OnlineRecommendScene', recommendOnlinePayload);
      steps.push({
        step: 'recommend_bootstrap_update',
        ok: true,
        detail: `scene_id=${recommendSceneId}`,
        response: recommendSceneUpdateResponse
      });
      const recommendSceneReadback = await openapi.post(
        '/api/v1/GetRecommendScene',
        compactObject({
          AppID: applicationId,
          SceneID: recommendSceneId,
          ProjectName: options.projectName
        })
      );
      assertReadbackField(recommendSceneReadback, ['SceneID'], recommendSceneId, 'GetRecommendScene');
      steps.push({
        step: 'verify_recommend_scene',
        ok: true,
        detail: `scene_id=${recommendSceneId}`,
        response: recommendSceneReadback
      });

      if (options.recommendUserId || options.recommendParentId) {
        recommendResult = await runtime.recommend(applicationId, recommendSceneId, compactObject({
          user: options.recommendUserId ? { _user_id: options.recommendUserId } : undefined,
          parent_items: options.recommendParentId ? [{ _id: options.recommendParentId }] : undefined,
          page_size: plan.defaults.recommend.pageSize
        }));
        steps.push({
          step: 'recommend_trial',
          ok: true,
          detail: `scene_id=${recommendSceneId}`,
          response: recommendResult
        });
      } else {
        steps.push({
          step: 'recommend_trial',
          ok: true,
          skipped: true,
          detail: `Recommend scene ${recommendSceneId} is ready. Pass --recommend-user-id or --recommend-parent-id to run runtime recommend smoke.`
        });
      }
    } else {
      steps.push({
        step: 'recommend_bootstrap_create',
        ok: true,
        skipped: true,
        detail: `Skipped recommend bootstrap. Fill ${plan.files.recommendSceneCreate}, confirm the target page/module, and rerun with --confirm-recommend-entry-binding --recommend-bhv-scene-types.`
      });
      steps.push({
        step: 'recommend_bootstrap_update',
        ok: true,
        skipped: true,
        detail: `Skipped recommend bootstrap. Template available at ${plan.files.recommendSceneUpdate}.`
      });
      steps.push({
        step: 'recommend_trial',
        ok: true,
        skipped: true,
        detail: 'Recommend runtime smoke requires recommend bootstrap first.'
      });
    }
  } else {
    steps.push({
      step: 'search_scene_bootstrap_create',
      ok: true,
      skipped: true,
      detail: 'Skipped. Pass --run-trials to create and update a default search scene.'
    });
    steps.push({
      step: 'search_scene_bootstrap_update',
      ok: true,
      skipped: true,
      detail: 'Skipped. Pass --run-trials to create and update a default search scene.'
    });
    steps.push({
      step: 'bind_chat_search_scene',
      ok: true,
      skipped: true,
      detail: 'Skipped. Pass --run-trials to bind ChatConfig.SearchSceneID.'
    });
    steps.push({
      step: 'search_trial',
      ok: true,
      skipped: true,
      detail: 'Skipped. Pass --run-trials to execute search/chat smoke.'
    });
    steps.push({
      step: 'chat_trial',
      ok: true,
      skipped: true,
      detail: 'Skipped. Pass --run-trials to execute search/chat smoke.'
    });
    steps.push({
      step: 'recommend_bootstrap_create',
      ok: true,
      skipped: true,
      detail: 'Skipped. Pass --run-trials to bootstrap recommend from generated templates.'
    });
    steps.push({
      step: 'recommend_bootstrap_update',
      ok: true,
      skipped: true,
      detail: 'Skipped. Pass --run-trials to bootstrap recommend from generated templates.'
    });
    steps.push({
      step: 'recommend_trial',
      ok: true,
      skipped: true,
      detail: 'Skipped. Recommend trial requires a bootstrapped recommend scene.'
    });
  }

  status = await fetchAppStatusSnapshot(config, {
    applicationId,
    projectName: options.projectName
  });
  steps.push({
    step: 'refresh_status',
    ok: true,
    detail: `phase=${status.phase}, runtimeSearchReady=${String(status.runtimeSearchReady)}`
  });

  await printOutput({
    ok: true,
    dryRun: false,
    planDir,
    applicationId,
    datasetId,
    appStatus: status,
    defaults: plan.defaults,
    validation: plan.validation,
    steps,
    searchSceneId,
    searchResult,
    chatResult,
    recommendSceneId,
    recommendResult
  });
}

async function waitForReady(
  config: ReturnType<typeof resolveServiceConfig>,
  applicationId: string,
  projectName?: string,
  waitTimeoutMs = 120000,
  pollIntervalMs = 5000
): Promise<AppStatusSnapshot> {
  const start = Date.now();
  let latest = await fetchAppStatusSnapshot(config, {
    applicationId,
    projectName
  });

  while (Date.now() - start < waitTimeoutMs) {
    if (latest.runtimeSearchReady) {
      return latest;
    }
    await sleep(pollIntervalMs);
    latest = await fetchAppStatusSnapshot(config, {
      applicationId,
      projectName
    });
  }

  return latest;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyRecord(value: unknown): value is Record<string, unknown> {
  return isRecord(value) && Object.keys(value).length > 0;
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function asOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function extractStringField(value: unknown, candidateKeys: string[]): string | undefined {
  const unwrapped = unwrapResultEnvelope(value);
  if (!isRecord(unwrapped)) {
    return undefined;
  }

  for (const key of candidateKeys) {
    const direct = unwrapped[key];
    if (typeof direct === 'string' && direct.length > 0) {
      return direct;
    }
  }

  return undefined;
}

function unwrapResultEnvelope(value: unknown): unknown {
  if (!isRecord(value)) return value;
  if (isRecord(value.Result)) return value.Result;
  if (isRecord(value.result)) return value.result;
  if (isRecord(value.Response)) return value.Response;
  if (isRecord(value.response)) return value.response;
  return value;
}

function normalizeStringArray(values: string[] | undefined): string[] {
  if (!values) return [];
  return [...new Set(values.map(value => value.trim()).filter(Boolean))];
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(entry => typeof entry === 'string') as string[];
}

function buildValidationBlockMessage(plan: { validation: { issues: Array<{ severity: string; code: string; detail: string; field?: string }>; summary: { blockingIssueCount: number } } }): string {
  const blockingIssues = plan.validation.issues.filter(issue => issue.severity === 'error');
  const preview = blockingIssues
    .slice(0, 5)
    .map(issue => `- ${issue.code}${issue.field ? ` [${issue.field}]` : ''}: ${issue.detail}`)
    .join('\n');
  return [
    `Blocking validation issues found in plan (${plan.validation.summary.blockingIssueCount}).`,
    'Fix the data or rerun with --force only for controlled testing.',
    preview
  ]
    .filter(Boolean)
    .join('\n');
}

function buildReviewConfirmationMessage(): string {
  return [
    'Real item apply requires an explicit review confirmation.',
    'Review the generated schema, field attributes, display style, and index choices first, then rerun with --confirm-review.'
  ].join('\n');
}

function buildRecommendEntryBindingMessage(): string {
  return [
    'Recommend bootstrap requires an explicit page/module binding confirmation.',
    'Confirm which page or module this recommend scene belongs to, then rerun with --confirm-recommend-entry-binding.'
  ].join('\n');
}

function mergeChatOnlineConfig(existingOnlineConfig: Record<string, unknown>, searchSceneId: string): Record<string, unknown> {
  const merged = isRecord(existingOnlineConfig) ? { ...existingOnlineConfig } : {};
  const chatConfig = isRecord(merged.ChatConfig) ? { ...merged.ChatConfig } : {};
  chatConfig.SearchSceneID = searchSceneId;
  merged.ChatConfig = chatConfig;
  return merged;
}

function assertReadbackField(value: unknown, candidatePaths: string[], expected: string, actionName: string): void {
  const actual = readNestedString(unwrapResultEnvelope(value), candidatePaths);
  if (actual === expected) {
    return;
  }
  throw new Error(`${actionName} did not confirm the expected value ${expected}.`);
}

function readNestedString(value: unknown, candidatePaths: string[]): string | undefined {
  for (const path of candidatePaths) {
    const current = path.split('.').reduce<unknown>((acc, key) => (isRecord(acc) ? acc[key] : undefined), value);
    if (typeof current === 'string' && current.length > 0) {
      return current;
    }
  }
  return undefined;
}
