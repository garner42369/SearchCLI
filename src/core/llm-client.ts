// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { jsonrepair } from 'jsonrepair';
import { resolveCliDefaults } from './user-config';

export interface LlmClientConfig {
  baseUrl: string;
  model: string;
  apiKey?: string;
  accessKeyId?: string;
  secretKey?: string;
  region: string;
  service: string;
  timeoutMs: number;
}

export interface ChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

export function resolveLlmClientConfig(input: Partial<LlmClientConfig> = {}): LlmClientConfig | null {
  const defaults = resolveCliDefaults({
    llmBaseUrl: input.baseUrl,
    llmApiKey: input.apiKey,
    llmAccessKeyId: input.accessKeyId,
    llmSecretKey: input.secretKey,
    llmRegion: input.region,
    llmService: input.service,
    llmModel: input.model,
    timeoutMs: input.timeoutMs
  });

  if (!defaults.llmBaseUrl || !defaults.llmModel) {
    return null;
  }
  if (!defaults.llmApiKey && !(defaults.llmAccessKeyId && defaults.llmSecretKey)) {
    return null;
  }

  return {
    baseUrl: defaults.llmBaseUrl,
    model: defaults.llmModel,
    apiKey: defaults.llmApiKey,
    accessKeyId: defaults.llmAccessKeyId,
    secretKey: defaults.llmSecretKey,
    region: defaults.llmRegion ?? 'cn-beijing',
    service: defaults.llmService ?? 'ark',
    timeoutMs: defaults.timeoutMs
  };
}

export async function requestChatCompletion(
  config: LlmClientConfig,
  systemPrompt: string,
  inputPayload: Record<string, unknown>
): Promise<string> {
  const url = buildLlmChatCompletionUrl(config.baseUrl);
  const body = JSON.stringify({
    model: config.model,
    temperature: 0,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify(inputPayload, null, 2) }
    ]
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: await buildLlmHeaders(config, url, body),
    body,
    signal: AbortSignal.timeout(config.timeoutMs)
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`LLM request failed: ${response.status} ${response.statusText}\n${rawText}`);
  }

  const parsed = parseJsonResponse(rawText) as ChatCompletionResponse;
  const content = extractChatContent(parsed);
  if (!content) {
    throw new Error('LLM response did not include any message content.');
  }
  return content;
}

export function parseJsonResponse(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const jsonSlice = extractJsonSlice(trimmed);
    const repaired = jsonrepair(jsonSlice);
    return JSON.parse(repaired) as unknown;
  }
}

function buildLlmChatCompletionUrl(baseUrl: string): URL {
  const normalized = baseUrl.replace(/\/+$/u, '');
  if (/\/chat\/completions$/u.test(normalized)) {
    return new URL(normalized);
  }
  return new URL(`${normalized}/chat/completions`);
}

async function buildLlmHeaders(config: LlmClientConfig, url: URL, body: string): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/json'
  };

  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
    return headers;
  }

  if (!config.accessKeyId || !config.secretKey) {
    throw new Error('Missing LLM credentials.');
  }

  const { Signer } = await import('@volcengine/openapi');
  headers.host = url.host;
  const signer = new Signer(
    {
      region: config.region,
      method: 'POST',
      pathname: url.pathname,
      params: Object.fromEntries(url.searchParams.entries()),
      headers,
      body
    },
    config.service
  );

  signer.addAuthorization({
    accessKeyId: config.accessKeyId,
    secretKey: config.secretKey,
    sessionToken: ''
  });

  return headers;
}

function extractJsonSlice(text: string): string {
  const firstBrace = text.indexOf('{');
  const firstBracket = text.indexOf('[');
  let start = -1;
  if (firstBrace === -1) {
    start = firstBracket;
  } else if (firstBracket === -1) {
    start = firstBrace;
  } else {
    start = Math.min(firstBrace, firstBracket);
  }
  if (start === -1) {
    return text;
  }

  const lastBrace = text.lastIndexOf('}');
  const lastBracket = text.lastIndexOf(']');
  const end = Math.max(lastBrace, lastBracket);
  if (end === -1 || end < start) {
    return text.slice(start);
  }
  return text.slice(start, end + 1);
}

function extractChatContent(response: ChatCompletionResponse): string | undefined {
  const content = response.choices?.[0]?.message?.content;
  if (typeof content === 'string') {
    return content;
  }
  if (Array.isArray(content)) {
    return content
      .map(entry => (typeof entry?.text === 'string' ? entry.text : ''))
      .join('')
      .trim();
  }
  return undefined;
}
