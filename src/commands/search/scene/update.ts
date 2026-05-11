// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runSearchSceneUpdateCommand } from '../../../app/product-commands';
import { serviceFlags } from '../../../command-support/service-flags';

export default class SearchSceneUpdate extends Command {
  static override description = 'Update a search scene config.';

  static override flags = {
    ...serviceFlags,
    'application-id': Flags.string({ required: true, description: 'Viking application ID.' }),
    'scene-id': Flags.string({ required: true, description: 'Viking scene ID.' }),
    'project-name': Flags.string({ description: 'Viking project name when the API requires project scoping.' }),
    config: Flags.string({ description: 'Inline JSON, @file path, or JSON file path for a nested Config payload.' }),
    name: Flags.string(),
    description: Flags.string()
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SearchSceneUpdate);
    await runSearchSceneUpdateCommand({
      baseUrl: flags['base-url'],
      accessKeyId: flags.ak,
      secretKey: flags.sk,
      region: flags.region,
      timeoutMs: flags['timeout-ms'],
      data: flags.data,
      projectName: flags['project-name'],
      applicationId: flags['application-id'],
      sceneId: flags['scene-id'],
      name: flags.name,
      description: flags.description,
      config: flags.config
    });
  }
}
