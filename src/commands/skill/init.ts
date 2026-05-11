// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runSkillInitCommand } from '../../app/skill-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class SkillInit extends Command {
  static override description = 'Create a SearchCLI skill scaffold in a skills directory.';

  static override examples = [
    '<%= config.bin %> skill init viking-demo-skill',
    '<%= config.bin %> skill init viking-demo-skill --root /tmp/viking-skill-dev --category workflow',
    '<%= config.bin %> skill init viking-data-export --keywords "data import,dataset ingest" --commands "skill list,skill show,data import" --json'
  ];

  static override strict = false;

  static override flags = {
    ...outputFormatFlags,
    root: Flags.string({
      description: 'Skill root directory to create the scaffold in. Defaults to the repository skills directory.'
    }),
    title: Flags.string({
      description: 'Optional skill title. Defaults to a title inferred from the skill name.'
    }),
    description: Flags.string({
      description: 'Optional frontmatter description. Defaults to a placeholder sentence.'
    }),
    category: Flags.string({
      description: 'Skill category. Defaults to workflow.'
    }),
    'applies-to': Flags.string({
      description: 'Comma-separated applies_to targets. Defaults to codex,agents,external-agent.'
    }),
    'requires-cli': Flags.string({
      description: 'Minimum CLI version requirement. Defaults to >=0.1.0.'
    }),
    keywords: Flags.string({
      description: 'Comma-separated search keywords that help agents discover this skill.'
    }),
    commands: Flags.string({
      description: 'Comma-separated SearchCLI commands referenced by this skill.'
    }),
    force: Flags.boolean({
      description: 'Overwrite an existing skill directory if it already exists.'
    })
  };

  async run(): Promise<void> {
    const { argv, flags } = await this.parse(SkillInit);
    const name = argv[0] ? String(argv[0]) : '';
    await runSkillInitCommand(name, {
      root: flags.root,
      title: flags.title,
      description: flags.description,
      category: flags.category,
      appliesTo: flags['applies-to']?.split(',').map(value => value.trim()).filter(Boolean),
      requiresCli: flags['requires-cli'],
      keywords: flags.keywords?.split(',').map(value => value.trim()).filter(Boolean),
      commands: flags.commands?.split(',').map(value => value.trim()).filter(Boolean),
      force: flags.force
    });
  }
}
