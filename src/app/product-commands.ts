// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { parseArgs } from 'node:util';
import { loadJsonInput, loadOptionalStringArray, parseBooleanString } from '../core/json-input';
import { fetchAppStatusSnapshot, type AppStatusSnapshot } from '../core/app-status';
import { getConsoleTopAction } from '../core/console-action-catalog';
import { hasHelpFlag, renderUsageBlock } from '../core/help-utils';
import { VikingOpenApiClient } from '../core/openapi-client';
import { printOutput } from '../core/output-format';
import { VikingRuntimeApiClient } from '../core/runtime-api-client';
import { resolveServiceConfig, type ServiceConfigInput } from '../core/service-config';
import { runItemApplyCommand, runItemPlanCommand, runItemProfileCommand } from './item-commands';
import { runDataImportShortcutCommand } from './shortcut-commands';
import {
  runAppActivateWorkflowCommand,
  runAppDiagnoseWorkflowCommand,
  runDatasetIngestWorkflowCommand
} from './workflow-commands';

export interface ServiceCommandOptions extends ServiceConfigInput {
  data?: string;
}

export interface AppCreateOptions extends ServiceCommandOptions {
  name?: string;
  description?: string;
  industry?: string;
}

export interface AppListOptions extends ServiceCommandOptions {
  name?: string;
  datasetId?: string;
  industry?: string;
  state?: string;
  full?: boolean;
}

export interface AppUpdateOptions extends ProjectScopedOptions {
  id: string;
  name?: string;
  industry?: string;
  icon?: string;
}

export interface ResourceIdOptions extends ServiceCommandOptions {
  id?: string;
}

export interface DatasetGetOptions extends ResourceIdOptions {
  full?: boolean;
}

export interface DatasetCreateOptions extends ServiceCommandOptions {
  name?: string;
  type?: string;
  description?: string;
  schema?: string;
  fieldConfig?: string;
}

export interface DatasetListOptions extends ServiceCommandOptions {
  type?: string;
  name?: string;
  applicationId?: string;
  full?: boolean;
}

export interface DatasetSchemaGetOptions extends ProjectScopedOptions {
  id: string;
  version?: number;
  fieldConfigVersion?: number;
}

export interface DatasetSchemaCheckOptions extends ProjectScopedOptions {
  type?: string;
  schema?: string;
  fieldConfig?: string;
}

export interface DatasetSummaryOptions extends ProjectScopedOptions {
  id?: string;
}

export interface DatasetDataSummaryOptions extends ProjectScopedOptions {
  datasetId: string;
}

export interface DatasetDataListOptions extends ProjectScopedOptions {
  datasetId: string;
  pageNumber?: number;
  pageSize?: number;
  contentId?: string;
  statuses?: string;
}

export interface DatasetDataGetOptions extends ProjectScopedOptions {
  datasetId: string;
  contentId?: string;
}

export interface DataWriteOptions extends ServiceCommandOptions {
  datasetId: string;
  fields?: string;
}

export interface DataListOptions extends ServiceCommandOptions {
  datasetId: string;
  filter?: string;
  maxResults?: number;
  outputFields?: string;
  nextToken?: string;
}

export interface DataGetOptions extends ServiceCommandOptions {
  datasetId: string;
  id?: string;
  outputFields?: string;
}

export interface DataDeleteOptions extends ServiceCommandOptions {
  datasetId: string;
  ids?: string;
}

export interface SearchRunOptions extends ServiceCommandOptions {
  applicationId: string;
  sceneId?: string;
  datasetId?: string;
  query?: string;
  pageSize?: number;
}

export interface SearchCompleteOptions extends ServiceCommandOptions {
  applicationId: string;
  sceneId: string;
  query?: string;
}

export interface RecommendRunOptions extends ServiceCommandOptions {
  applicationId: string;
  sceneId: string;
  userId?: string;
  parentId?: string;
  pageSize?: number;
}

export interface ChatSearchRunOptions extends ServiceCommandOptions {
  applicationId: string;
  sessionId?: string;
  message?: string;
  openingRemarks?: boolean;
  userId?: string;
}

export interface ApiKeyCreateOptions extends ServiceCommandOptions {
  name?: string;
  description?: string;
}

export interface ProjectScopedOptions extends ServiceCommandOptions {
  projectName?: string;
}

export interface AppDatasetBindOptions extends ProjectScopedOptions {
  applicationId: string;
  datasetId: string;
  dryRun?: boolean;
}

export interface AppDatasetConfigListOptions extends ProjectScopedOptions {
  applicationId: string;
  datasetType?: string;
  pageNumber?: number;
  pageSize?: number;
  activatedOnly?: boolean;
  full?: boolean;
}

export interface AppDatasetConfigGetOptions extends ProjectScopedOptions {
  applicationId: string;
  datasetId: string;
  fieldConfigVersion?: number;
  full?: boolean;
}

export interface AppDatasetConfigUpdateOptions extends ProjectScopedOptions {
  applicationId: string;
  datasetId: string;
  schemaVersion?: number;
  fieldConfigVersion?: number;
  fieldConfig?: string;
  dryRun?: boolean;
}

export interface AppDataConfigConstraintGetOptions extends ProjectScopedOptions {}

export interface AppDataBacktrackConfGetOptions extends ProjectScopedOptions {
  id: string;
  startDate?: string;
  endDate?: string;
}

export interface AppDatasetStatOptions extends ProjectScopedOptions {
  applicationId: string;
  datasetId: string;
}

export interface AppStatusOptions extends ProjectScopedOptions {
  applicationId: string;
  activatedOnly?: boolean;
}

export interface AppWaitReadyOptions extends AppStatusOptions {
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
}

export interface AppOnlineConfigGetOptions extends ProjectScopedOptions {
  applicationId: string;
  full?: boolean;
}

export interface AppOnlineConfigUpdateOptions extends ProjectScopedOptions {
  applicationId: string;
  config?: string;
  dryRun?: boolean;
}

export interface AppItemFilterUpdateOptions extends ProjectScopedOptions {
  applicationId: string;
  datasetId: string;
  condition?: string;
}

export interface AppItemFilterCountOptions extends ProjectScopedOptions {
  applicationId: string;
  datasetId: string;
}

export interface AppOnlineExpConfigGetOptions extends ProjectScopedOptions {
  applicationId: string;
}

export interface AppDefaultUserPromptGetOptions extends ProjectScopedOptions {
  applicationId: string;
}

export interface AppDisplayMappingUpdateOptions extends ProjectScopedOptions {
  applicationId: string;
  datasetId: string;
  displayMapping?: string;
}

export interface AppConnectorsListOptions extends ProjectScopedOptions {
  applicationId: string;
}

export interface DatasetUpdateOptions extends ProjectScopedOptions {
  id: string;
  version?: number;
  schema?: string;
  fieldConfig?: string;
  fieldConfigVersion?: number;
  description?: string;
}

export interface DatasetCountOptions extends ProjectScopedOptions {
  datasetId: string;
  itemFilter?: string;
}

export interface DatasetSampleGetOptions extends ProjectScopedOptions {
  datasetId: string;
  sampleFields?: string;
  itemPkId?: string;
  random?: boolean;
}

export interface DatasetSampleListOptions extends DatasetSampleGetOptions {
  size?: number;
  itemFilter?: string;
}

export interface DatasetUploadAddOptions extends ProjectScopedOptions {
  datasetId: string;
  tosBucket?: string;
  tosKey?: string;
}

export interface DatasetUploadResultOptions extends ProjectScopedOptions {
  taskId?: string;
}

export interface SearchSceneCreateOptions extends ProjectScopedOptions {
  applicationId: string;
  name?: string;
  description?: string;
}

export interface SearchSceneGetOptions extends ProjectScopedOptions {
  applicationId: string;
  sceneId: string;
}

export interface SearchSceneUpdateOptions extends ProjectScopedOptions {
  applicationId: string;
  sceneId: string;
  name?: string;
  description?: string;
  config?: string;
}

export interface RecommendSceneCreateOptions extends ProjectScopedOptions {
  applicationId: string;
  type?: string;
  name?: string;
  description?: string;
  itemDatasetId?: string;
  recommendModel?: number;
  optimizationTarget?: number;
  bhvSceneTypes?: string;
  clickEventTypes?: string;
  positiveEventTypes?: string;
  negativeEventTypes?: string;
  confirmEntryBinding?: boolean;
}

export interface RecommendSceneListOptions extends ProjectScopedOptions {
  applicationId: string;
  types?: string;
}

export interface RecommendSceneGetOptions extends ProjectScopedOptions {
  applicationId: string;
  sceneId: string;
}

export interface RecommendSceneUpdateOptions extends ProjectScopedOptions {
  applicationId: string;
  sceneId: string;
  type?: string;
  name?: string;
  description?: string;
  itemDatasetId?: string;
  bhvSceneTypes?: string;
  config?: string;
  confirmEntryBinding?: boolean;
}

export interface RecommendSceneExpConfigOptions extends RecommendSceneUpdateOptions {}

export interface RecommendRuleListOptions extends ProjectScopedOptions {
  applicationId: string;
  types?: string;
  datasetId?: string;
  invertItemDatasetId?: string;
}

export interface RecommendRuleGetOptions extends ProjectScopedOptions {
  applicationId: string;
  ruleId?: string;
}

export interface RecommendRuleUpsertOptions extends ProjectScopedOptions {
  applicationId: string;
  ruleId?: string;
  name?: string;
  type?: string;
  description?: string;
  datasetId?: string;
  config?: string;
}

export interface RecommendUserProfileOptions extends ProjectScopedOptions {
  applicationId: string;
  useRandomUser?: boolean;
  userId?: string;
}

export interface RecommendSuggestOptions extends ProjectScopedOptions {
  applicationId: string;
  sceneId: string;
  userId: string;
  requestId?: string;
  contextItemId?: string;
  items?: string;
  suggestConfig?: string;
}

export async function runAppCreateCommand(options: AppCreateOptions): Promise<void> {
  const payload = normalizeAppCreatePayload(
    (await loadJsonInput(options.data)) ??
      compactObject({
        Name: options.name,
        Description: options.description
      }),
    options.industry
  );
  requireNonEmptyObject(payload, 'Need --data or --name for app create.');
  await printResult(callOpenApi('/api/v1/CreateApplication', payload, options));
}

export async function runAppUpdateCommand(options: AppUpdateOptions): Promise<void> {
  const payload = normalizeAppUpdatePayload(
    (await loadJsonInput(options.data)) ??
      compactObject({
        AppID: options.id,
        Name: options.name,
        Icon: await loadJsonInput(options.icon),
        ProjectName: options.projectName
      }),
    options.industry
  );
  requireNonEmptyObject(payload, 'Need --data or app update fields for app update.');
  await printResult(callOpenApi('/api/v1/UpdateApplication', payload, options));
}

export async function runAppGetCommand(options: ResourceIdOptions): Promise<void> {
  const payload = (await loadJsonInput(options.data)) ?? requiredNamedIdPayload(options.id, 'application', 'AppID');
  await printResult(callOpenApi('/api/v1/GetApplication', payload, options));
}

export async function runAppListCommand(options: AppListOptions): Promise<void> {
  const payload = (await loadJsonInput(options.data)) ?? {};
  const response = await callOpenApi('/api/v1/ListApplications', payload, options);
  if (options.full) {
    await printResult(response);
    return;
  }

  if (!isRecord(response)) {
    throw new Error('ListApplications returned an unexpected response shape.');
  }

  await printResult(summarizeAppListResponse(response, options));
}

export async function runAppDeleteCommand(options: ResourceIdOptions): Promise<void> {
  const payload = (await loadJsonInput(options.data)) ?? requiredNamedIdPayload(options.id, 'application', 'AppID');
  await printResult(callOpenApi('/api/v1/DeleteApplication', payload, options));
}

export async function runAppDatasetBindCommand(options: AppDatasetBindOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      DatasetIDs: [options.datasetId],
      ProjectName: options.projectName
    });
  await printResult(callOpenApi('/api/v1/BindAppDataset', payload, options));
}

export async function runAppDatasetConfigListCommand(options: AppDatasetConfigListOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      DatasetType: options.datasetType,
      ActivatedOnly: options.activatedOnly,
      ProjectName: options.projectName
    });
  const response = await callOpenApi('/api/v1/ListAppDataConfigs', payload, options);
  if (options.full) {
    await printResult(response);
    return;
  }

  if (!isRecord(response)) {
    throw new Error('ListAppDataConfigs returned an unexpected response shape.');
  }

  await printResult(summarizeAppDatasetConfigListResponse(response, options.applicationId));
}

export async function runAppDatasetConfigGetCommand(options: AppDatasetConfigGetOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      DatasetID: options.datasetId,
      FieldsConfigVersion: options.fieldConfigVersion,
      ProjectName: options.projectName
    });
  const response = await callOpenApi('/api/v1/GetAppDataConfig', payload, options);
  if (options.full) {
    await printResult(response);
    return;
  }

  if (!isRecord(response)) {
    throw new Error('GetAppDataConfig returned an unexpected response shape.');
  }

  await printResult(summarizeAppDatasetConfigGetResponse(response, options.applicationId));
}

export async function runAppDatasetConfigUpdateCommand(options: AppDatasetConfigUpdateOptions): Promise<void> {
  const payload = normalizeAppDataConfigPayload(
    (await loadJsonInput(options.data)) ??
      compactObject({
        AppID: options.applicationId,
        DatasetID: options.datasetId,
        SchemaVersion: options.schemaVersion,
        DataConfig: await loadJsonInput(options.fieldConfig),
        FieldsConfigVersion: options.fieldConfigVersion,
        OnlySave: options.dryRun,
        ProjectName: options.projectName
      })
  );
  requireNonEmptyObject(payload, 'Need --data or dataset-config fields for app dataset-config update.');
  await printResult(callOpenApi('/api/v1/UpdateAppDataConfig', payload, options));
}

export async function runAppStatusCommand(options: AppStatusOptions): Promise<void> {
  const snapshot = await fetchAppStatusSnapshot(resolveServiceConfig(toServiceConfigInput(options)), {
    applicationId: options.applicationId,
    projectName: options.projectName,
    activatedOnly: options.activatedOnly
  });
  await printResult(snapshot);
}

export async function runAppWaitReadyCommand(options: AppWaitReadyOptions): Promise<void> {
  const config = resolveServiceConfig(toServiceConfigInput(options));
  const waitTimeoutMs = ensurePositiveInt(options.waitTimeoutMs ?? 120000, '--wait-timeout-ms');
  const pollIntervalMs = ensurePositiveInt(options.pollIntervalMs ?? 3000, '--poll-interval-ms');
  const startedAt = Date.now();
  const deadline = startedAt + waitTimeoutMs;
  let attempts = 0;
  let snapshot: AppStatusSnapshot | undefined;

  while (Date.now() <= deadline) {
    attempts += 1;
    snapshot = await fetchAppStatusSnapshot(config, {
      applicationId: options.applicationId,
      projectName: options.projectName,
      activatedOnly: options.activatedOnly
    });

    if (snapshot.runtimeSearchReady) {
      await printResult({
        ...snapshot,
        waitedMs: Date.now() - startedAt,
        attempts
      });
      return;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }

  throw new Error(buildWaitReadyTimeoutMessage(snapshot, options.applicationId, Date.now() - startedAt, attempts));
}

export async function runAppOnlineConfigGetCommand(options: AppOnlineConfigGetOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      ProjectName: options.projectName
    });
  const response = await callConsoleTopAction('GetAppOnlineConfig', payload, options);
  if (options.full) {
    await printResult(response);
    return;
  }

  if (!isRecord(response)) {
    throw new Error('GetAppOnlineConfig returned an unexpected response shape.');
  }

  await printResult(summarizeAppOnlineConfigResponse(response, options.applicationId));
}

export async function runAppOnlineConfigUpdateCommand(options: AppOnlineConfigUpdateOptions): Promise<void> {
  if (options.dryRun !== undefined) {
    throw new Error('--dry-run is not supported by the console online-config API. Remove --dry-run and retry.');
  }
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      Config: await loadJsonInput(options.config),
      ProjectName: options.projectName
    });
  requireNonEmptyObject(payload, 'Need --data or --config for app online-config update.');
  await printResult(callConsoleTopAction('UpsertAppOnlineConfig', payload, options));
}

export async function runDatasetCreateCommand(options: DatasetCreateOptions): Promise<void> {
  const payload = normalizeDatasetPayload(
    (await loadJsonInput(options.data)) ??
      compactObject({
        Name: options.name,
        Type: options.type,
        Description: options.description,
        Schema: await loadJsonInput(options.schema),
        DataFieldConfig: await loadJsonInput(options.fieldConfig)
      })
  );
  requireNonEmptyObject(payload, 'Need --data or --name/--type for dataset create.');
  await printResult(callOpenApi('/api/v1/CreateDataset', payload, options));
}

export async function runDatasetSchemaGetCommand(options: DatasetSchemaGetOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      DatasetID: options.id,
      Version: options.version,
      FieldsConfigVersion: options.fieldConfigVersion,
      ProjectName: options.projectName
    });
  await printResult(callOpenApi('/api/v1/GetDatasetSchema', payload, options));
}

export async function runDatasetSchemaCheckCommand(options: DatasetSchemaCheckOptions): Promise<void> {
  const payload = normalizeDatasetPayload(
    (await loadJsonInput(options.data)) ??
      compactObject({
        Type: options.type,
        Schema: await loadJsonInput(options.schema),
        DataFieldConfig: await loadJsonInput(options.fieldConfig),
        ProjectName: options.projectName
      })
  );
  requireNonEmptyObject(payload, 'Need --data or schema check fields for dataset schema check.');
  await printResult(callOpenApi('/api/v1/CheckDatasetSchema', payload, options));
}

export async function runDatasetGetCommand(options: DatasetGetOptions): Promise<void> {
  const payload = (await loadJsonInput(options.data)) ?? requiredNamedIdPayload(options.id, 'dataset', 'DatasetID');
  const response = await callOpenApi('/api/v1/GetDataset', payload, options);
  if (options.full) {
    await printResult(response);
    return;
  }

  if (!isRecord(response)) {
    throw new Error('GetDataset returned an unexpected response shape.');
  }

  await printResult(summarizeDatasetGetResponse(response));
}

export async function runDatasetUpdateCommand(options: DatasetUpdateOptions): Promise<void> {
  const payload = normalizeDatasetPayload(
    (await loadJsonInput(options.data)) ??
      compactObject({
        DatasetID: options.id,
        Version: options.version,
        Schema: await loadJsonInput(options.schema),
        DataFieldConfig: await loadJsonInput(options.fieldConfig),
        FieldsConfigVersion: options.fieldConfigVersion,
        Description: options.description,
        ProjectName: options.projectName
      })
  );
  requireNonEmptyObject(payload, 'Need --data or dataset update fields for dataset update.');
  await printResult(callOpenApi('/api/v1/UpdateDataset', payload, options));
}

export async function runDatasetListCommand(options: DatasetListOptions): Promise<void> {
  const payload = (await loadJsonInput(options.data)) ?? {};
  const response = await callOpenApi('/api/v1/ListDatasets', payload, options);
  if (options.full) {
    await printResult(response);
    return;
  }

  if (!isRecord(response)) {
    throw new Error('ListDatasets returned an unexpected response shape.');
  }

  await printResult(summarizeDatasetListResponse(response, options));
}

export async function runDatasetDeleteCommand(options: ResourceIdOptions): Promise<void> {
  const payload = (await loadJsonInput(options.data)) ?? requiredNamedIdPayload(options.id, 'dataset', 'DatasetID');
  await printResult(callOpenApi('/api/v1/DeleteDataset', payload, options));
}

export async function runDataWriteCommand(options: DataWriteOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      fields: await loadJsonInput(options.fields)
    });
  requireNonEmptyObject(payload, 'Need --data or --fields for data write.');
  await printResult(callRuntime(runtime => runtime.dataWrite(options.datasetId, payload), options));
}

export async function runSearchRunCommand(options: SearchRunOptions): Promise<void> {
  const config = resolveServiceConfig(toServiceConfigInput(options));
  const providedPayload = await loadJsonInput(options.data);
  let snapshot: AppStatusSnapshot | undefined;
  let datasetId = options.datasetId;

  if (!datasetId && !hasDatasetIdInPayload(providedPayload)) {
    snapshot = await fetchAppStatusSnapshot(config, {
      applicationId: options.applicationId
    });
    datasetId = snapshot.inferredSearchDataset?.datasetId;
    if (!datasetId) {
      throw new Error(buildSearchDatasetInferenceError(options.applicationId, snapshot));
    }
  }

  const payload = withDatasetIdIfMissing(
    providedPayload ??
      compactObject({
        query: options.query ? { text: options.query } : undefined,
        dataset_id: datasetId,
        page_number: 1,
        page_size: options.pageSize ?? 10
      }),
    datasetId
  );

  requireNonEmptyObject(payload, 'Need --data or --query for search run.');

  try {
    const result = await new VikingRuntimeApiClient(config).search(options.applicationId, options.sceneId, payload);
    await printResult(result);
  } catch (error) {
    if (!snapshot && isUnsupportedApplicationError(error)) {
      try {
        snapshot = await fetchAppStatusSnapshot(config, {
          applicationId: options.applicationId
        });
      } catch {
        // Ignore status lookup failures and preserve the original runtime error.
      }
    }
    throw buildSearchRunError(error, snapshot, options.applicationId, datasetId);
  }
}

export async function runSearchSceneCreateCommand(options: SearchSceneCreateOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      ProjectName: options.projectName,
      Name: options.name,
      Description: options.description
    });
  requireNonEmptyObject(payload, 'Need --data or --name for search scene create.');
  await printResult(callOpenApi('/api/v1/CreateSearchScene', payload, options));
}

export async function runSearchSceneListCommand(options: ProjectScopedOptions & { applicationId: string }): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      ProjectName: options.projectName
    });
  await printResult(callOpenApi('/api/v1/ListSearchScene', payload, options));
}

export async function runSearchSceneGetCommand(options: SearchSceneGetOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      SceneID: options.sceneId,
      ProjectName: options.projectName
    });
  await printResult(callOpenApi('/api/v1/GetSearchScene', payload, options));
}

export async function runSearchSceneUpdateCommand(options: SearchSceneUpdateOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      SceneID: options.sceneId,
      Name: options.name,
      Description: options.description,
      Config: await loadJsonInput(options.config),
      ProjectName: options.projectName
    });
  requireNonEmptyObject(payload, 'Need --data or --config for search scene update.');
  await printResult(callOpenApi('/api/v1/OnlineSearchScene', payload, options));
}

export async function runSearchSceneDeleteCommand(options: SearchSceneGetOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      SceneID: options.sceneId,
      ProjectName: options.projectName
    });
  await printResult(callOpenApi('/api/v1/DeleteSearchScene', payload, options));
}

export async function runRecommendRunCommand(options: RecommendRunOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      user: options.userId ? { _user_id: options.userId } : undefined,
      parent_items: options.parentId ? [{ _id: options.parentId }] : undefined,
      page_size: options.pageSize ?? 20
    });
  requireNonEmptyObject(payload, 'Need --data or recommend context for recommend run.');
  await printResult(callRuntime(runtime => runtime.recommend(options.applicationId, options.sceneId, payload), options));
}

export async function runRecommendSceneCreateCommand(options: RecommendSceneCreateOptions): Promise<void> {
  requireRecommendEntryBindingConfirmation(options.confirmEntryBinding, 'recommend scene create');
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      ProjectName: options.projectName,
      Type: options.type,
      Name: options.name,
      Description: options.description,
      ItemDatasetID: options.itemDatasetId,
      RecommendModel: options.recommendModel,
      RecommendOptimizationTarget: options.optimizationTarget,
      BhvSceneTypes: await loadOptionalStringArray(options.bhvSceneTypes),
      ClickEventTypes: await loadOptionalStringArray(options.clickEventTypes),
      PositiveEventTypes: await loadOptionalStringArray(options.positiveEventTypes),
      NegativeEventTypes: await loadOptionalStringArray(options.negativeEventTypes)
    });
  requireNonEmptyObject(payload, 'Need --data or required scene fields for recommend scene create.');
  requireNonEmptyArrayField(
    payload,
    'BhvSceneTypes',
    'Need --bhv-scene-types (at least one behavior scene type) or a --data payload containing BhvSceneTypes for recommend scene create.'
  );
  await printResult(callOpenApi('/api/v1/CreateRecommendScene', payload, options));
}

export async function runRecommendSceneListCommand(options: RecommendSceneListOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      ProjectName: options.projectName,
      Types: await loadOptionalStringArray(options.types)
    });
  await printResult(callOpenApi('/api/v1/ListRecommendScene', payload, options));
}

export async function runRecommendSceneGetCommand(options: RecommendSceneGetOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      SceneID: options.sceneId,
      ProjectName: options.projectName
    });
  await printResult(callOpenApi('/api/v1/GetRecommendScene', payload, options));
}

export async function runRecommendSceneUpdateCommand(options: RecommendSceneUpdateOptions): Promise<void> {
  requireRecommendEntryBindingConfirmation(options.confirmEntryBinding, 'recommend scene update');
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      SceneID: options.sceneId,
      Type: options.type,
      Name: options.name,
      Description: options.description,
      ItemDatasetID: options.itemDatasetId,
      BhvSceneTypes: await loadOptionalStringArray(options.bhvSceneTypes),
      Config: await loadJsonInput(options.config),
      ProjectName: options.projectName
    });
  requireNonEmptyObject(payload, 'Need --data or --config for recommend scene update.');
  await printResult(callOpenApi('/api/v1/OnlineRecommendScene', payload, options));
}

export async function runRecommendSceneDeleteCommand(options: RecommendSceneGetOptions): Promise<void> {
  const payload =
    (await loadJsonInput(options.data)) ??
    compactObject({
      AppID: options.applicationId,
      SceneID: options.sceneId,
      ProjectName: options.projectName
    });
  await printResult(callOpenApi('/api/v1/DeleteRecommendScene', payload, options));
}

export async function runChatSearchRunCommand(options: ChatSearchRunOptions): Promise<void> {
  const payload = ensureChatSearchSessionId(
    (await loadJsonInput(options.data)) ??
      compactObject({
        session_id: options.sessionId,
        opening_remarks: options.openingRemarks,
        input_message:
          options.openingRemarks === true
            ? undefined
            : options.message
              ? {
                  content: [
                    {
                      type: 'text',
                      text: options.message
                    }
                  ]
                }
              : undefined,
        user: options.userId ? { _user_id: options.userId } : undefined
      }),
    options.sessionId ?? randomUUID()
  );
  requireNonEmptyObject(payload, 'Need --data or --message/--opening-remarks for chat run.');
  const runtimeOptions = {
    ...options,
    timeoutMs: options.timeoutMs ?? 60000
  };
  await printResult(callRuntime(runtime => runtime.chatSearch(options.applicationId, payload), runtimeOptions));
}

export async function runProductDomainFromArgv(domain: string, argv: string[]): Promise<boolean> {
  switch (domain) {
    case 'app':
      if (argv.length === 0 || hasHelpFlag(argv)) {
        printDomainHelp(domain);
        return true;
      }
      await runAppCli(argv);
      return true;
    case 'dataset':
      if (argv.length === 0 || hasHelpFlag(argv)) {
        printDomainHelp(domain);
        return true;
      }
      await runDatasetCli(argv);
      return true;
    case 'data':
      if (argv.length === 0 || hasHelpFlag(argv)) {
        printDomainHelp(domain);
        return true;
      }
      await runDataCli(argv);
      return true;
    case 'search':
      if (argv.length === 0 || hasHelpFlag(argv)) {
        printDomainHelp(domain);
        return true;
      }
      await runSearchCli(argv);
      return true;
    case 'recommend':
      if (argv.length === 0 || hasHelpFlag(argv)) {
        printDomainHelp(domain);
        return true;
      }
      await runRecommendCli(argv);
      return true;
    case 'chat':
      if (argv.length === 0 || hasHelpFlag(argv)) {
        printDomainHelp(domain);
        return true;
      }
      await runChatSearchCli(argv);
      return true;
    case 'item':
      if (argv.length === 0 || hasHelpFlag(argv)) {
        printDomainHelp(domain);
        return true;
      }
      await runItemCli(argv);
      return true;
    default:
      return false;
  }
}

export function printProductDomainsHelp(): void {
  const publicLines = [
    'viking item profile|plan|apply',
    'viking app create|get|list|delete|update|activate|diagnose|status|wait-ready',
    'viking app dataset bind',
    'viking app dataset-config get|list|update',
    'viking app online-config get|update',
    'viking dataset create|get|list|delete|update|ingest',
    'viking dataset schema get|check',
    'viking data write|import',
    'viking search run|scene create|list|get|update|delete',
    'viking recommend run|scene create|list|get|update|delete',
    'viking chat run'
  ];

  console.log(['PRODUCT COMMANDS', renderUsageBlock(publicLines)].join('\n'));
}

function printDomainHelp(domain: string): void {
  const helpByDomain: Record<string, string> = {
    app: `${renderUsageBlock(
      [
        'viking app create --name <name> [--description <text>] [--industry <type>] [service flags]',
        'viking app update --id <application-id> [--name <name> --industry <type> --icon @icon.json] [service flags]',
        'viking app get --id <application-id> [service flags]',
        'viking app list [--name <text> --dataset-id <id> --industry <type> --state <state> --full] [service flags]',
        'viking app delete --id <application-id> [service flags]',
        'viking app activate --application-id <id> --dataset-id <id> [--field-config @config.json --online-config @config.json --wait-ready] [service flags]',
        'viking app diagnose --application-id <id> [service flags]',
        'viking app status --application-id <id> [service flags]',
        'viking app wait-ready --application-id <id> [--wait-timeout-ms <ms> --poll-interval-ms <ms>] [service flags]',
        'viking app dataset bind --application-id <id> --dataset-id <id> [service flags]',
        'viking app dataset-config get --application-id <id> --dataset-id <id> [--full] [service flags]',
        'viking app dataset-config list --application-id <id> [--full] [service flags]',
        'viking app dataset-config update --application-id <id> --dataset-id <id> [service flags]',
        'viking app online-config get --application-id <id> [--full] [service flags]',
        'viking app online-config update --application-id <id> --config @config.json [service flags]'
      ]
    )}

COMMON FLAGS
  --base-url --ak --sk --region --timeout-ms --project-name --data --format --jq --output`,
    dataset: `${renderUsageBlock(
      [
        'viking dataset create --name <name> --type <item|event|doc|image_text> [--schema @schema.json --field-config @config.json] [service flags]',
        'viking dataset get --id <dataset-id> [--full] [service flags]',
        'viking dataset update --id <dataset-id> [--schema @schema.json --field-config @config.json] [service flags]',
        'viking dataset ingest --dataset-id <id> --fields @items.json [workflow flags]',
        'viking dataset schema get --id <dataset-id> [--version <n> --field-config-version <n>] [service flags]',
        'viking dataset schema check --type <item|event|doc|image_text> [--schema @schema.json --field-config @config.json] [service flags]',
        'viking dataset list [--type <type> --name <text> --application-id <id> --full] [service flags]',
        'viking dataset delete --id <dataset-id> [service flags]'
      ]
    )}

COMMON FLAGS
  --base-url --ak --sk --region --timeout-ms --project-name --data --format --jq --output`,
    data: `${renderUsageBlock(
      [
        'viking data write --dataset-id <id> --fields @fields.json [service flags]',
        'viking data import --dataset-id <id> --fields @items.json [service flags]'
      ]
    )}

COMMON FLAGS
  --base-url --ak --sk --region --timeout-ms --data --format --jq --output`,
    item: `${renderUsageBlock(
      [
        'viking item profile --file ./items.json [output flags]',
        'viking item plan --file ./items.json [--goal <text>] [--output-dir <dir>] [--dataset-name <name>] [--application-name <name>] [output flags]',
        'viking item apply --plan-dir <dir> [--application-id <id> --dataset-id <id>] [--confirm-review --wait-ready --run-trials] [--confirm-recommend-entry-binding --recommend-bhv-scene-types <scene_a,scene_b>] [workflow flags]'
      ]
    )}

DESCRIPTION
  Understand arbitrary structured item data, generate a reviewable onboarding plan, and apply it to
  create / ingest / activate a Viking item-search app. Use \`--dry-run\` first when reviewing a plan.

COMMON FLAGS
  profile/plan:
    --format --jq --output
  apply:
    --base-url --ak --sk --region --timeout-ms --project-name --format --jq --output`,
    search: `${renderUsageBlock(
      [
        'viking search run --application-id <id> [--scene-id <id>] --query <text> [service flags]',
        'viking search scene create --application-id <id> --name <name> [service flags]',
        'viking search scene list --application-id <id> [service flags]',
        'viking search scene get --application-id <id> --scene-id <id> [service flags]',
        'viking search scene update --application-id <id> --scene-id <id> --config @scene.json [service flags]',
        'viking search scene delete --application-id <id> --scene-id <id> [service flags]'
      ]
    )}

COMMON FLAGS
  --base-url --ak --sk --region --timeout-ms --project-name --data --format --jq --output`,
    recommend: `${renderUsageBlock(
      [
        'viking recommend run --application-id <id> --scene-id <id> [--user-id <id>] [--parent-id <id>] [service flags]',
        'viking recommend scene create --application-id <id> --type for_you --name <name> --item-dataset-id <id> --confirm-entry-binding [service flags]',
        'viking recommend scene list --application-id <id> [service flags]',
        'viking recommend scene get --application-id <id> --scene-id <id> [service flags]',
        'viking recommend scene update --application-id <id> --scene-id <id> --config @scene.json --confirm-entry-binding [service flags]',
        'viking recommend scene delete --application-id <id> --scene-id <id> [service flags]'
      ]
    )}

COMMON FLAGS
  --base-url --ak --sk --region --timeout-ms --project-name --data --format --jq --output`,
    chat: `${renderUsageBlock(
      [
        'viking chat run --application-id <id> [--session-id <id>] [--message <text>|--opening-remarks true] [service flags]'
      ]
    )}

COMMON FLAGS
  --base-url --ak --sk --region --timeout-ms --data --format --jq --output`,
  };

  console.log(helpByDomain[domain] ?? `Unknown domain: ${domain}`);
}

async function runAppCli(argv: string[]): Promise<void> {
  const action = argv[0];
  const values = parseStandaloneOptions(argv.slice(1));
  const serviceOptions = toStandaloneServiceOptions(values);
  const projectOptions = toProjectScopedOptions(values);
  switch (action) {
    case 'create':
      await runAppCreateCommand({
        ...serviceOptions,
        name: optionalString(values.name),
        description: optionalString(values.description),
        industry: optionalString(values.industry)
      });
      return;
    case 'update':
      await runAppUpdateCommand({
        ...projectOptions,
        id: requiredString(values.id, '--id'),
        name: optionalString(values.name),
        industry: optionalString(values.industry),
        icon: optionalString(values.icon)
      });
      return;
    case 'get':
      await runAppGetCommand({ ...serviceOptions, id: optionalString(values.id) });
      return;
    case 'list':
      await runAppListCommand({
        ...serviceOptions,
        name: optionalString(values.name),
        datasetId: optionalString(values['dataset-id']),
        industry: optionalString(values.industry),
        state: optionalString(values.state),
        full: optionalBoolean(values.full)
      });
      return;
    case 'delete':
      await runAppDeleteCommand({ ...serviceOptions, id: optionalString(values.id) });
      return;
    case 'activate':
      await runAppActivateWorkflowCommand({
        ...projectOptions,
        applicationId: requiredString(values['application-id'], '--application-id'),
        datasetId: requiredString(values['dataset-id'], '--dataset-id'),
        fieldConfig: optionalString(values['field-config']),
        schemaVersion: parseOptionalInt(optionalString(values['schema-version'])),
        fieldConfigVersion: parseOptionalInt(optionalString(values['field-config-version'])),
        onlineConfig: optionalString(values['online-config']),
        waitReady: optionalBoolean(values['wait-ready']),
        waitTimeoutMs: parseOptionalInt(optionalString(values['wait-timeout-ms'])),
        pollIntervalMs: parseOptionalInt(optionalString(values['poll-interval-ms'])),
        activatedOnly: optionalBoolean(values['activated-only'])
      });
      return;
    case 'diagnose':
      await runAppDiagnoseWorkflowCommand({
        ...projectOptions,
        applicationId: requiredString(values['application-id'], '--application-id'),
        activatedOnly: optionalBoolean(values['activated-only'])
      });
      return;
    case 'status':
      await runAppStatusCommand({
        ...projectOptions,
        applicationId: requiredString(values['application-id'], '--application-id'),
        activatedOnly: optionalBoolean(values['activated-only'])
      });
      return;
    case 'wait-ready':
      await runAppWaitReadyCommand({
        ...projectOptions,
        applicationId: requiredString(values['application-id'], '--application-id'),
        activatedOnly: optionalBoolean(values['activated-only']),
        waitTimeoutMs: parseOptionalInt(optionalString(values['wait-timeout-ms'])),
        pollIntervalMs: parseOptionalInt(optionalString(values['poll-interval-ms']))
      });
      return;
    case 'dataset': {
      const subAction = argv[1];
      if (subAction === 'bind') {
        await runAppDatasetBindCommand({
          ...projectOptions,
          applicationId: requiredString(values['application-id'], '--application-id'),
          datasetId: requiredString(values['dataset-id'], '--dataset-id'),
          dryRun: optionalBoolean(values['dry-run'])
        });
        return;
      }
      throw new Error(`Unknown app dataset subcommand: ${subAction}`);
    }
    case 'dataset-config': {
      const subAction = argv[1];
      if (subAction === 'get') {
        await runAppDatasetConfigGetCommand({
          ...projectOptions,
          applicationId: requiredString(values['application-id'], '--application-id'),
          datasetId: requiredString(values['dataset-id'], '--dataset-id'),
          fieldConfigVersion: parseOptionalInt(optionalString(values['field-config-version'])),
          full: optionalBoolean(values.full)
        });
        return;
      }
      if (subAction === 'list') {
        await runAppDatasetConfigListCommand({
          ...projectOptions,
          applicationId: requiredString(values['application-id'], '--application-id'),
          datasetType: optionalString(values['dataset-type']),
          pageNumber: parseOptionalInt(optionalString(values['page-number'])),
          pageSize: parseOptionalInt(optionalString(values['page-size'])),
          activatedOnly: optionalBoolean(values['activated-only']),
          full: optionalBoolean(values.full)
        });
        return;
      }
      if (subAction === 'update') {
        await runAppDatasetConfigUpdateCommand({
          ...projectOptions,
          applicationId: requiredString(values['application-id'], '--application-id'),
          datasetId: requiredString(values['dataset-id'], '--dataset-id'),
          schemaVersion: parseOptionalInt(optionalString(values['schema-version'])),
          fieldConfigVersion: parseOptionalInt(optionalString(values['field-config-version'])),
          fieldConfig: optionalString(values['field-config']),
          dryRun: optionalBoolean(values['dry-run'])
        });
        return;
      }
      throw new Error(`Unknown app dataset-config subcommand: ${subAction}`);
    }
    case 'online-config': {
      const subAction = argv[1];
      if (subAction === 'get') {
        await runAppOnlineConfigGetCommand({
          ...projectOptions,
          applicationId: requiredString(values['application-id'], '--application-id'),
          full: optionalBoolean(values.full)
        });
        return;
      }
      if (subAction === 'update') {
        await runAppOnlineConfigUpdateCommand({
          ...projectOptions,
          applicationId: requiredString(values['application-id'], '--application-id'),
          config: optionalString(values.config),
          dryRun: optionalBoolean(values['dry-run'])
        });
        return;
      }
      throw new Error(`Unknown app online-config subcommand: ${subAction}`);
    }
    default:
      throw new Error(`Unknown app subcommand: ${action}`);
  }
}

async function runDatasetCli(argv: string[]): Promise<void> {
  const action = argv[0];
  const values = parseStandaloneOptions(argv.slice(1));
  const serviceOptions = toStandaloneServiceOptions(values);
  const projectOptions = toProjectScopedOptions(values);
  switch (action) {
    case 'create':
      await runDatasetCreateCommand({
        ...serviceOptions,
        name: optionalString(values.name),
        type: optionalString(values.type),
        description: optionalString(values.description),
        schema: optionalString(values.schema),
        fieldConfig: optionalString(values['field-config'])
      });
      return;
    case 'get':
      await runDatasetGetCommand({ ...serviceOptions, id: optionalString(values.id), full: optionalBoolean(values.full) });
      return;
    case 'schema': {
      const subAction = argv[1];
      if (subAction === 'get') {
        await runDatasetSchemaGetCommand({
          ...projectOptions,
          id: requiredString(values.id, '--id'),
          version: parseOptionalInt(optionalString(values.version)),
          fieldConfigVersion: parseOptionalInt(optionalString(values['field-config-version']))
        });
        return;
      }
      if (subAction === 'check') {
        await runDatasetSchemaCheckCommand({
          ...projectOptions,
          type: optionalString(values.type),
          schema: optionalString(values.schema),
          fieldConfig: optionalString(values['field-config'])
        });
        return;
      }
      throw new Error(`Unknown dataset schema subcommand: ${subAction}`);
    }
    case 'update':
      await runDatasetUpdateCommand({
        ...projectOptions,
        id: requiredString(values.id, '--id'),
        version: parseOptionalInt(optionalString(values.version)),
        schema: optionalString(values.schema),
        fieldConfig: optionalString(values['field-config']),
        fieldConfigVersion: parseOptionalInt(optionalString(values['field-config-version'])),
        description: optionalString(values.description)
      });
      return;
    case 'ingest':
      await runDatasetIngestWorkflowCommand({
        ...serviceOptions,
        datasetId: requiredString(values['dataset-id'], '--dataset-id'),
        fields: optionalString(values.fields)
      });
      return;
    case 'list':
      await runDatasetListCommand({
        ...serviceOptions,
        type: optionalString(values.type),
        name: optionalString(values.name),
        applicationId: optionalString(values['application-id']),
        full: optionalBoolean(values.full)
      });
      return;
    case 'delete':
      await runDatasetDeleteCommand({ ...serviceOptions, id: optionalString(values.id) });
      return;
    default:
      throw new Error(`Unknown dataset subcommand: ${action}`);
  }
}

async function runDataCli(argv: string[]): Promise<void> {
  const action = argv[0];
  const values = parseStandaloneOptions(argv.slice(1));
  const serviceOptions = toStandaloneServiceOptions(values);
  const datasetId = requiredString(values['dataset-id'], '--dataset-id');
  switch (action) {
    case 'write':
      await runDataWriteCommand({ ...serviceOptions, datasetId, fields: optionalString(values.fields) });
      return;
    case 'import':
      await runDataImportShortcutCommand({ ...serviceOptions, datasetId, fields: optionalString(values.fields) });
      return;
    default:
      throw new Error(`Unknown data subcommand: ${action}`);
  }
}

async function runItemCli(argv: string[]): Promise<void> {
  const action = argv[0];
  const values = parseStandaloneOptions(argv.slice(1));

  switch (action) {
    case 'profile':
      await runItemProfileCommand({
        file: requiredString(values.file, '--file')
      });
      return;
    case 'plan':
      await runItemPlanCommand({
        file: requiredString(values.file, '--file'),
        goal: optionalString(values.goal),
        outputDir: optionalString(values['output-dir']),
        datasetName: optionalString(values['dataset-name']),
        applicationName: optionalString(values['application-name']),
        projectName: optionalString(values['project-name'])
      });
      return;
    case 'apply':
      await runItemApplyCommand({
        ...toStandaloneServiceOptions(values),
        planDir: requiredString(values['plan-dir'], '--plan-dir'),
        projectName: optionalString(values['project-name']),
        applicationId: optionalString(values['application-id']),
        datasetId: optionalString(values['dataset-id']),
        applicationName: optionalString(values['application-name']),
        datasetName: optionalString(values['dataset-name']),
        waitReady: optionalBoolean(values['wait-ready']),
        waitTimeoutMs: parseOptionalInt(optionalString(values['wait-timeout-ms'])),
        pollIntervalMs: parseOptionalInt(optionalString(values['poll-interval-ms'])),
        runTrials: optionalBoolean(values['run-trials']),
        searchQuery: optionalString(values['search-query']),
        chatMessage: optionalString(values['chat-message']),
        confirmReview: optionalBoolean(values['confirm-review']),
        confirmRecommendEntryBinding: optionalBoolean(values['confirm-recommend-entry-binding']),
        force: optionalBoolean(values.force),
        recommendSceneType: optionalString(values['recommend-scene-type']),
        recommendSceneName: optionalString(values['recommend-scene-name']),
        recommendBhvSceneTypes: splitCommaList(optionalString(values['recommend-bhv-scene-types'])),
        recommendUserId: optionalString(values['recommend-user-id']),
        recommendParentId: optionalString(values['recommend-parent-id']),
        dryRun: optionalBoolean(values['dry-run'])
      });
      return;
    default:
      throw new Error(`Unknown item subcommand: ${action}`);
  }
}

async function runSearchCli(argv: string[]): Promise<void> {
  const action = argv[0];
  const values = parseStandaloneOptions(argv.slice(1));
  const serviceOptions = toStandaloneServiceOptions(values);
  const projectOptions = toProjectScopedOptions(values);
  const applicationId = requiredString(values['application-id'], '--application-id');
  switch (action) {
    case 'run':
      await runSearchRunCommand({
        ...serviceOptions,
        applicationId,
        sceneId: optionalString(values['scene-id']),
        datasetId: optionalString(values['dataset-id']),
        query: optionalString(values.query),
        pageSize: parseOptionalInt(optionalString(values['page-size']))
      });
      return;
    case 'scene': {
      const subAction = argv[1];
      switch (subAction) {
        case 'create':
          await runSearchSceneCreateCommand({
            ...projectOptions,
            applicationId,
            name: optionalString(values.name),
            description: optionalString(values.description)
          });
          return;
        case 'list':
          await runSearchSceneListCommand({ ...projectOptions, applicationId });
          return;
        case 'get':
          await runSearchSceneGetCommand({
            ...projectOptions,
            applicationId,
            sceneId: requiredString(values['scene-id'], '--scene-id')
          });
          return;
        case 'update':
          await runSearchSceneUpdateCommand({
            ...projectOptions,
            applicationId,
            sceneId: requiredString(values['scene-id'], '--scene-id'),
            name: optionalString(values.name),
            description: optionalString(values.description),
            config: optionalString(values.config)
          });
          return;
        case 'delete':
          await runSearchSceneDeleteCommand({
            ...projectOptions,
            applicationId,
            sceneId: requiredString(values['scene-id'], '--scene-id')
          });
          return;
        default:
          throw new Error(`Unknown search scene subcommand: ${subAction}`);
      }
    }
    default:
      throw new Error(`Unknown search subcommand: ${action}`);
  }
}

async function runRecommendCli(argv: string[]): Promise<void> {
  const action = argv[0];
  const values = parseStandaloneOptions(argv.slice(1));
  const serviceOptions = toStandaloneServiceOptions(values);
  const projectOptions = toProjectScopedOptions(values);
  const applicationId = requiredString(values['application-id'], '--application-id');
  if (action === 'run') {
    await runRecommendRunCommand({
      ...serviceOptions,
      applicationId,
      sceneId: requiredString(values['scene-id'], '--scene-id'),
      userId: optionalString(values['user-id']),
      parentId: optionalString(values['parent-id']),
      pageSize: parseOptionalInt(optionalString(values['page-size']))
    });
    return;
  }

  if (action === 'scene') {
    const subAction = argv[1];
    switch (subAction) {
      case 'create':
        await runRecommendSceneCreateCommand({
          ...projectOptions,
          applicationId,
          type: optionalString(values.type),
          name: optionalString(values.name),
          description: optionalString(values.description),
          itemDatasetId: optionalString(values['item-dataset-id']),
          recommendModel: parseOptionalInt(optionalString(values['recommend-model'])),
          optimizationTarget: parseOptionalInt(optionalString(values['optimization-target'])),
          bhvSceneTypes: optionalString(values['bhv-scene-types']),
          confirmEntryBinding: optionalBoolean(values['confirm-entry-binding']),
          clickEventTypes: optionalString(values['click-event-types']),
          positiveEventTypes: optionalString(values['positive-event-types']),
          negativeEventTypes: optionalString(values['negative-event-types'])
        });
        return;
      case 'list':
        await runRecommendSceneListCommand({
          ...projectOptions,
          applicationId,
          types: optionalString(values.types)
        });
        return;
      case 'get':
        await runRecommendSceneGetCommand({
          ...projectOptions,
          applicationId,
          sceneId: requiredString(values['scene-id'], '--scene-id')
        });
        return;
      case 'update':
        await runRecommendSceneUpdateCommand({
          ...projectOptions,
          applicationId,
          sceneId: requiredString(values['scene-id'], '--scene-id'),
          type: optionalString(values.type),
          name: optionalString(values.name),
          description: optionalString(values.description),
          itemDatasetId: optionalString(values['item-dataset-id']),
          bhvSceneTypes: optionalString(values['bhv-scene-types']),
          config: optionalString(values.config),
          confirmEntryBinding: optionalBoolean(values['confirm-entry-binding'])
        });
        return;
      case 'delete':
        await runRecommendSceneDeleteCommand({
          ...projectOptions,
          applicationId,
          sceneId: requiredString(values['scene-id'], '--scene-id')
        });
        return;
      default:
        throw new Error(`Unknown recommend scene subcommand: ${subAction}`);
    }
  }

  throw new Error(`Unknown recommend subcommand: ${action}`);
}

async function runChatSearchCli(argv: string[]): Promise<void> {
  const action = argv[0];
  const values = parseStandaloneOptions(argv.slice(1));
  const serviceOptions = toStandaloneServiceOptions(values);
  if (action !== 'run') {
    throw new Error(`Unknown chat subcommand: ${action}`);
  }

  await runChatSearchRunCommand({
    ...serviceOptions,
    applicationId: requiredString(values['application-id'], '--application-id'),
    sessionId: optionalString(values['session-id']),
    message: optionalString(values.message),
    openingRemarks: parseBooleanString(optionalString(values['opening-remarks'])),
    userId: optionalString(values['user-id'])
  });
}

function parseStandaloneOptions(argv: string[]) {
  const { values } = parseArgs({
    args: argv,
    allowPositionals: true,
    strict: false,
    options: {
      format: { type: 'string' },
      json: { type: 'boolean' },
      table: { type: 'boolean' },
      yaml: { type: 'boolean' },
      pretty: { type: 'boolean' },
      ndjson: { type: 'boolean' },
      csv: { type: 'boolean' },
      jq: { type: 'string', short: 'q' },
      output: { type: 'string', short: 'o' },
      'output-dir': { type: 'string' },
      'base-url': { type: 'string' },
      ak: { type: 'string' },
      sk: { type: 'string' },
      region: { type: 'string' },
      'timeout-ms': { type: 'string' },
      data: { type: 'string' },
      file: { type: 'string' },
      goal: { type: 'string' },
      id: { type: 'string' },
      'plan-dir': { type: 'string' },
      name: { type: 'string' },
      'application-name': { type: 'string' },
      'dataset-name': { type: 'string' },
      description: { type: 'string' },
      industry: { type: 'string' },
      icon: { type: 'string' },
      type: { type: 'string' },
      schema: { type: 'string' },
      'field-config': { type: 'string' },
      'online-config': { type: 'string' },
      'dataset-id': { type: 'string' },
      fields: { type: 'string' },
      full: { type: 'boolean' },
      'application-id': { type: 'string' },
      'scene-id': { type: 'string' },
      'project-name': { type: 'string' },
      'dry-run': { type: 'boolean' },
      'schema-version': { type: 'string' },
      'field-config-version': { type: 'string' },
      version: { type: 'string' },
      config: { type: 'string' },
      query: { type: 'string' },
      'search-query': { type: 'string' },
      'chat-message': { type: 'string' },
      'page-size': { type: 'string' },
      'user-id': { type: 'string' },
      'parent-id': { type: 'string' },
      'session-id': { type: 'string' },
      message: { type: 'string' },
      'opening-remarks': { type: 'string' },
      'item-dataset-id': { type: 'string' },
      'dataset-type': { type: 'string' },
      'page-number': { type: 'string' },
      'activated-only': { type: 'boolean' },
      'wait-ready': { type: 'boolean' },
      'run-trials': { type: 'boolean' },
      'confirm-review': { type: 'boolean' },
      'confirm-recommend-entry-binding': { type: 'boolean' },
      'confirm-entry-binding': { type: 'boolean' },
      force: { type: 'boolean' },
      'wait-timeout-ms': { type: 'string' },
      'poll-interval-ms': { type: 'string' },
      types: { type: 'string' },
      'recommend-model': { type: 'string' },
      'optimization-target': { type: 'string' },
      'recommend-scene-type': { type: 'string' },
      'recommend-scene-name': { type: 'string' },
      'recommend-bhv-scene-types': { type: 'string' },
      'recommend-user-id': { type: 'string' },
      'recommend-parent-id': { type: 'string' },
      'bhv-scene-types': { type: 'string' },
      'click-event-types': { type: 'string' },
      'positive-event-types': { type: 'string' },
      'negative-event-types': { type: 'string' },
    }
  });

  return values;
}

type StandaloneValues = ReturnType<typeof parseStandaloneOptions>;

function toStandaloneServiceOptions(values: StandaloneValues): ServiceCommandOptions {
  return compactObject({
    baseUrl: optionalString(values['base-url']),
    accessKeyId: optionalString(values.ak),
    secretKey: optionalString(values.sk),
    region: optionalString(values.region),
    timeoutMs: parseOptionalInt(optionalString(values['timeout-ms'])),
    data: optionalString(values.data)
  });
}

function toProjectScopedOptions(values: StandaloneValues): ProjectScopedOptions {
  return compactObject({
    ...toStandaloneServiceOptions(values),
    projectName: optionalString(values['project-name'])
  });
}

async function callOpenApi(pathname: string, payload: unknown, options: ServiceCommandOptions): Promise<unknown> {
  const config = resolveServiceConfig(toServiceConfigInput(options));
  return new VikingOpenApiClient(config).post(pathname, payload);
}

async function callConsoleTopAction(action: string, payload: unknown, options: ServiceCommandOptions): Promise<unknown> {
  const entry = getConsoleTopAction(action);
  if (!entry) {
    throw new Error(`Unknown console top action: ${action}`);
  }
  return callOpenApi(entry.path, payload, options);
}

async function callRuntime(
  callback: (client: VikingRuntimeApiClient) => Promise<unknown>,
  options: ServiceCommandOptions
): Promise<unknown> {
  const config = resolveServiceConfig(toServiceConfigInput(options));
  const client = new VikingRuntimeApiClient(config);
  return callback(client);
}

function toServiceConfigInput(options: ServiceCommandOptions): ServiceConfigInput {
  return {
    baseUrl: options.baseUrl,
    accessKeyId: options.accessKeyId,
    secretKey: options.secretKey,
    region: options.region,
    timeoutMs: options.timeoutMs
  };
}

async function printResult(result: unknown): Promise<void> {
  await printOutput(result);
}

const DATASET_TYPE_ALIASES: Record<string, number> = {
  item: 1,
  query: 2,
  video: 3,
  'user-event': 4,
  userevent: 4,
  user_event: 4,
  behavior: 4,
  behaviour: 4,
  doc: 5,
  document: 6
};

const DATASET_FIELD_TYPE_ALIASES: Record<string, number> = {
  string: 1,
  text: 1,
  keyword: 1,
  int32: 2,
  int: 3,
  int64: 3,
  long: 3,
  float: 4,
  double: 4,
  number: 4,
  bool: 5,
  boolean: 5,
  'array<string>': 6,
  'string[]': 6,
  arraystring: 6,
  strings: 6,
  'array<int32>': 7,
  'int32[]': 7,
  arrayint32: 7,
  'array<int64>': 8,
  'int64[]': 8,
  'int[]': 8,
  arrayint64: 8,
  longs: 8,
  'array<float>': 9,
  'float[]': 9,
  'number[]': 9,
  arrayfloat: 9,
  object: 10,
  json: 10,
  'array<object>': 11,
  'object[]': 11,
  arrayobject: 11
};

const DATASET_STATE_LABELS: Record<number, string> = {
  0: 'unknown',
  1: 'init',
  2: 'pending',
  3: 'ready',
  4: 'deleting',
  5: 'deleted'
};

const DATASET_TYPE_LABELS: Record<number, string> = {
  0: 'unknown',
  1: 'item',
  2: 'query',
  3: 'video',
  4: 'user_event',
  5: 'doc',
  6: 'document'
};

const DATASET_FIELD_TYPE_LABELS: Record<number, string> = {
  1: 'string',
  2: 'int32',
  3: 'int64',
  4: 'float',
  5: 'bool',
  6: 'array<string>',
  7: 'array<int32>',
  8: 'array<int64>',
  9: 'array<float>',
  10: 'object',
  11: 'array<object>'
};

const APP_STATE_LABELS: Record<number, string> = {
  0: 'AppInit',
  1: 'AppReady',
  2: 'AppDeleting',
  3: 'AppDeleted',
  4: 'AppNotReady'
};

const APP_DATA_CONFIG_STATE_LABELS: Record<number, string> = {
  0: 'AppDataConfigInit',
  1: 'AppDataConfigInActive',
  2: 'AppDataConfigActive',
  3: 'AppDataConfigUpdating',
  4: 'AppDataConfigActivated',
  5: 'AppDataConfigDeleting',
  6: 'AppDataConfigDeleted',
  7: 'AppDataConfigOffline',
  8: 'AppDataConfigOfflining'
};

const DEFAULT_APPLICATION_INDUSTRY = 1;
const VALID_APPLICATION_INDUSTRIES = new Set([1, 2, 3, 4, 5, 20]);
const APPLICATION_INDUSTRY_ALIASES: Record<string, number> = {
  none: 0,
  ecommerce: 1,
  'e-commerce': 1,
  material: 2,
  video: 3,
  news: 4,
  social: 5,
  'social-platform': 5,
  'social-platforms': 5,
  socialplatform: 5,
  other: 20
};

function normalizeAppCreatePayload(payload: unknown, industry?: string): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  const explicitIndustry = industry ? parseApplicationIndustry(industry, '--industry') : undefined;
  const payloadIndustry = parseApplicationIndustryValue(payload.Industry);

  return {
    ...payload,
    Industry: explicitIndustry ?? payloadIndustry ?? DEFAULT_APPLICATION_INDUSTRY
  };
}

function normalizeAppUpdatePayload(payload: unknown, industry?: string): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  const explicitIndustry = industry ? parseApplicationIndustry(industry, '--industry') : undefined;
  const payloadIndustry = payload.Industry === undefined ? undefined : parseApplicationIndustryValue(payload.Industry);

  return compactObject({
    ...payload,
    Industry: explicitIndustry ?? payloadIndustry
  });
}

function normalizeDatasetPayload(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  const normalized: Record<string, unknown> = { ...payload };
  delete normalized.FieldConfig;

  if (payload.Type !== undefined) {
    normalized.Type = parseDatasetTypeValue(payload.Type);
  }

  if (payload.Schema !== undefined) {
    normalized.Schema = normalizeDatasetSchemaFields(payload.Schema);
  }

  const normalizedFieldConfig = normalizeDataFieldConfig(payload.DataFieldConfig ?? payload.FieldConfig);
  if (normalizedFieldConfig !== undefined) {
    normalized.DataFieldConfig = normalizedFieldConfig;
  }

  return normalized;
}

function normalizeAppDataConfigPayload(payload: unknown): unknown {
  if (!isRecord(payload)) {
    return payload;
  }

  const normalized: Record<string, unknown> = { ...payload };
  delete normalized.FieldConfig;

  const normalizedConfig = normalizeDataFieldConfig(payload.DataConfig ?? payload.FieldConfig);
  if (normalizedConfig !== undefined) {
    normalized.DataConfig = normalizedConfig;
  }

  if (payload.DatasetType !== undefined) {
    normalized.DatasetType = parseDatasetTypeValue(payload.DatasetType);
  }

  return normalized;
}

function summarizeAppListResponse(response: Record<string, unknown>, options: AppListOptions): Record<string, unknown> {
  const apps = extractAppListEntries(response);
  const requestedName = options.name?.trim().toLowerCase();
  const requestedDatasetId = options.datasetId?.trim();
  const requestedIndustry = options.industry ? parseApplicationIndustry(options.industry, '--industry') : undefined;
  const requestedState = options.state ? parseAppStateValue(options.state) : undefined;
  const filtered = apps.filter(entry => {
    if (requestedName && !String(entry.Name ?? '').toLowerCase().includes(requestedName)) {
      return false;
    }

    if (requestedDatasetId) {
      const itemDatasetIds = asStringArray(entry.ItemDatasetIDs);
      const documentDatasetIds = asStringArray(entry.DocumentDatasetIDs);
      const datasets = asObjectArray(entry.Datasets).map(dataset => String(dataset.DatasetID ?? '')).filter(Boolean);
      const allDatasetIds = new Set([...itemDatasetIds, ...documentDatasetIds, ...datasets]);
      if (!allDatasetIds.has(requestedDatasetId)) {
        return false;
      }
    }

    if (requestedIndustry !== undefined && toInteger(entry.Industry) !== requestedIndustry) {
      return false;
    }

    if (requestedState !== undefined && toInteger(entry.State) !== requestedState) {
      return false;
    }

    return true;
  });

  return {
    ResponseMetadata: response.ResponseMetadata,
    Result: compactObject({
      totalApplications: apps.length,
      returnedApplications: filtered.length,
      filters: compactObject({
        name: options.name?.trim() || undefined,
        datasetId: requestedDatasetId,
        industry: requestedIndustry !== undefined ? formatApplicationIndustryLabel(requestedIndustry) : undefined,
        state: requestedState !== undefined ? formatAppStateLabel(requestedState) : undefined
      }),
      applications: filtered.map(summarizeAppEntry)
    })
  };
}

function extractAppListEntries(response: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!isRecord(response.Result) || !Array.isArray(response.Result.Apps)) {
    return [];
  }

  return response.Result.Apps.filter(isRecord);
}

function summarizeAppEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const itemDatasetIds = asStringArray(entry.ItemDatasetIDs);
  const documentDatasetIds = asStringArray(entry.DocumentDatasetIDs);
  const recommendSceneIds = asStringArray(entry.RecommendSceneIds);
  const appState = toInteger(entry.State);
  const industry = toInteger(entry.Industry);

  return compactObject({
    applicationId: entry.AppID,
    name: entry.Name,
    state: appState !== undefined ? formatAppStateLabel(appState) : undefined,
    stateCode: appState,
    industry: industry !== undefined ? formatApplicationIndustryLabel(industry) : undefined,
    industryCode: industry,
    itemDatasetCount: itemDatasetIds.length,
    documentDatasetCount: documentDatasetIds.length,
    recommendSceneCount: recommendSceneIds.length,
    itemDatasetIds,
    documentDatasetIds,
    recommendSceneIds,
    description: entry.Description,
    language: entry.Language,
    updatedAt: entry.UpdatedAt,
    createdAt: entry.CreatedAt
  });
}

function summarizeDatasetGetResponse(response: Record<string, unknown>): Record<string, unknown> {
  const dataset = isRecord(response.Result) ? response.Result : undefined;
  if (!dataset) {
    throw new Error('GetDataset response is missing Result.');
  }

  return {
    ResponseMetadata: response.ResponseMetadata,
    Result: summarizeDatasetRecord(dataset)
  };
}

function summarizeDatasetRecord(dataset: Record<string, unknown>): Record<string, unknown> {
  const dataFieldConfig = isRecord(dataset.DataFieldConfig) ? dataset.DataFieldConfig : undefined;
  const applications = asObjectArray(dataset.Applications).map(application =>
    compactObject({
      appId: application.AppID,
      name: application.Name
    })
  );

  return compactObject({
    datasetId: dataset.DatasetID,
    name: dataset.Name,
    type: formatDatasetTypeOrUndefined(dataset.Type),
    typeCode: toInteger(dataset.Type),
    state: formatDatasetStateOrUndefined(dataset.State),
    stateCode: toInteger(dataset.State),
    dataNum: dataset.DataNum,
    preProcessedDataNum: dataset.PreProcessedDataNum,
    version: dataset.Version,
    fieldsConfigVersion: dataset.FieldsConfigVersion,
    description: dataset.Description,
    datasetDescription: dataFieldConfig?.DatasetDescription,
    applicationCount: applications.length,
    applications,
    indexFields: asStringArray(dataFieldConfig?.IndexFields),
    filterFields: asStringArray(dataFieldConfig?.FilterFields),
    suggestFields: asStringArray(dataFieldConfig?.SuggestFields),
    imageIndexFields: asStringArray(dataFieldConfig?.ImageIndexFields),
    fields: summarizeDatasetFields(asObjectArray(dataset.Schema), dataFieldConfig),
    updatedAt: dataset.UpdatedAt,
    createdAt: dataset.CreatedAt
  });
}

function summarizeAppDatasetConfigListResponse(response: Record<string, unknown>, applicationId: string): Record<string, unknown> {
  const result = isRecord(response.Result) ? response.Result : undefined;
  const configs = result && Array.isArray(result.Config) ? result.Config.filter(isRecord) : [];
  return {
    ResponseMetadata: response.ResponseMetadata,
    Result: {
      applicationId,
      returnedConfigs: configs.length,
      datasetConfigs: configs.map(config => summarizeAppDatasetConfig(config, false))
    }
  };
}

function summarizeAppDatasetConfigGetResponse(response: Record<string, unknown>, applicationId: string): Record<string, unknown> {
  const result = isRecord(response.Result) ? response.Result : undefined;
  const config = result && isRecord(result.Config) ? result.Config : undefined;
  if (!config) {
    throw new Error('GetAppDataConfig response is missing Result.Config.');
  }

  return {
    ResponseMetadata: response.ResponseMetadata,
    Result: {
      applicationId,
      datasetConfig: summarizeAppDatasetConfig(config, true)
    }
  };
}

function summarizeAppDatasetConfig(config: Record<string, unknown>, includeFields: boolean): Record<string, unknown> {
  const dataset = isRecord(config.Dataset) ? config.Dataset : undefined;
  const dataConfig = isRecord(config.DataConfig) ? config.DataConfig : undefined;
  const schema = asObjectArray(config.Schema);
  const fields = includeFields ? summarizeDatasetFields(schema, dataConfig) : undefined;

  return compactObject({
    datasetId: dataset?.DatasetID,
    datasetName: dataset?.Name,
    datasetType: formatDatasetTypeOrUndefined(dataset?.Type),
    datasetTypeCode: toInteger(dataset?.Type),
    schemaVersion: config.SchemaVersion,
    state: formatAppDataConfigStateOrUndefined(config.State),
    stateCode: toInteger(config.State),
    processedDataNum: config.DatasetProcessedDataNum,
    firstUpdating: config.IsFirstUpdating,
    lastUpdatedTimestamp: config.LastUpdatedTimestamp,
    datasetDescription: dataConfig?.DatasetDescription,
    indexFields: asStringArray(dataConfig?.IndexFields),
    filterFields: asStringArray(dataConfig?.FilterFields),
    suggestFields: asStringArray(dataConfig?.SuggestFields),
    imageIndexFields: asStringArray(dataConfig?.ImageIndexFields),
    fieldDescriptionCount: objectSize(dataConfig?.FieldDescMap),
    fields
  });
}

function summarizeAppOnlineConfigResponse(response: Record<string, unknown>, applicationId: string): Record<string, unknown> {
  const result = isRecord(response.Result) ? response.Result : undefined;
  const config = result && isRecord(result.Config) ? result.Config : undefined;
  const chatConfig = config && isRecord(config.ChatConfig) ? config.ChatConfig : undefined;
  const openingConfig = chatConfig && isRecord(chatConfig.OpeningRemarksConfig) ? chatConfig.OpeningRemarksConfig : undefined;
  const banWords = asStringArray(chatConfig?.BanWords);

  return {
    ResponseMetadata: response.ResponseMetadata,
    Result: compactObject({
      applicationId,
      configDomains: config ? Object.keys(config) : [],
      chat: chatConfig
        ? compactObject({
            searchSceneId: chatConfig.SearchSceneID,
            networkSearchMode: chatConfig.NetworkSearchMode,
            banWordCount: banWords.length,
            hasRoleInfo: hasNonEmptyString(chatConfig.RoleInfo),
            hasAnswerInfo: hasNonEmptyString(chatConfig.AnswerInfo),
            hasFollowUpInfo: hasNonEmptyString(chatConfig.FollowUpInfo),
            openingSuggestionEnabled: openingConfig?.EnableOpeningSuggestion,
            openingSuggestionLimit: openingConfig?.SuggestionLimit,
            openingRecommendEnabled: openingConfig?.EnableRecommend,
            openingRecommendSceneId: openingConfig?.RecommendSceneId
          })
        : undefined
    })
  };
}

function summarizeDatasetFields(schema: Array<Record<string, unknown>>, config?: Record<string, unknown>): Array<Record<string, unknown>> {
  const fieldDescriptions = isRecord(config?.FieldDescMap) ? config.FieldDescMap : undefined;
  const indexFields = new Set(asStringArray(config?.IndexFields));
  const filterFields = new Set(asStringArray(config?.FilterFields));
  const suggestFields = new Set(asStringArray(config?.SuggestFields));
  const imageIndexFields = new Set(asStringArray(config?.ImageIndexFields));

  return schema.map(field => {
    const name = String(field.Name ?? '');
    const roles = [];
    if (readBoolean(field, ['Metadata', 'IsPK'])) roles.push('primary_key');
    if (indexFields.has(name)) roles.push('index');
    if (filterFields.has(name)) roles.push('filter');
    if (suggestFields.has(name)) roles.push('suggest');
    if (imageIndexFields.has(name)) roles.push('image_index');

    const bizAttrCode = toInteger(field.BizAttr);
    const description = fieldDescriptions && typeof fieldDescriptions[name] === 'string' ? String(fieldDescriptions[name]) : undefined;

    return compactObject({
      name,
      type: formatDatasetFieldTypeOrUndefined(field.Type),
      typeCode: toInteger(field.Type),
      description,
      meaning: hasNonEmptyString(field.Meaning) ? String(field.Meaning) : undefined,
      primaryKey: readBoolean(field, ['Metadata', 'IsPK']) || undefined,
      required: typeof field.Required === 'boolean' ? field.Required : undefined,
      readOnly: readBoolean(field, ['Metadata', 'IsReadOnly']) || undefined,
      bizAttrCode: bizAttrCode && bizAttrCode > 0 ? bizAttrCode : undefined,
      roles
    });
  });
}

function summarizeDatasetListResponse(response: Record<string, unknown>, options: DatasetListOptions): Record<string, unknown> {
  const datasets = extractDatasetListEntries(response);
  const requestedType = options.type ? parseDatasetTypeValue(options.type) : undefined;
  const requestedName = options.name?.trim().toLowerCase();
  const requestedApplicationId = options.applicationId?.trim();
  const filtered = datasets.filter(entry => {
    if (requestedType !== undefined && toInteger(entry.Type) !== requestedType) {
      return false;
    }

    if (requestedName && !String(entry.Name ?? '').toLowerCase().includes(requestedName)) {
      return false;
    }

    if (requestedApplicationId) {
      const applications = asObjectArray(entry.Applications);
      if (!applications.some(application => String(application.AppID ?? '') === requestedApplicationId)) {
        return false;
      }
    }

    return true;
  });

  return {
    ResponseMetadata: response.ResponseMetadata,
    Result: compactObject({
      totalDatasets: datasets.length,
      returnedDatasets: filtered.length,
      filters: compactObject({
        type: requestedType !== undefined ? formatDatasetTypeLabel(requestedType) : undefined,
        name: options.name?.trim() || undefined,
        applicationId: requestedApplicationId
      }),
      datasets: filtered.map(summarizeDatasetEntry)
    })
  };
}

function extractDatasetListEntries(response: Record<string, unknown>): Array<Record<string, unknown>> {
  if (!isRecord(response.Result) || !Array.isArray(response.Result.Dataset)) {
    return [];
  }

  return response.Result.Dataset.filter(isRecord);
}

function summarizeDatasetEntry(entry: Record<string, unknown>): Record<string, unknown> {
  const datasetType = toInteger(entry.Type);
  const datasetState = toInteger(entry.State);
  const schema = asObjectArray(entry.Schema);
  const applications = asObjectArray(entry.Applications).map(application =>
    compactObject({
      appId: application.AppID,
      name: application.Name
    })
  );

  return compactObject({
    datasetId: entry.DatasetID,
    name: entry.Name,
    type: datasetType !== undefined ? formatDatasetTypeLabel(datasetType) : undefined,
    typeCode: datasetType,
    state: datasetState !== undefined ? formatDatasetStateLabel(datasetState) : undefined,
    stateCode: datasetState,
    dataNum: entry.DataNum,
    preProcessedDataNum: entry.PreProcessedDataNum,
    fieldCount: schema.length,
    fieldsConfigVersion: entry.FieldsConfigVersion,
    version: entry.Version,
    projectName: entry.ProjectName,
    description: entry.Description,
    applicationCount: applications.length,
    applications,
    updatedAt: entry.UpdatedAt,
    createdAt: entry.CreatedAt
  });
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asObjectArray(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(isRecord);
}

function toInteger(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isInteger(value)) {
    return value;
  }

  const parsed = parseIntegerLike(value);
  if (parsed !== undefined) {
    return parsed;
  }

  return undefined;
}

function requiredNamedIdPayload(id: string | undefined, kind: string, fieldName: string): Record<string, string> {
  if (!id) {
    throw new Error(`Missing --id for ${kind} command.`);
  }
  return { [fieldName]: id };
}

function requireNonEmptyObject(value: unknown, message: string): void {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length === 0) {
    throw new Error(message);
  }
}

function requireNonEmptyArrayField(value: unknown, fieldName: string, message: string): void {
  if (!isRecord(value) || !Array.isArray(value[fieldName]) || value[fieldName].length === 0) {
    throw new Error(message);
  }
}

function requireRecommendEntryBindingConfirmation(confirmed: boolean | undefined, commandName: string): void {
  if (confirmed) {
    return;
  }
  throw new Error(
    `Real ${commandName} requires an explicit entry-binding confirmation. Confirm the target page or module with the user first, then rerun with --confirm-entry-binding.`
  );
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function hasNonEmptyString(value: unknown): boolean {
  return typeof value === 'string' && value.trim().length > 0;
}

function objectSize(value: unknown): number {
  return isRecord(value) ? Object.keys(value).length : 0;
}

function readBoolean(value: unknown, path: string[]): boolean {
  let current: unknown = value;
  for (const key of path) {
    if (!isRecord(current)) {
      return false;
    }
    current = current[key];
  }

  return current === true;
}

function splitCommaList(value?: string): string[] | undefined {
  if (!value) return undefined;
  const values = value
    .split(',')
    .map(entry => entry.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}

function normalizeDatasetSchemaFields(value: unknown): unknown {
  if (!Array.isArray(value)) {
    return value;
  }

  return value.map(entry => {
    if (!isRecord(entry)) {
      return entry;
    }

    const normalized: Record<string, unknown> = { ...entry };
    const fieldName = optionalString(entry.Name) ?? optionalString(entry.FieldName);
    const fieldType = entry.Type ?? entry.FieldType;

    delete normalized.FieldName;
    delete normalized.FieldType;

    if (fieldName) {
      normalized.Name = fieldName;
    }

    if (fieldType !== undefined) {
      normalized.Type = parseDatasetFieldTypeValue(fieldType);
    }

    if (Array.isArray(entry.Fields)) {
      normalized.Fields = normalizeDatasetSchemaFields(entry.Fields);
    }

    return normalized;
  });
}

function normalizeDataFieldConfig(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const normalized: Record<string, unknown> = { ...value };
  const titleField = optionalString(value.TitleField);
  const indexFields = mergeStringLists(value.IndexFields, value.IndexField, titleField);
  const filterFields = mergeStringLists(value.FilterFields, value.FilterField);
  const suggestFields = mergeStringLists(value.SuggestFields, value.SuggestField);
  const imageIndexFields = mergeStringLists(value.ImageIndexFields, value.ImageFields, value.ImageField);

  delete normalized.TitleField;
  delete normalized.IndexField;
  delete normalized.FilterField;
  delete normalized.SuggestField;
  delete normalized.ImageFields;
  delete normalized.ImageField;

  if (indexFields) {
    normalized.IndexFields = indexFields;
  }
  if (filterFields) {
    normalized.FilterFields = filterFields;
  }
  if (suggestFields) {
    normalized.SuggestFields = suggestFields;
  }
  if (imageIndexFields) {
    normalized.ImageIndexFields = imageIndexFields;
  }

  return normalized;
}

function requiredString(value: unknown, flag: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new Error(`Missing required flag: ${flag}`);
  }
  return parsed;
}

function parseOptionalInt(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return parsed;
}

function parseDatasetTypeValue(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  const parsed = parseIntegerLike(value);
  if (parsed !== undefined && parsed > 0) {
    return parsed;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, '-');
    const alias = DATASET_TYPE_ALIASES[normalized];
    if (alias !== undefined) {
      return alias;
    }
  }

  throw new Error(
    `Invalid dataset Type value: ${String(value)}. Use item|query|video|user-event|behavior|doc|document or a positive integer enum.`
  );
}

function formatDatasetTypeLabel(value: number): string {
  return DATASET_TYPE_LABELS[value] ?? `unknown(${value})`;
}

function formatDatasetStateLabel(value: number): string {
  return DATASET_STATE_LABELS[value] ?? `unknown(${value})`;
}

function formatAppStateLabel(value: number): string {
  return APP_STATE_LABELS[value] ?? `Unknown(${value})`;
}

function formatAppDataConfigStateOrUndefined(value: unknown): string | undefined {
  const parsed = toInteger(value);
  return parsed !== undefined ? (APP_DATA_CONFIG_STATE_LABELS[parsed] ?? `Unknown(${parsed})`) : undefined;
}

function formatDatasetTypeOrUndefined(value: unknown): string | undefined {
  const parsed = toInteger(value);
  return parsed !== undefined ? formatDatasetTypeLabel(parsed) : undefined;
}

function formatDatasetStateOrUndefined(value: unknown): string | undefined {
  const parsed = toInteger(value);
  return parsed !== undefined ? formatDatasetStateLabel(parsed) : undefined;
}

function formatDatasetFieldTypeOrUndefined(value: unknown): string | undefined {
  const parsed = toInteger(value);
  return parsed !== undefined ? (DATASET_FIELD_TYPE_LABELS[parsed] ?? `unknown(${parsed})`) : undefined;
}

function parseDatasetFieldTypeValue(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  const parsed = parseIntegerLike(value);
  if (parsed !== undefined && parsed > 0) {
    return parsed;
  }

  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase().replace(/[\s_]+/g, '');
    const alias = DATASET_FIELD_TYPE_ALIASES[normalized];
    if (alias !== undefined) {
      return alias;
    }
    const literalAlias = DATASET_FIELD_TYPE_ALIASES[value.trim().toLowerCase()];
    if (literalAlias !== undefined) {
      return literalAlias;
    }
  }

  throw new Error(
    `Invalid dataset field Type value: ${String(value)}. Use string|int32|int64|float|bool|array<string>|array<int64>|object|array<object> or an enum integer.`
  );
}

function parseIntegerLike(value: unknown): number | undefined {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseAppStateValue(value: string): number {
  const normalized = value.trim();
  const parsed = Number.parseInt(normalized, 10);
  if (Number.isInteger(parsed) && parsed > 0) {
    return parsed;
  }

  const lowered = normalized.toLowerCase();
  switch (lowered) {
    case 'ready':
    case 'appready':
      return 1;
    case 'creating':
    case 'appcreating':
      return 2;
    case 'deleting':
    case 'appdeleting':
      return 3;
    case 'not-ready':
    case 'not_ready':
    case 'appnotready':
    case 'notready':
      return 4;
    default:
      throw new Error('Unsupported app state. Use ready|creating|deleting|not-ready or a positive integer enum.');
  }
}

function formatApplicationIndustryLabel(value: number): string {
  switch (value) {
    case 0:
      return 'none';
    case 1:
      return 'ecommerce';
    case 2:
      return 'material';
    case 3:
      return 'video';
    case 4:
      return 'news';
    case 5:
      return 'social-platform';
    case 20:
      return 'other';
    default:
      return `unknown(${value})`;
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(entry => (typeof entry === 'string' ? entry : String(entry ?? '')))
    .filter(entry => entry.length > 0);
}

function mergeStringLists(...sources: unknown[]): string[] | undefined {
  const values: string[] = [];
  for (const source of sources) {
    if (typeof source === 'string') {
      const trimmed = source.trim();
      if (trimmed) {
        values.push(trimmed);
      }
      continue;
    }
    if (Array.isArray(source)) {
      for (const entry of source) {
        if (typeof entry === 'string' && entry.trim()) {
          values.push(entry.trim());
        }
      }
    }
  }

  if (values.length === 0) {
    return undefined;
  }

  return Array.from(new Set(values));
}

function parseApplicationIndustry(value: string, source: string): number {
  const normalized = value.trim().toLowerCase().replace(/[_\s]+/g, '-');
  const alias = APPLICATION_INDUSTRY_ALIASES[normalized];
  if (alias !== undefined) {
    return alias;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isInteger(parsed) && VALID_APPLICATION_INDUSTRIES.has(parsed)) {
    return parsed;
  }

  throw new Error(
    `Invalid ${source} value: ${value}. Use none|ecommerce|material|video|news|social-platform|other or 0/1/2/3/4/5/20.`
  );
}

function parseApplicationIndustryValue(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '' || value === 0 || value === '0') {
    return undefined;
  }

  if (typeof value === 'number') {
    if (Number.isInteger(value) && VALID_APPLICATION_INDUSTRIES.has(value)) {
      return value;
    }
    throw new Error(`Invalid Industry value in payload: ${value}`);
  }

  if (typeof value === 'string') {
    return parseApplicationIndustry(value, 'Industry');
  }

  throw new Error(`Invalid Industry value type in payload: ${typeof value}`);
}

function ensurePositiveInt(value: number, flag: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Invalid ${flag} value: ${value}. Use a positive integer.`);
  }
  return value;
}

function hasDatasetIdInPayload(payload: unknown): boolean {
  return isRecord(payload) && typeof payload.dataset_id === 'string' && payload.dataset_id.length > 0;
}

function withDatasetIdIfMissing(payload: unknown, datasetId?: string): unknown {
  if (!datasetId || !isRecord(payload) || hasDatasetIdInPayload(payload)) {
    return payload;
  }
  return {
    ...payload,
    dataset_id: datasetId
  };
}

function ensureChatSearchSessionId(payload: unknown, sessionId: string): unknown {
  if (!isRecord(payload) || (typeof payload.session_id === 'string' && payload.session_id.length > 0)) {
    return payload;
  }
  return {
    ...payload,
    session_id: sessionId
  };
}

function isUnsupportedApplicationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /unsupported application/i.test(message);
}

function buildSearchRunError(
  error: unknown,
  snapshot: AppStatusSnapshot | undefined,
  applicationId: string,
  datasetId?: string
): Error {
  const message = error instanceof Error ? error.message : String(error);
  if (!snapshot || !isUnsupportedApplicationError(error)) {
    return error instanceof Error ? error : new Error(message);
  }

  const hints = [
    `Application readiness: state=${snapshot.appState}, phase=${snapshot.phase}, runtimeSearchReady=${String(snapshot.runtimeSearchReady)}`,
    datasetId ? `Dataset used for this request: ${datasetId}` : undefined,
    snapshot.inferredSearchDataset?.datasetId
      ? `Auto-inferred dataset: ${snapshot.inferredSearchDataset.datasetId} (${snapshot.inferredSearchDataset.source})`
      : undefined,
    ...snapshot.reasons.map(reason => `Reason: ${reason}`),
    ...snapshot.nextActions.map(action => `Next: ${action}`),
    `Inspect status: viking app status --application-id ${applicationId}`
  ].filter((line): line is string => Boolean(line));

  return new Error(`${message}\n\n${hints.join('\n')}`);
}

function buildSearchDatasetInferenceError(applicationId: string, snapshot: AppStatusSnapshot): string {
  const activated = [...snapshot.itemDatasetIds, ...snapshot.documentDatasetIds];
  const bound = snapshot.datasets.map(dataset => dataset.datasetId).filter((value): value is string => Boolean(value));
  const configured = snapshot.dataConfigs.map(config => config.datasetId).filter((value): value is string => Boolean(value));
  const candidates = [...new Set([...activated, ...bound, ...configured])];
  const candidateText = candidates.length > 0 ? candidates.join(', ') : '(none)';
  return [
    `Could not infer a unique dataset for application ${applicationId}.`,
    `Pass --dataset-id <dataset>.`,
    `Observed candidate datasets: ${candidateText}`,
    `Inspect current state: viking app status --application-id ${applicationId}`
  ].join('\n');
}

function buildWaitReadyTimeoutMessage(
  snapshot: AppStatusSnapshot | undefined,
  applicationId: string,
  waitedMs: number,
  attempts: number
): string {
  const lines = [
    `Timed out waiting for application ${applicationId} to become runtime-ready after ${waitedMs}ms (${attempts} checks).`
  ];

  if (snapshot) {
    lines.push(`Last observed state: ${snapshot.appState}, phase=${snapshot.phase}, runtimeSearchReady=${String(snapshot.runtimeSearchReady)}`);
    for (const reason of snapshot.reasons) {
      lines.push(`Reason: ${reason}`);
    }
    for (const action of snapshot.nextActions) {
      lines.push(`Next: ${action}`);
    }
  }

  return lines.join('\n');
}
