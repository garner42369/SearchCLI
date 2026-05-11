// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runSkillListCommand } from '../../app/skill-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class SkillList extends Command {
  static override description = 'List Viking skills.';

  static override examples = [
    '<%= config.bin %> skill list --table',
    '<%= config.bin %> skill list --category search --json'
  ];

  static override flags = {
    ...outputFormatFlags,
    category: Flags.string({
      description: 'Filter skills by category.'
    }),
    root: Flags.string({
      description: 'Skill root directory to inspect. Defaults to the repository skills directory.'
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SkillList);
    await runSkillListCommand(flags.root, {
      category: flags.category
    });
  }
}
