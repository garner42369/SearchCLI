// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { renderHelpLines, type HelpLine } from './help-utils';

const CORE_COMMANDS: HelpLine[] = [
  { text: 'skill              Manage installable Viking skills' },
  { text: 'auth               Manage Viking credentials' },
  { text: 'doctor             Check auth, config, and local dependencies' }
];

const PRODUCT_COMMANDS: HelpLine[] = [
  { text: 'item               Profile item data, generate onboarding plans, and apply them' },
  { text: 'app                Manage applications, activation, and readiness' },
  { text: 'dataset            Manage datasets, schema, uploads, and ingest workflows' },
  { text: 'data               Write and inspect dataset items directly' },
  { text: 'search             Run search and manage search scenes' },
  { text: 'chat               Run conversational search' },
  { text: 'recommend          Run recommend and manage scenes and rules' }
];

const ADVANCED_COMMANDS: HelpLine[] = [
  { text: 'version            Print the current CLI version' }
];

export function printRootHelp(): void {
  const coreCommands = renderHelpLines(CORE_COMMANDS, false).join('\n  ');
  const productCommands = renderHelpLines(PRODUCT_COMMANDS, false).join('\n  ');
  const advancedCommands = renderHelpLines(ADVANCED_COMMANDS, false).join('\n  ');
  const moreHelpLines = [
    'viking <command> --help',
    'viking app --help',
    'viking item --help',
    'viking skill --help',
    'viking auth --help'
  ];

  console.log(`SearchCLI

Interactive AI search CLI. Use item/app/dataset/search/chat for the primary product workflow.

USAGE
  viking <command>

QUICK START
  Sign in and verify access
    viking auth import-env
    viking auth login
    viking doctor

  Create or activate an app from item data
    viking item profile --file ./items.json --pretty
    viking item plan --file ./items.json --goal "Build item search"
    viking item apply --plan-dir ./.viking/item-plans/<plan> --confirm-review --wait-ready --run-trials

  Try one search request
    viking search run --application-id <app> --query "wireless headphones"
    if the app has multiple datasets, add --dataset-id <dataset>

CORE
  ${coreCommands}

PRODUCT
  ${productCommands}

ADVANCED
  ${advancedCommands}

MORE HELP
  ${moreHelpLines.join('\n  ')}`);
}
