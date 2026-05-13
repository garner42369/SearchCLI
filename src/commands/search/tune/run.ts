// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { Command, Flags } from '@oclif/core';
import { runSearchTuneRunCommand } from '../../../app/search-tuning-commands';
import { serviceFlags } from '../../../command-support/service-flags';

export default class SearchTuneRun extends Command {
  static override description = 'Run first-version automated search evaluation and similarity tuning.';

  static override examples = [
    '<%= config.bin %> search tune run --application-id app --dataset-id ds --profile similarity-only',
    '<%= config.bin %> search tune run --application-id app --dataset-id ds --queries ./queries.jsonl --top-k 20 --max-strategies 30 --search-concurrency 18',
    '<%= config.bin %> search tune run --application-id app --resume-run-id run_2026-05-12T00-00-00Z'
  ];

  static override flags = {
    ...serviceFlags,
    'application-id': Flags.string({ required: true, description: 'Viking application ID.' }),
    'dataset-id': Flags.string({ description: 'Dataset ID. If omitted, the CLI tries to infer a unique search dataset.' }),
    profile: Flags.string({ default: 'similarity-only', options: ['similarity-only'] }),
    queries: Flags.string({ description: 'JSON/JSONL/CSV query set. If omitted, the CLI uses the configured LLM to generate queries.' }),
    'query-count': Flags.integer({ default: 100, description: 'Maximum number of queries to evaluate.' }),
    'top-k': Flags.integer({ default: 20, description: 'Number of search results judged per query and strategy.' }),
    'max-strategies': Flags.integer({ default: 30, description: 'Maximum number of candidate strategies to evaluate.' }),
    'search-concurrency': Flags.integer({ default: 18, min: 1, description: 'Concurrent search requests. Default: 18.' }),
    'output-dir': Flags.string({ description: 'Tuning artifact root. Defaults to .viking/search-tuning.' }),
    'resume-run-id': Flags.string({ description: 'Resume an incomplete run from run-state.json, rankings.jsonl, labels-used.jsonl, and partial-metrics.json.' })
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(SearchTuneRun);
    await runSearchTuneRunCommand({
      baseUrl: flags['base-url'],
      accessKeyId: flags.ak,
      secretKey: flags.sk,
      projectName: flags['project-name'],
      region: flags.region,
      timeoutMs: flags['timeout-ms'],
      data: flags.data,
      applicationId: flags['application-id'],
      datasetId: flags['dataset-id'],
      profile: flags.profile,
      queries: flags.queries,
      queryCount: flags['query-count'],
      topK: flags['top-k'],
      maxStrategies: flags['max-strategies'],
      searchConcurrency: flags['search-concurrency'],
      outputDir: flags['output-dir'],
      resumeRunId: flags['resume-run-id']
    });
  }
}
