// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runLlmStatusCommand } from '../../app/platform-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class LlmStatus extends Command {
  static override description = 'Show the current OpenAI-compatible LLM configuration and secret source.';

  static override flags = {
    ...outputFormatFlags,
    profile: Flags.string({
      description: 'Inspect a specific profile instead of the active one.'
    }),
    store: Flags.string({
      description: 'Credential store backend preference.',
      options: ['auto', 'keychain', 'file', 'ephemeral']
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(LlmStatus);
    await runLlmStatusCommand({
      profile: flags.profile,
      credentialStore: flags.store as 'auto' | 'keychain' | 'file' | 'ephemeral' | undefined
    });
  }
}
