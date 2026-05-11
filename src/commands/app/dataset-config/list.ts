// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runAppDatasetConfigListCommand } from '../../../app/product-commands';
import { serviceFlags } from '../../../command-support/service-flags';

export default class AppDatasetConfigList extends Command {
  static override description = 'List application dataset configs.';

  static override flags = {
    ...serviceFlags,
    'application-id': Flags.string({ required: true, description: 'Viking application ID.' }),
    'project-name': Flags.string({ description: 'Viking project name when the API requires project scoping.' }),
    'dataset-type': Flags.string(),
    'page-number': Flags.integer(),
    'page-size': Flags.integer(),
    'activated-only': Flags.boolean(),
    full: Flags.boolean({ description: 'Return the raw ListAppDataConfigs response instead of the compact summary.' })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AppDatasetConfigList);
    await runAppDatasetConfigListCommand({
      baseUrl: flags['base-url'],
      accessKeyId: flags.ak,
      secretKey: flags.sk,
      region: flags.region,
      timeoutMs: flags['timeout-ms'],
      data: flags.data,
      projectName: flags['project-name'],
      applicationId: flags['application-id'],
      datasetType: flags['dataset-type'],
      pageNumber: flags['page-number'],
      pageSize: flags['page-size'],
      activatedOnly: flags['activated-only'],
      full: flags.full
    });
  }
}
