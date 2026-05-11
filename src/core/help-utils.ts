// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

export type HelpLine = {
  internal?: boolean;
  text: string;
};

export function hasHelpFlag(argv: string[]): boolean {
  return argv.includes('--help') || argv.includes('-h');
}

export function renderHelpLines(lines: HelpLine[], showInternal: boolean): string[] {
  return lines.filter(line => showInternal || !line.internal).map(line => line.text);
}

export function renderUsageBlock(
  publicLines: string[],
  internalLines: string[] = [],
  showInternal = false
): string {
  const lines: string[] = ['USAGE', ...publicLines.map(line => `  ${line}`)];

  if (showInternal && internalLines.length > 0) {
    lines.push('', 'INTERNAL / DEBUG COMMANDS', ...internalLines.map(line => `  ${line}`));
  }

  return lines.join('\n');
}
