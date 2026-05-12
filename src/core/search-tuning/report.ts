// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import type { TuningRunReportShape } from './types';

export function renderTuningMarkdownReport(report: TuningRunReportShape): string {
  const recommended = report.strategies.find(strategy => strategy.id === report.recommendedStrategyId);
  const metric = report.metrics.find(item => item.strategyId === report.recommendedStrategyId);
  const lines: string[] = [];

  lines.push(`# Search Tuning Report`);
  lines.push('');
  lines.push(`- Run ID: \`${report.runId}\``);
  lines.push(`- Generated At: \`${report.generatedAt}\``);
  lines.push(`- Application ID: \`${report.applicationId}\``);
  lines.push(`- Dataset ID: \`${report.datasetId}\``);
  if (report.sceneId) lines.push(`- Scene ID: \`${report.sceneId}\``);
  lines.push(`- Profile: \`${report.profile}\``);
  lines.push(`- Query Source: \`${report.querySource}\``);
  lines.push(`- Queries: ${report.queryCount}`);
  lines.push(`- Strategies: ${report.strategyCount}`);
  lines.push(`- Labels Used: ${report.labelCount}`);
  lines.push('');

  if (recommended && metric) {
    lines.push(`## Recommendation`);
    lines.push('');
    lines.push(`Recommended strategy: \`${recommended.id}\` (${recommended.title})`);
    lines.push('');
    lines.push(`- NDCG@20: ${formatMetric(metric.averageNdcgAt20)}`);
    lines.push(`- NDCG@10: ${formatMetric(metric.averageNdcgAt10)}`);
    lines.push(`- MRR@10: ${formatMetric(metric.averageMrrAt10)}`);
    lines.push(`- Precision@10: ${formatMetric(metric.averagePrecisionAt10)}`);
    lines.push(`- Zero Result Rate: ${formatMetric(metric.zeroResultRate)}`);
    lines.push(`- Avg Latency ms: ${Math.round(metric.averageLatencyMs)}`);
    lines.push('');
    lines.push(`### SearchDynamic`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(recommended.searchDynamic, null, 2));
    lines.push('```');
    lines.push('');
    lines.push(`### Request Params`);
    lines.push('');
    lines.push('```json');
    lines.push(JSON.stringify(recommended.requestParams, null, 2));
    lines.push('```');
    lines.push('');
  }

  lines.push(`## Strategy Coverage`);
  lines.push('');
  lines.push('| Parameter | Values |');
  lines.push('|---|---|');
  for (const [parameter, entry] of Object.entries(report.strategyCoverage)) {
    lines.push(`| \`${parameter}\` | ${entry.values.map(value => `\`${String(value)}\``).join(', ') || '(none)'} |`);
  }
  lines.push('');

  lines.push(`## Strategy Metrics`);
  lines.push('');
  lines.push('| Strategy | NDCG@20 | NDCG@10 | MRR@10 | Precision@10 | Zero Result | Avg Latency ms |');
  lines.push('|---|---:|---:|---:|---:|---:|---:|');
  for (const entry of [...report.metrics].sort((left, right) => right.averageNdcgAt20 - left.averageNdcgAt20)) {
    lines.push(
      `| \`${entry.strategyId}\` | ${formatMetric(entry.averageNdcgAt20)} | ${formatMetric(entry.averageNdcgAt10)} | ${formatMetric(entry.averageMrrAt10)} | ${formatMetric(entry.averagePrecisionAt10)} | ${formatMetric(entry.zeroResultRate)} | ${Math.round(entry.averageLatencyMs)} |`
    );
  }
  lines.push('');
  lines.push('## Notes');
  lines.push('');
  lines.push('- This first version evaluates text-query similarity only.');
  lines.push('- Rerank, personalization, hotness, boost/bury rules, and business operating rules are intentionally out of scope.');
  lines.push('- LLM labels are silver labels and should be reviewed before high-risk production changes.');
  lines.push('');

  return `${lines.join('\n')}\n`;
}

function formatMetric(value: number): string {
  return value.toFixed(4);
}
