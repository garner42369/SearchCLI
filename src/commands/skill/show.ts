// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runSkillShowCommand } from '../../app/skill-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class SkillShow extends Command {
  static override description = 'Show one Viking skill in detail.';

  static override examples = [
    '<%= config.bin %> skill show --name viking-shared'
  ];

  static override flags = {
    ...outputFormatFlags,
    name: Flags.string({ required: true }),
    root: Flags.string({
      description: 'Skill root directory to inspect. Defaults to the repository skills directory.'
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SkillShow);
    await runSkillShowCommand(flags.name, flags.root);
  }
}
