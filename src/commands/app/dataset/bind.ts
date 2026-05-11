// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runAppDatasetBindCommand } from '../../../app/product-commands';
import { serviceFlags } from '../../../command-support/service-flags';

export default class AppDatasetBind extends Command {
  static override description = 'Bind a dataset to an application.';

  static override flags = {
    ...serviceFlags,
    'application-id': Flags.string({ required: true, description: 'Viking application ID.' }),
    'dataset-id': Flags.string({ required: true, description: 'Viking dataset ID.' }),
    'project-name': Flags.string({ description: 'Viking project name when the API requires project scoping.' }),
    'dry-run': Flags.boolean({ description: 'Validate only without persisting the change.' })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AppDatasetBind);
    await runAppDatasetBindCommand({
      baseUrl: flags['base-url'],
      accessKeyId: flags.ak,
      secretKey: flags.sk,
      region: flags.region,
      timeoutMs: flags['timeout-ms'],
      data: flags.data,
      projectName: flags['project-name'],
      applicationId: flags['application-id'],
      datasetId: flags['dataset-id'],
      dryRun: flags['dry-run']
    });
  }
}
