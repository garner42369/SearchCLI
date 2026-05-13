// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runLlmLogoutCommand } from '../../app/platform-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class LlmLogout extends Command {
  static override description = 'Delete stored OpenAI-compatible LLM credentials from the local credential store.';

  static override flags = {
    ...outputFormatFlags,
    profile: Flags.string({
      description: 'Credential profile to delete. Defaults to the active profile or "default".'
    }),
    store: Flags.string({
      description: 'Credential store backend preference.',
      options: ['auto', 'keychain', 'file', 'ephemeral']
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(LlmLogout);
    await runLlmLogoutCommand({
      profile: flags.profile,
      credentialStore: flags.store as 'auto' | 'keychain' | 'file' | 'ephemeral' | undefined
    });
  }
}
