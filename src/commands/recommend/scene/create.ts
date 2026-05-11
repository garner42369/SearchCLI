// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runRecommendSceneCreateCommand } from '../../../app/product-commands';
import { serviceFlags } from '../../../command-support/service-flags';

export default class RecommendSceneCreate extends Command {
  static override description = 'Create a recommend scene.';

  static override examples = [
    '<%= config.bin %> recommend scene create --application-id 123 --type for_you --name homepage --item-dataset-id 456 --bhv-scene-types scene_a --confirm-entry-binding',
    '<%= config.bin %> recommend scene create --application-id 123 --data @recommend-scene.json --confirm-entry-binding'
  ];

  static override flags = {
    ...serviceFlags,
    'application-id': Flags.string({ required: true, description: 'Viking application ID.' }),
    'project-name': Flags.string({ description: 'Viking project name when the API requires project scoping.' }),
    type: Flags.string(),
    name: Flags.string(),
    description: Flags.string(),
    'item-dataset-id': Flags.string(),
    'recommend-model': Flags.integer(),
    'optimization-target': Flags.integer(),
    'bhv-scene-types': Flags.string({
      description: 'Comma-separated behavior scene types. Required unless --data already includes BhvSceneTypes.'
    }),
    'confirm-entry-binding': Flags.boolean({
      description: 'Required for real writes. Confirms the user already chose the target page or module for this recommend scene.'
    }),
    'click-event-types': Flags.string(),
    'positive-event-types': Flags.string(),
    'negative-event-types': Flags.string()
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(RecommendSceneCreate);
    await runRecommendSceneCreateCommand({
      baseUrl: flags['base-url'],
      accessKeyId: flags.ak,
      secretKey: flags.sk,
      region: flags.region,
      timeoutMs: flags['timeout-ms'],
      data: flags.data,
      projectName: flags['project-name'],
      applicationId: flags['application-id'],
      type: flags.type,
      name: flags.name,
      description: flags.description,
      itemDatasetId: flags['item-dataset-id'],
      recommendModel: flags['recommend-model'],
      optimizationTarget: flags['optimization-target'],
      bhvSceneTypes: flags['bhv-scene-types'],
      confirmEntryBinding: flags['confirm-entry-binding'],
      clickEventTypes: flags['click-event-types'],
      positiveEventTypes: flags['positive-event-types'],
      negativeEventTypes: flags['negative-event-types']
    });
  }
}
