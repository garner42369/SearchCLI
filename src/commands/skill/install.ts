// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runSkillInstallCommand } from '../../app/skill-commands';
import { outputFormatFlags } from '../../command-support/service-flags';
import type { SkillInstallTargetMode } from '../../skills/repo-skills';

export default class SkillInstall extends Command {
  static override description = 'Install Viking skills from this repository.';

  static override examples = [
    '<%= config.bin %> skill install all',
    '<%= config.bin %> skill install viking-shared viking-search --dest /tmp/viking-skills',
    '<%= config.bin %> skill install viking-chat --force --json'
  ];

  static override strict = false;

  static override flags = {
    ...outputFormatFlags,
    root: Flags.string({
      description: 'Skill root directory to install from. Defaults to the repository skills directory.'
    }),
    target: Flags.string({
      options: ['global', 'codex', 'agents', 'both'],
      description: 'Install target. Defaults to global.'
    }),
    dest: Flags.string({
      description: 'Explicit destination directory. Overrides --target.'
    }),
    force: Flags.boolean({
      description: 'Overwrite an existing destination skill directory.'
    })
  };

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(SkillInstall);
    const names = argv.map(value => String(value)).filter(Boolean);
    await runSkillInstallCommand(names, {
      root: flags.root,
      dest: flags.dest,
      force: flags.force,
      targetMode: flags.target as SkillInstallTargetMode | undefined
    });
  }
}
