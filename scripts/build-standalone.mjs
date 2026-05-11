// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { copyFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outfile = path.join(root, 'build', 'standalone.cjs');
const source = path.join(root, 'dist', 'standalone.js');

await mkdir(path.dirname(outfile), { recursive: true });
await copyFile(source, outfile);

console.log(`Standalone entry copied: ${outfile}`);
