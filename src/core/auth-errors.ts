// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

export function formatMissingVikingAuthMessage(): string {
  return [
    'You are not authenticated. To get started:',
    '- If you already have AK/SK: run `vs auth login` or `vs auth import-env`.',
    '- If you are new to Viking AI Search: run `vs skill show vs-user-onboarding`.'
  ].join('\n');
}
