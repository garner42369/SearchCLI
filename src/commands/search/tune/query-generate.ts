// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runSearchTuneQueryGenerateCommand } from '../../../app/search-tuning-commands';
import { serviceFlags } from '../../../command-support/service-flags';

export default class SearchTuneQueryGenerate extends Command {
  static override description = 'Generate a reusable synthetic query set for search tuning.';

  static override examples = [
    '<%= config.bin %> search tune query-generate --application-id app --dataset-id ds --query-count 100',
    '<%= config.bin %> search tune query-generate --application-id app --dataset-id ds --output-dir ./.viking/search-tuning'
  ];

  static override flags = {
    ...serviceFlags,
    'application-id': Flags.string({ required: true, description: 'Viking application ID.' }),
    'dataset-id': Flags.string({ description: 'Dataset ID. If omitted, the CLI tries to infer a unique search dataset.' }),
    'scene-id': Flags.string({ description: 'Optional search scene ID.' }),
    'query-count': Flags.integer({ default: 100, description: 'Maximum number of queries to generate.' }),
    'output-dir': Flags.string({ description: 'Tuning artifact root. Defaults to .viking/search-tuning.' })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SearchTuneQueryGenerate);
    await runSearchTuneQueryGenerateCommand({
      baseUrl: flags['base-url'],
      accessKeyId: flags.ak,
      secretKey: flags.sk,
      projectName: flags['project-name'],
      region: flags.region,
      timeoutMs: flags['timeout-ms'],
      data: flags.data,
      applicationId: flags['application-id'],
      datasetId: flags['dataset-id'],
      sceneId: flags['scene-id'],
      queryCount: flags['query-count'],
      outputDir: flags['output-dir']
    });
  }
}
