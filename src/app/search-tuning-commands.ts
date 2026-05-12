// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import { printOutput } from '../core/output-format';
import { resolveRuntimeConfig } from '../core/config';
import { resolveLlmClientConfig, requestChatCompletion } from '../core/llm-client';
import { resolveServiceConfig, type ServiceConfigInput } from '../core/service-config';
import { writeText } from '../core/files';
import { VikingOpenApiClient } from '../core/openapi-client';
import { buildSceneApplyDraft, withSceneId } from '../core/search-tuning/apply';
import { buildSearchTuningPlan } from '../core/search-tuning/plan';
import { inspectTuningContext } from '../core/search-tuning/inspect';
import { loadTuningReport, loadTuningRunState, runSearchTuning, type TuningProgressEvent } from '../core/search-tuning/runner';
import { generateTuningQueries } from '../core/search-tuning/query-generator';
import { stableStringify } from '../core/search-tuning/hash';

export interface SearchTuneServiceOptions extends ServiceConfigInput {
  data?: string;
}

export interface SearchTuneRunOptions extends SearchTuneServiceOptions {
  applicationId: string;
  datasetId?: string;
  sceneId?: string;
  queries?: string;
  queryCount?: number;
  topK?: number;
  maxStrategies?: number;
  outputDir?: string;
  profile?: string;
  resumeRunId?: string;
}

export interface SearchTunePlanOptions extends SearchTuneServiceOptions {
  applicationId: string;
  datasetId?: string;
  sceneId?: string;
  queries?: string;
  queryCount?: number;
  topK?: number;
  maxStrategies?: number;
  profile?: string;
}

export interface SearchTuneQueryGenerateOptions extends SearchTuneServiceOptions {
  applicationId: string;
  datasetId?: string;
  sceneId?: string;
  queryCount?: number;
  outputDir?: string;
}

export interface SearchTuneReportOptions extends SearchTuneServiceOptions {
  runId: string;
  outputDir?: string;
}

export interface SearchTuneApplyOptions extends SearchTuneServiceOptions {
  applicationId: string;
  runId: string;
  outputDir?: string;
  sceneName?: string;
  sceneDescription?: string;
  dryRun?: boolean;
  confirmCreateScene?: boolean;
}

export interface SearchTuneLlmCheckOptions extends SearchTuneServiceOptions {
  live?: boolean;
}

export async function runSearchTuneLlmCheckCommand(options: SearchTuneLlmCheckOptions): Promise<void> {
  const llmConfig = resolveLlmClientConfig({
    timeoutMs: options.timeoutMs
  });
  if (!llmConfig) {
    await printOutput({
      ok: false,
      detail: 'LLM is not configured. Set VIKING_LLM_BASE_URL, VIKING_LLM_API_KEY, and VIKING_LLM_MODEL, or configure Ark AK/SK.'
    });
    return;
  }

  const result: Record<string, unknown> = {
    ok: true,
    baseUrl: llmConfig.baseUrl,
    model: llmConfig.model,
    auth: llmConfig.apiKey ? 'api-key' : 'ak-sk'
  };

  if (options.live) {
    const raw = await requestChatCompletion(llmConfig, 'Return only JSON: {"ok":true}.', {
      ping: true
    });
    result.live = raw;
  }

  await printOutput(result);
}

export async function runSearchTuneRunCommand(options: SearchTuneRunOptions): Promise<void> {
  if (options.profile && options.profile !== 'similarity-only') {
    throw new Error('Only --profile similarity-only is supported in the first version.');
  }

  const llmConfig = resolveLlmClientConfig({
    timeoutMs: options.timeoutMs
  });
  if (!llmConfig) {
    throw new Error(
      'LLM is not configured. Run `vs search tune llm-check` for details, then set VIKING_LLM_BASE_URL, VIKING_LLM_API_KEY, and VIKING_LLM_MODEL.'
    );
  }

  const serviceConfig = resolveServiceConfig(toServiceConfigInput(options));
  const resumeState = options.resumeRunId ? await loadTuningRunState(options.outputDir, options.resumeRunId) : undefined;
  if (resumeState && resumeState.applicationId !== options.applicationId) {
    throw new Error(
      `Cannot resume ${options.resumeRunId} for application ${options.applicationId}; run-state.json belongs to application ${resumeState.applicationId}.`
    );
  }
  const context = resumeState
    ? await loadResumeContext(resumeState)
    : await inspectTuningContext({
        config: serviceConfig,
        applicationId: options.applicationId,
        datasetId: options.datasetId,
        sceneId: options.sceneId,
        sampleSize: 20
      });
  const effectiveTopK = resumeState?.topK ?? options.topK ?? 20;
  const effectiveQueryCount = resumeState?.queryCount ?? options.queryCount ?? 100;
  const effectiveMaxStrategies = resumeState?.strategyCount ?? options.maxStrategies ?? 30;
  const runtimeConfig = resolveRuntimeConfig({
    ...toRuntimeConfigInput(options),
    applicationId: options.applicationId,
    datasetId: context.datasetId,
    sceneId: context.sceneId ?? options.sceneId,
    defaultPageSize: effectiveTopK
  });
  const report = await runSearchTuning({
    runtimeConfig,
    context,
    llmConfig,
    queriesFile: options.queries,
    queryCount: effectiveQueryCount,
    topK: effectiveTopK,
    maxStrategies: effectiveMaxStrategies,
    outputDir: options.outputDir,
    resumeRunId: options.resumeRunId,
    onProgress: writeProgressEvent
  });

  await printOutput({
    ok: true,
    runId: report.runId,
    report: report.artifacts.reportMarkdown,
    reportJson: report.artifacts.reportJson,
    recommendation: report.artifacts.recommendation,
    recommendedSearchDynamic: report.artifacts.recommendedSearchDynamic,
    recommendedRequestParams: report.artifacts.recommendedRequestParams,
    runState: report.artifacts.runState,
    partialMetrics: report.artifacts.partialMetrics,
    rankings: report.artifacts.rankings,
    labelsUsed: report.artifacts.labelsUsed,
    recommendedStrategyId: report.recommendedStrategyId
  });
}

async function loadResumeContext(state: Awaited<ReturnType<typeof loadTuningRunState>>) {
  const contextPath = state.artifacts.context;
  const raw = await import('node:fs/promises').then(fs => fs.readFile(contextPath, 'utf8'));
  return JSON.parse(raw) as Awaited<ReturnType<typeof inspectTuningContext>>;
}

export async function runSearchTunePlanCommand(options: SearchTunePlanOptions): Promise<void> {
  if (options.profile && options.profile !== 'similarity-only') {
    throw new Error('Only --profile similarity-only is supported in the first version.');
  }

  const plan = await buildSearchTuningPlan({
    applicationId: options.applicationId,
    datasetId: options.datasetId,
    sceneId: options.sceneId,
    queriesFile: options.queries,
    queryCount: options.queryCount ?? 100,
    topK: options.topK ?? 20,
    maxStrategies: options.maxStrategies ?? 30
  });
  await printOutput(plan);
}

export async function runSearchTuneQueryGenerateCommand(options: SearchTuneQueryGenerateOptions): Promise<void> {
  const llmConfig = resolveLlmClientConfig({
    timeoutMs: options.timeoutMs
  });
  if (!llmConfig) {
    throw new Error(
      'LLM is not configured. Run `vs search tune llm-check` for details, then set VIKING_LLM_BASE_URL, VIKING_LLM_API_KEY, and VIKING_LLM_MODEL.'
    );
  }

  const serviceConfig = resolveServiceConfig(toServiceConfigInput(options));
  const context = await inspectTuningContext({
    config: serviceConfig,
    applicationId: options.applicationId,
    datasetId: options.datasetId,
    sceneId: options.sceneId,
    sampleSize: 20
  });
  const queryCount = options.queryCount ?? 100;
  const queries = await generateTuningQueries({
    llmConfig,
    sampleItems: context.sampleItems,
    count: queryCount
  });
  const generatedAt = new Date().toISOString();
  const fileId = generatedAt.replaceAll(':', '-').replace(/\.\d+Z$/, 'Z');
  const rootDir = path.resolve(options.outputDir ?? '.viking/search-tuning');
  const queryFile = path.join(rootDir, 'query-sets', `queries_${fileId}.jsonl`);
  await writeText(queryFile, `${queries.map(query => stableStringify(query)).join('\n')}\n`);

  await printOutput({
    ok: true,
    generatedAt,
    applicationId: options.applicationId,
    datasetId: context.datasetId,
    sceneId: context.sceneId,
    querySource: 'generated',
    queryCount: queries.length,
    queryFile,
    typeCounts: countBy(queries.map(query => query.type ?? 'unknown')),
    sampleQueries: queries.slice(0, Math.min(20, queries.length))
  });
}

export async function runSearchTuneReportCommand(options: SearchTuneReportOptions): Promise<void> {
  const report = await loadTuningReport(options.outputDir, options.runId);
  await printOutput(report);
}

export async function runSearchTuneApplyCommand(options: SearchTuneApplyOptions): Promise<void> {
  const report = await loadTuningReport(options.outputDir, options.runId);
  const draft = buildSceneApplyDraft(report, {
    applicationId: options.applicationId,
    projectName: options.projectName,
    sceneName: options.sceneName,
    sceneDescription: options.sceneDescription
  });

  if (options.dryRun) {
    await printOutput({
      ok: true,
      dryRun: true,
      ...draft,
      notes: buildApplyNotes(draft.unappliedRequestParams)
    });
    return;
  }

  if (!options.confirmCreateScene) {
    throw new Error('Refusing to create a search scene without --confirm-create-scene. Use --dry-run to inspect the payload first.');
  }

  const serviceConfig = resolveServiceConfig(toServiceConfigInput(options));
  const openapi = new VikingOpenApiClient(serviceConfig);
  const createResponse = await openapi.post('/api/v1/CreateSearchScene', draft.createPayload);
  const sceneId = extractSceneId(createResponse);
  if (!sceneId) {
    throw new Error('CreateSearchScene did not return SceneID.');
  }
  const onlinePayload = withSceneId(draft.onlinePayload, sceneId);
  const onlineResponse = await openapi.post('/api/v1/OnlineSearchScene', onlinePayload);
  const readbackResponse = await openapi.post('/api/v1/GetSearchScene', {
    AppID: options.applicationId,
    ProjectName: options.projectName,
    SceneID: sceneId
  });

  await printOutput({
    ok: true,
    dryRun: false,
    sceneId,
    ...draft,
    onlinePayload,
    createResponse,
    onlineResponse,
    readbackResponse,
    notes: buildApplyNotes(draft.unappliedRequestParams)
  });
}

function countBy(values: string[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) {
    counts[value] = (counts[value] ?? 0) + 1;
  }
  return counts;
}

function writeProgressEvent(event: TuningProgressEvent): void {
  const progress =
    event.total && event.total > 0 && event.completed !== undefined ? ` [${event.completed}/${event.total}]` : '';
  process.stderr.write(`[search-tune:${event.phase}]${progress} ${event.message}\n`);
}

function extractSceneId(response: unknown): string | undefined {
  const candidates = [
    response,
    isRecord(response) ? response.Result : undefined,
    isRecord(response) ? response.result : undefined
  ];
  for (const candidate of candidates) {
    if (!isRecord(candidate)) continue;
    for (const key of ['SceneID', 'SceneId', 'scene_id', 'sceneId']) {
      const value = candidate[key];
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return undefined;
}

function buildApplyNotes(unappliedRequestParams: { query_keyword_match_percent?: number; disable_personalize?: boolean }): string[] {
  const notes: string[] = [];
  if (Object.keys(unappliedRequestParams).length > 0) {
    notes.push('Request-only params are not persisted in scene config; keep them in caller request payloads when needed.');
  }
  if (unappliedRequestParams.query_keyword_match_percent !== undefined) {
    notes.push('query_keyword_match_percent is a request-level parameter and is reported as unappliedRequestParams.');
  }
  return notes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toServiceConfigInput(options: SearchTuneServiceOptions): ServiceConfigInput {
  return {
    baseUrl: options.baseUrl,
    accessKeyId: options.accessKeyId,
    secretKey: options.secretKey,
    projectName: options.projectName,
    region: options.region,
    timeoutMs: options.timeoutMs
  };
}

function toRuntimeConfigInput(options: SearchTuneRunOptions) {
  return {
    baseUrl: options.baseUrl,
    accessKeyId: options.accessKeyId,
    secretKey: options.secretKey,
    region: options.region,
    timeoutMs: options.timeoutMs,
    outputDir: options.outputDir
  };
}
