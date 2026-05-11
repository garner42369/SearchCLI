// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runAuthLogoutCommand } from '../../app/platform-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class AuthLogout extends Command {
  static override description = 'Delete stored Viking credentials from the local credential store.';

  static override flags = {
    ...outputFormatFlags,
    profile: Flags.string({
      description: 'Credential profile to clear. Defaults to the active profile.'
    }),
    store: Flags.string({
      description: 'Credential store backend preference.',
      options: ['auto', 'keychain', 'file', 'ephemeral']
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AuthLogout);
    await runAuthLogoutCommand({
      profile: flags.profile,
      credentialStore: flags.store as 'auto' | 'keychain' | 'file' | 'ephemeral' | undefined
    });
  }
}
