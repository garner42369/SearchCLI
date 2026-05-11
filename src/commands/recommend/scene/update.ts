// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runRecommendSceneUpdateCommand } from '../../../app/product-commands';
import { serviceFlags } from '../../../command-support/service-flags';

export default class RecommendSceneUpdate extends Command {
  static override description = 'Update a recommend scene config.';

  static override examples = [
    '<%= config.bin %> recommend scene update --application-id 123 --scene-id 456 --config @scene.json --confirm-entry-binding'
  ];

  static override flags = {
    ...serviceFlags,
    'application-id': Flags.string({ required: true, description: 'Viking application ID.' }),
    'scene-id': Flags.string({ required: true, description: 'Viking scene ID.' }),
    'project-name': Flags.string({ description: 'Viking project name when the API requires project scoping.' }),
    config: Flags.string({ description: 'Inline JSON, @file path, or JSON file path for a nested Config payload.' }),
    type: Flags.string(),
    name: Flags.string(),
    description: Flags.string(),
    'item-dataset-id': Flags.string(),
    'bhv-scene-types': Flags.string(),
    'confirm-entry-binding': Flags.boolean({
      description: 'Required for real writes. Confirms the user already chose the target page or module for this recommend scene.'
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(RecommendSceneUpdate);
    await runRecommendSceneUpdateCommand({
      baseUrl: flags['base-url'],
      accessKeyId: flags.ak,
      secretKey: flags.sk,
      region: flags.region,
      timeoutMs: flags['timeout-ms'],
      data: flags.data,
      projectName: flags['project-name'],
      applicationId: flags['application-id'],
      sceneId: flags['scene-id'],
      type: flags.type,
      name: flags.name,
      description: flags.description,
      itemDatasetId: flags['item-dataset-id'],
      bhvSceneTypes: flags['bhv-scene-types'],
      config: flags.config,
      confirmEntryBinding: flags['confirm-entry-binding']
    });
  }
}
