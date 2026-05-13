// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runLlmLoginCommand } from '../../app/platform-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class LlmLogin extends Command {
  static override description = 'Store an OpenAI-compatible LLM API key in the local credential store.';

  static override flags = {
    ...outputFormatFlags,
    provider: Flags.string({
      description: 'LLM provider protocol. First version supports only openai-compatible.',
      options: ['openai-compatible'],
      default: 'openai-compatible'
    }),
    'base-url': Flags.string({
      description: 'OpenAI-compatible chat completions base URL, without or with /chat/completions.'
    }),
    model: Flags.string({
      description: 'LLM model name to send in chat completion requests.'
    }),
    'api-key': Flags.string({
      description: 'LLM API key. Prefer interactive prompt or VIKING_LLM_API_KEY over passing this in shell history.'
    }),
    profile: Flags.string({
      description: 'Credential profile to store and activate. Defaults to the active profile or "default".'
    }),
    store: Flags.string({
      description: 'Credential store backend preference.',
      options: ['auto', 'keychain', 'file', 'ephemeral']
    }),
    'no-prompt': Flags.boolean({
      description: 'Fail instead of prompting when LLM settings are missing.',
      default: false
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(LlmLogin);
    await runLlmLoginCommand({
      llmProvider: flags.provider,
      llmBaseUrl: flags['base-url'],
      llmModel: flags.model,
      llmApiKey: flags['api-key'],
      profile: flags.profile,
      credentialStore: flags.store as 'auto' | 'keychain' | 'file' | 'ephemeral' | undefined,
      noPrompt: flags['no-prompt']
    });
  }
}
