// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { resolveCliDefaults } from './user-config';

export interface ServiceConfig {
  baseUrl: string;
  accessKeyId?: string;
  secretKey?: string;
  authSource?: 'flag' | 'env' | 'secure-store' | 'legacy-config' | 'none';
  region: string;
  timeoutMs: number;
}

export interface ServiceConfigInput {
  baseUrl?: string;
  accessKeyId?: string;
  secretKey?: string;
  region?: string;
  timeoutMs?: number;
}

const serviceConfigSchema = z.object({
  baseUrl: z.string().url(),
  accessKeyId: z.string().optional(),
  secretKey: z.string().optional(),
  region: z.string().min(1),
  timeoutMs: z.number().int().positive()
});

export function resolveServiceConfig(input: ServiceConfigInput): ServiceConfig {
  const defaults = resolveCliDefaults({
    baseUrl: input.baseUrl,
    accessKeyId: input.accessKeyId,
    secretKey: input.secretKey,
    region: input.region,
    timeoutMs: input.timeoutMs
  });

  const resolved = serviceConfigSchema.parse({
    baseUrl: defaults.baseUrl,
    accessKeyId: defaults.accessKeyId,
    secretKey: defaults.secretKey,
    region: defaults.region,
    timeoutMs: defaults.timeoutMs
  });

  if (!resolved.accessKeyId || !resolved.secretKey) {
    throw new Error(
      'Missing Viking auth. Run `viking auth import-env`, `viking auth login`, set VIKING_AK/VIKING_SK, or pass --ak/--sk.'
    );
  }

  return {
    ...resolved,
    authSource: defaults.authSource
  };
}
