// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

export interface ConsoleTopAction {
  action: string;
  path: string;
  version: string;
  description: string;
  command?: string;
  payload?: unknown;
  category?: string;
  rpcName?: string;
}

const PUBLIC_CONSOLE_TOP_ACTIONS: ConsoleTopAction[] = [
  {
    action: 'GetAppOnlineConfig',
    path: '/api/v1/GetAppOnlineConfig',
    version: '2025-03-01',
    description: 'Get application online config through the console API.',
    command: 'vs app online-config get --application-id <app>',
    payload: { AppID: 'app_123', ProjectName: 'default' },
    category: 'application'
  },
  {
    action: 'UpsertAppOnlineConfig',
    path: '/api/v1/UpsertAppOnlineConfig',
    version: '2025-03-01',
    description: 'Create or update application online config through the console API.',
    command: 'vs app online-config update --application-id <app> --config @online-config.json',
    payload: { AppID: 'app_123', Config: { ChatConfig: { SearchSceneID: 'search_scene_default' } }, ProjectName: 'default' },
    category: 'application'
  }
];

export function listConsoleTopActions(): ConsoleTopAction[] {
  return PUBLIC_CONSOLE_TOP_ACTIONS.map(action => ({ ...action }));
}

export function getConsoleTopAction(nameOrPath: string): ConsoleTopAction | undefined {
  const lookup = nameOrPath.trim().toLowerCase();
  return PUBLIC_CONSOLE_TOP_ACTIONS.find(
    action => action.action.toLowerCase() === lookup || action.path.toLowerCase() === lookup
  );
}
