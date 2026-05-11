// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Args, Command } from '@oclif/core';
import { runAuthUseCommand } from '../../app/platform-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class AuthUse extends Command {
  static override description = 'Switch the active Viking auth profile.';

  static override examples = ['<%= config.bin %> auth use prod'];

  static override args = {
    profile: Args.string({
      required: true,
      description: 'Profile name to activate.'
    })
  };

  static override flags = {
    ...outputFormatFlags
  };

  async run(): Promise<void> {
    const { args } = await this.parse(AuthUse);
    await runAuthUseCommand({
      profile: args.profile
    });
  }
}
