// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runItemPlanCommand } from '../../app/item-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class ItemPlan extends Command {
  static override description = 'Generate a reviewable item-onboarding plan with schema, field-config, and app artifacts.';

  static override examples = [
    '<%= config.bin %> item plan --file ./items.json --output-dir ./.viking/item-plan',
    '<%= config.bin %> item plan --file ./items.csv --goal "Build product item search" --application-name catalog-app'
  ];

  static override flags = {
    ...outputFormatFlags,
    file: Flags.string({
      required: true,
      description: 'Path to a JSON array, JSONL, or CSV file containing structured item records.'
    }),
    goal: Flags.string({
      description: 'Optional business goal to carry into the generated report and descriptions.'
    }),
    'output-dir': Flags.string({
      description: 'Directory to write plan artifacts into. Defaults to ./.viking/item-plans/<slug>-<timestamp>.'
    }),
    'dataset-name': Flags.string({
      description: 'Override the generated dataset name.'
    }),
    'application-name': Flags.string({
      description: 'Override the generated application name.'
    }),
    'project-name': Flags.string({
      description: 'Optional project name carried into generated control-plane payloads.'
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(ItemPlan);
    await runItemPlanCommand({
      file: flags.file,
      goal: flags.goal,
      outputDir: flags['output-dir'],
      datasetName: flags['dataset-name'],
      applicationName: flags['application-name'],
      projectName: flags['project-name']
    });
  }
}
