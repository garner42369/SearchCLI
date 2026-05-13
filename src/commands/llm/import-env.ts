// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runLlmImportEnvCommand } from '../../app/platform-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class LlmImportEnv extends Command {
  static override description = 'Import OpenAI-compatible LLM settings from VIKING_LLM_* env vars into local config and credential store.';

  static override flags = {
    ...outputFormatFlags,
    profile: Flags.string({
      description: 'Credential profile to store and activate. Defaults to the active profile or "default".'
    }),
    store: Flags.string({
      description: 'Credential store backend preference.',
      options: ['auto', 'keychain', 'file', 'ephemeral']
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(LlmImportEnv);
    await runLlmImportEnvCommand({
      profile: flags.profile,
      credentialStore: flags.store as 'auto' | 'keychain' | 'file' | 'ephemeral' | undefined
    });
  }
}
