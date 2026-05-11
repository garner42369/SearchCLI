// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import type { ServiceConfig } from './service-config';
import { postOpenApiJson, requestOpenApiJson } from './http';

export type OpenApiRequestMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export class VikingOpenApiClient {
  constructor(private readonly config: ServiceConfig) {}

  post<T = unknown>(pathname: string, payload: unknown): Promise<T> {
    return postOpenApiJson<T>(this.config, pathname, payload);
  }

  request<T = unknown>(
    method: OpenApiRequestMethod,
    pathname: string,
    payload?: unknown,
    params?: Record<string, string>
  ): Promise<T> {
    return requestOpenApiJson<T>(this.config, method, pathname, payload, params);
  }
}
