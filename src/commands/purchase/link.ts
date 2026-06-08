// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runPurchaseLinkCommand } from '../../app/product-commands';
import { outputFormatFlags } from '../../command-support/service-flags';

export default class PurchaseLink extends Command {
  static override description = 'Print the onboarding purchase page link.';

  static override examples = [
    '<%= config.bin %> purchase link --environment-id volcano-cn-beijing',
    '<%= config.bin %> purchase link --environment-id volcano-ap-southeast-1',
    '<%= config.bin %> purchase link --environment-id byteplus-ap-southeast-1'
  ];

  static override flags = {
    ...outputFormatFlags,
    'environment-id': Flags.string({
      default: 'volcano-cn-beijing',
      options: ['volcano-cn-beijing', 'volcano-ap-southeast-1', 'byteplus-ap-southeast-1'],
      description: 'Environment id for selecting the purchase page link.'
    })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(PurchaseLink);
    await runPurchaseLinkCommand({
      environmentId: flags['environment-id']
    });
  }
}
