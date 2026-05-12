// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import path from 'node:path';
import { printOutput } from '../core/output-format';
import { resolveRuntimeConfig } from '../core/config';
import { resolveLlmClientConfig, requestChatCompletion } from '../core/llm-client';
import { resolveServiceConfig, type ServiceConfigInput } from '../core/service-config';
import { writeText } from '../core/files';
import { buildSearchTuningPlan } from '../core/search-tuning/plan';
import { inspectTuningContext } from '../core/search-tuning/inspect';
import { loadTuningReport, runSearchTuning, type TuningProgressEvent } from '../core/search-tuning/runner';
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
  const context = await inspectTuningContext({
    config: serviceConfig,
    applicationId: options.applicationId,
    datasetId: options.datasetId,
    sceneId: options.sceneId,
    sampleSize: 20
  });
  const runtimeConfig = resolveRuntimeConfig({
    ...toRuntimeConfigInput(options),
    applicationId: options.applicationId,
    datasetId: context.datasetId,
    sceneId: options.sceneId,
    defaultPageSize: options.topK ?? 20
  });
  const report = await runSearchTuning({
    runtimeConfig,
    context,
    llmConfig,
    queriesFile: options.queries,
    queryCount: options.queryCount ?? 100,
    topK: options.topK ?? 20,
    maxStrategies: options.maxStrategies ?? 30,
    outputDir: options.outputDir,
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
    recommendedStrategyId: report.recommendedStrategyId
  });
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
