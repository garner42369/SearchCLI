// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

function installLocalStorageShim(): void {
  if (typeof globalThis !== 'object' || !globalThis) return;
  if (process.env.VIKING_PRESERVE_NODE_LOCALSTORAGE === '1') return;

  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  if (!descriptor?.configurable || typeof descriptor.get !== 'function') return;

  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    enumerable: false,
    writable: false,
    value: Object.create(null) as Record<string, string>
  });
}

installLocalStorageShim();
