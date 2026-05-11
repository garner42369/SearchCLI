// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runSkillValidateCommand } from '../../app/skill-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class SkillValidate extends Command {
  static override description = 'Validate Viking skill metadata in this repository.';

  static override examples = [
    '<%= config.bin %> skill validate',
    '<%= config.bin %> skill validate --json'
  ];

  static override flags = {
    ...outputFormatFlags,
    root: Flags.string({
      description: 'Skill root directory to validate. Defaults to the repository skills directory.'
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SkillValidate);
    await runSkillValidateCommand(flags.root);
  }
}
