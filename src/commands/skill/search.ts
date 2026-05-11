// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runSkillSearchCommand } from '../../app/skill-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class SkillSearch extends Command {
  static override description = 'Search Viking skills by name, title, or description.';

  static override examples = [
    '<%= config.bin %> skill search --query "search debug" --table',
    '<%= config.bin %> skill search --query "data import" --json',
    '<%= config.bin %> skill search --category app --query activate --json'
  ];

  static override flags = {
    ...outputFormatFlags,
    query: Flags.string({ description: 'Search query string.' }),
    category: Flags.string({
      description: 'Optional category filter applied before search scoring.'
    }),
    root: Flags.string({
      description: 'Skill root directory to inspect. Defaults to the repository skills directory.'
    }),
    'max-results': Flags.integer({
      default: 20
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SkillSearch);
    await runSkillSearchCommand(flags.query, flags['max-results'], flags.root, flags.category);
  }
}
