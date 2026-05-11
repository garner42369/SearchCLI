// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runAppDatasetConfigGetCommand } from '../../../app/product-commands';
import { serviceFlags } from '../../../command-support/service-flags';

export default class AppDatasetConfigGet extends Command {
  static override description = 'Get a single application dataset config.';

  static override flags = {
    ...serviceFlags,
    'application-id': Flags.string({ required: true, description: 'Viking application ID.' }),
    'dataset-id': Flags.string({ required: true, description: 'Viking dataset ID.' }),
    'project-name': Flags.string({ description: 'Viking project name when the API requires project scoping.' }),
    'field-config-version': Flags.integer({ description: 'Optional data field config version to inspect.' }),
    full: Flags.boolean({ description: 'Return the raw GetAppDataConfig response instead of the compact summary.' })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AppDatasetConfigGet);
    await runAppDatasetConfigGetCommand({
      baseUrl: flags['base-url'],
      accessKeyId: flags.ak,
      secretKey: flags.sk,
      region: flags.region,
      timeoutMs: flags['timeout-ms'],
      data: flags.data,
      projectName: flags['project-name'],
      applicationId: flags['application-id'],
      datasetId: flags['dataset-id'],
      fieldConfigVersion: flags['field-config-version'],
      full: flags.full
    });
  }
}
