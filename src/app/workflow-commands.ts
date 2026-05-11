// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { setTimeout as sleep } from 'node:timers/promises';
import { fetchAppStatusSnapshot, type AppStatusSnapshot } from '../core/app-status';
import { getConsoleTopAction } from '../core/console-action-catalog';
import { loadJsonInput } from '../core/json-input';
import { formatOutput, hasExplicitOutputFormatFlag, printOutput } from '../core/output-format';
import { VikingOpenApiClient } from '../core/openapi-client';
import { resolveServiceConfig, type ServiceConfigInput } from '../core/service-config';
import {
  runDataImportShortcutCommand,
  type DataImportShortcutOptions,
} from './shortcut-commands';

export interface WorkflowServiceOptions extends ServiceConfigInput {
  data?: string;
  projectName?: string;
}

export interface AppActivateWorkflowOptions extends WorkflowServiceOptions {
  applicationId: string;
  datasetId: string;
  fieldConfig?: string;
  schemaVersion?: number;
  fieldConfigVersion?: number;
  onlineConfig?: string;
  waitReady?: boolean;
  waitTimeoutMs?: number;
  pollIntervalMs?: number;
  activatedOnly?: boolean;
}

export interface AppDiagnoseWorkflowOptions extends WorkflowServiceOptions {
  applicationId: string;
  activatedOnly?: boolean;
}

export interface DatasetIngestWorkflowOptions extends DataImportShortcutOptions {}

interface WorkflowStepResult {
  step: string;
  ok: boolean;
  skipped?: boolean;
  detail?: string;
  response?: unknown;
}

export async function runAppActivateWorkflowCommand(options: AppActivateWorkflowOptions): Promise<void> {
  const config = resolveServiceConfig(toServiceConfigInput(options));
  const client = new VikingOpenApiClient(config);
  const steps: WorkflowStepResult[] = [];

  const bindPayload = compactObject({
    AppID: options.applicationId,
    DatasetIDs: [options.datasetId],
    ProjectName: options.projectName
  });
  const bindResponse = await client.post('/api/v1/BindAppDataset', bindPayload);
  steps.push({
    step: 'bind_dataset',
    ok: true,
    response: bindResponse
  });

  const hasDatasetConfigUpdate =
    options.fieldConfig !== undefined || options.schemaVersion !== undefined || options.fieldConfigVersion !== undefined;
  if (hasDatasetConfigUpdate) {
    const datasetConfigPayload = compactObject({
      AppID: options.applicationId,
      DatasetID: options.datasetId,
      SchemaVersion: options.schemaVersion,
      DataConfig: await loadJsonInput(options.fieldConfig),
      FieldsConfigVersion: options.fieldConfigVersion,
      ProjectName: options.projectName
    });
    const datasetConfigResponse = await client.post('/api/v1/UpdateAppDataConfig', datasetConfigPayload);
    steps.push({
      step: 'update_dataset_config',
      ok: true,
      response: datasetConfigResponse
    });
  } else {
    steps.push({
      step: 'update_dataset_config',
      ok: true,
      skipped: true,
      detail: 'No dataset-config fields were provided.'
    });
  }

  if (options.onlineConfig) {
    const onlineConfigAction = getConsoleTopAction('UpsertAppOnlineConfig');
    if (!onlineConfigAction) {
      throw new Error('Missing console-top mapping for UpsertAppOnlineConfig.');
    }
    const onlineConfigPayload = compactObject({
      AppID: options.applicationId,
      Config: await loadJsonInput(options.onlineConfig),
      ProjectName: options.projectName
    });
    const onlineConfigResponse = await client.post(onlineConfigAction.path, onlineConfigPayload);
    steps.push({
      step: 'update_online_config',
      ok: true,
      response: onlineConfigResponse
    });
  } else {
    steps.push({
      step: 'update_online_config',
      ok: true,
      skipped: true,
      detail: 'No online-config payload was provided.'
    });
  }

  const snapshot = options.waitReady
    ? await waitForAppReady(config, {
        applicationId: options.applicationId,
        projectName: options.projectName,
        activatedOnly: options.activatedOnly,
        waitTimeoutMs: options.waitTimeoutMs,
        pollIntervalMs: options.pollIntervalMs
      })
    : await fetchAppStatusSnapshot(config, {
        applicationId: options.applicationId,
        projectName: options.projectName,
        activatedOnly: options.activatedOnly
      });

  const summary = {
    ok: true,
    applicationId: options.applicationId,
    datasetId: options.datasetId,
    waitedForReady: Boolean(options.waitReady),
    appState: snapshot.appState,
    phase: snapshot.phase,
    runtimeSearchReady: snapshot.runtimeSearchReady,
    inferredSearchDataset: snapshot.inferredSearchDataset ?? null,
    executedSteps: steps.filter(step => !step.skipped).map(step => step.step),
    skippedSteps: steps.filter(step => step.skipped).map(step => step.step),
    reasons: snapshot.reasons,
    nextActions: snapshot.nextActions
  };

  await printWorkflowResult(
    'app activate',
    [
      ['application', options.applicationId],
      ['dataset', options.datasetId],
      ['wait_ready', options.waitReady ? 'true' : 'false'],
      ['phase', snapshot.phase],
      ['runtime_ready', String(snapshot.runtimeSearchReady)]
    ],
    {
      ...summary,
      steps,
      status: snapshot
    },
    summary
  );
}

export async function runAppDiagnoseWorkflowCommand(options: AppDiagnoseWorkflowOptions): Promise<void> {
  const snapshot = await fetchAppStatusSnapshot(resolveServiceConfig(toServiceConfigInput(options)), {
    applicationId: options.applicationId,
    projectName: options.projectName,
    activatedOnly: options.activatedOnly
  });

  const summary = {
    ok: true,
    applicationId: options.applicationId,
    appState: snapshot.appState,
    phase: snapshot.phase,
    runtimeSearchReady: snapshot.runtimeSearchReady,
    inferredSearchDataset: snapshot.inferredSearchDataset ?? null,
    reasons: snapshot.reasons,
    nextActions: snapshot.nextActions,
    configStateCounts: snapshot.configStateCounts
  };

  await printWorkflowResult(
    'app diagnose',
    [
      ['application', options.applicationId],
      ['state', snapshot.appState],
      ['phase', snapshot.phase],
      ['runtime_ready', String(snapshot.runtimeSearchReady)],
      ['dataset', snapshot.inferredSearchDataset?.datasetId]
    ],
    {
      ...summary,
      status: snapshot
    },
    summary
  );
}

export async function runDatasetIngestWorkflowCommand(options: DatasetIngestWorkflowOptions): Promise<void> {
  await runDataImportShortcutCommand(options);
}

async function waitForAppReady(
  config: ReturnType<typeof resolveServiceConfig>,
  options: {
    applicationId: string;
    projectName?: string;
    activatedOnly?: boolean;
    waitTimeoutMs?: number;
    pollIntervalMs?: number;
  }
): Promise<AppStatusSnapshot> {
  const waitTimeoutMs = ensurePositiveInt(options.waitTimeoutMs ?? 120000, '--wait-timeout-ms');
  const pollIntervalMs = ensurePositiveInt(options.pollIntervalMs ?? 3000, '--poll-interval-ms');
  const startedAt = Date.now();
  const deadline = startedAt + waitTimeoutMs;
  let lastSnapshot: AppStatusSnapshot | undefined;

  while (Date.now() <= deadline) {
    lastSnapshot = await fetchAppStatusSnapshot(config, {
      applicationId: options.applicationId,
      projectName: options.projectName,
      activatedOnly: options.activatedOnly
    });

    if (lastSnapshot.runtimeSearchReady) {
      return lastSnapshot;
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }
    await sleep(Math.min(pollIntervalMs, remainingMs));
  }

  const reason = lastSnapshot
    ? `Timed out waiting for app readiness. Last state=${lastSnapshot.appState}, phase=${lastSnapshot.phase}, runtimeSearchReady=${String(lastSnapshot.runtimeSearchReady)}`
    : 'Timed out waiting for app readiness.';
  throw new Error(`${reason}\nInspect status: viking app status --application-id ${options.applicationId}`);
}

async function printWorkflowResult(
  title: string,
  rows: Array<[string, string | undefined]>,
  fullValue: unknown,
  prettyValue: unknown
): Promise<void> {
  if (hasExplicitOutputFormatFlag()) {
    await printOutput(fullValue);
    return;
  }

  console.log(`WORKFLOW ${title}`);
  for (const [label, value] of rows) {
    if (value) {
      console.log(`  ${label}: ${value}`);
    }
  }
  console.log('');
  process.stdout.write(`${formatOutput(prettyValue, 'pretty')}\n`);
}

function toServiceConfigInput(options: WorkflowServiceOptions): ServiceConfigInput {
  return {
    baseUrl: options.baseUrl,
    accessKeyId: options.accessKeyId,
    secretKey: options.secretKey,
    region: options.region,
    timeoutMs: options.timeoutMs
  };
}

function compactObject<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}

function ensurePositiveInt(value: number, flagName: string): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flagName} must be a positive integer.`);
  }
  return Math.trunc(value);
}
