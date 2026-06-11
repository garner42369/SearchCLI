// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { z } from 'zod';
import { formatMissingVikingAuthMessage } from './auth-errors';
import { resolveCliDefaults } from './user-config';

export interface ServiceConfig {
  controlPlaneBaseUrl: string;
  dataPlaneBaseUrl: string;
  service: string;
  accessKeyId?: string;
  secretKey?: string;
  authSource?: 'flag' | 'env' | 'secure-store' | 'none';
  projectName: string;
  region: string;
  timeoutMs: number;
}

export interface ServiceConfigInput {
  baseUrl?: string;
  controlPlaneBaseUrl?: string;
  dataPlaneBaseUrl?: string;
  service?: string;
  accessKeyId?: string;
  secretKey?: string;
  projectName?: string;
  region?: string;
  timeoutMs?: number;
}

const serviceConfigSchema = z.object({
  controlPlaneBaseUrl: z.string().url(),
  dataPlaneBaseUrl: z.string().url(),
  service: z.string().min(1),
  accessKeyId: z.string().optional(),
  secretKey: z.string().optional(),
  projectName: z.string().min(1),
  region: z.string().min(1),
  timeoutMs: z.number().int().positive()
});

export function resolveServiceConfig(input: ServiceConfigInput): ServiceConfig {
  const defaults = resolveCliDefaults({
    baseUrl: input.baseUrl,
    controlPlaneBaseUrl: input.controlPlaneBaseUrl,
    dataPlaneBaseUrl: input.dataPlaneBaseUrl,
    service: input.service,
    accessKeyId: input.accessKeyId,
    secretKey: input.secretKey,
    projectName: input.projectName,
    region: input.region,
    timeoutMs: input.timeoutMs
  });

  const resolved = serviceConfigSchema.parse({
    controlPlaneBaseUrl: defaults.controlPlaneBaseUrl,
    dataPlaneBaseUrl: defaults.dataPlaneBaseUrl,
    service: defaults.service,
    accessKeyId: defaults.accessKeyId,
    secretKey: defaults.secretKey,
    projectName: defaults.projectName,
    region: defaults.region,
    timeoutMs: defaults.timeoutMs
  });

  if (!resolved.accessKeyId || !resolved.secretKey) {
    throw new Error(formatMissingVikingAuthMessage());
  }

  return {
    ...resolved,
    authSource: defaults.authSource
  };
}
