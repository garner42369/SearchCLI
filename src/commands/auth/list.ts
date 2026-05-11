// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command } from '@oclif/core';
import { runAuthListCommand } from '../../app/platform-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class AuthList extends Command {
  static override description = 'List configured Viking auth profiles and whether each has stored credentials.';

  static override flags = outputFormatFlags;

  async run(): Promise<void> {
    await this.parse(AuthList);
    await runAuthListCommand();
  }
}
