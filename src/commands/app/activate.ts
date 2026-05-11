// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runAppActivateWorkflowCommand } from '../../app/workflow-commands';
import { workflowServiceFlags } from '../../command-support/service-flags';

export default class AppActivate extends Command {
  static override description = 'Bind a dataset, optionally update config, and verify app readiness as one workflow.';

  static override examples = [
    '<%= config.bin %> app activate --application-id 123 --dataset-id 456 --wait-ready',
    '<%= config.bin %> app activate --application-id 123 --dataset-id 456 --field-config @field-config.json --online-config @online-config.json'
  ];

  static override flags = {
    ...workflowServiceFlags,
    'application-id': Flags.string({ required: true }),
    'dataset-id': Flags.string({ required: true }),
    'project-name': Flags.string(),
    'field-config': Flags.string({
      description: 'Inline JSON, @file path, or JSON file path for UpdateAppDataConfig.DataConfig.'
    }),
    'schema-version': Flags.integer(),
    'field-config-version': Flags.integer(),
    'online-config': Flags.string({
      description: 'Inline JSON, @file path, or JSON file path for UpsertAppOnlineConfig.Config.'
    }),
    'wait-ready': Flags.boolean({
      description: 'Poll app status until runtime search is ready.'
    }),
    'activated-only': Flags.boolean({
      description: 'While checking readiness, only inspect activated dataset configs.'
    }),
    'wait-timeout-ms': Flags.integer(),
    'poll-interval-ms': Flags.integer()
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(AppActivate);
    await runAppActivateWorkflowCommand({
      baseUrl: flags['base-url'],
      accessKeyId: flags.ak,
      secretKey: flags.sk,
      region: flags.region,
      timeoutMs: flags['timeout-ms'],
      applicationId: flags['application-id'],
      datasetId: flags['dataset-id'],
      projectName: flags['project-name'],
      fieldConfig: flags['field-config'],
      schemaVersion: flags['schema-version'],
      fieldConfigVersion: flags['field-config-version'],
      onlineConfig: flags['online-config'],
      waitReady: flags['wait-ready'],
      activatedOnly: flags['activated-only'],
      waitTimeoutMs: flags['wait-timeout-ms'],
      pollIntervalMs: flags['poll-interval-ms']
    });
  }
}
