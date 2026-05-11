// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runDatasetCreateCommand } from '../../app/product-commands';
import { serviceFlags } from '../../command-support/service-flags';

export default class DatasetCreate extends Command {
  static override description = 'Create a Viking dataset.';

  static override examples = [
    '<%= config.bin %> dataset create --name demo-items --type item --schema @schema.json --field-config @field-config.json',
    '<%= config.bin %> dataset create --data @dataset.json'
  ];

  static override flags = {
    ...serviceFlags,
    name: Flags.string(),
    type: Flags.string(),
    description: Flags.string(),
    schema: Flags.string({
      description: 'Inline JSON, @file path, or JSON file path.'
    }),
    'field-config': Flags.string({
      description: 'Inline JSON, @file path, or JSON file path.'
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(DatasetCreate);
    await runDatasetCreateCommand({
      baseUrl: flags['base-url'],
      accessKeyId: flags.ak,
      secretKey: flags.sk,
      region: flags.region,
      timeoutMs: flags['timeout-ms'],
      data: flags.data,
      name: flags.name,
      type: flags.type,
      description: flags.description,
      schema: flags.schema,
      fieldConfig: flags['field-config']
    });
  }
}
