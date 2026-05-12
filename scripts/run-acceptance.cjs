#!/usr/bin/env node

// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0


const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const root = path.resolve(__dirname, '..');
const args = new Set(process.argv.slice(2));
const mode = args.has('--binary') ? 'binary' : 'dist';
const live = args.has('--live');
const timestamp = new Date().toISOString().replaceAll(':', '-').replace(/\.\d+Z$/, 'Z');
const reportDir = path.join(root, 'tmp-acceptance', `${timestamp}-${mode}`);
const reportPath = path.join(reportDir, 'acceptance.md');

const command = resolveCommand(mode);
const tests = [];

async function main() {
  fs.mkdirSync(reportDir, { recursive: true });

  await runTest('root-help', testRootHelp);
  await runTest('skill-list', testSkillList);
  await runTest('skill-show', testSkillShow);
  await runTest('search-tune-help', testSearchTuneHelp);
  await runTest('search-tune-plan', testSearchTunePlan);
  await runTest('search-tune-apply-dry-run', testSearchTuneApplyDryRun);
  await runTest('search-tune-run-help', testSearchTuneRunHelp);
  await runTest('app-list-help', testAppListHelp);
  await runTest('dataset-list-help', testDatasetListHelp);
  await runTest('config-summary-help', testConfigSummaryHelp);
  await runTest('item-profile', testItemProfile);
  await runTest('item-plan', testItemPlan);
  await runTest('high-risk-guards', testHighRiskGuards);
  await runTest('auth-import-env', testAuthImportEnv);

  if (live) {
    await runSkipped('live-smoke', 'Live acceptance is intentionally excluded from the public repository.');
  }

  writeReport();

  const failed = tests.filter(test => test.status === 'failed');
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

function resolveCommand(kind) {
  if (kind === 'binary') {
    const releaseDir = path.join(root, 'release');
    const candidates = fs
      .readdirSync(releaseDir, { withFileTypes: true })
      .filter(entry => entry.isFile())
      .map(entry => entry.name)
      .filter(name => /^vs-(?!agent)/.test(name) && !name.endsWith('.sha256') && name !== 'SHA256SUMS' && name !== 'manifest.json' && name !== 'install.sh')
      .sort();

    if (candidates.length === 0) {
      throw new Error(`No packaged binary found in ${releaseDir}`);
    }

    return { file: path.join(releaseDir, candidates[candidates.length - 1]), prefix: candidates[candidates.length - 1] };
  }

  return { file: 'node', args: [path.join(root, 'bin', 'run.js')], prefix: 'node bin/run.js' };
}

async function runCli(argv, options = {}) {
  const file = command.file;
  const extraArgs = command.args ?? [];
  const env = {
    ...process.env,
    ...options.env
  };

  return execFileAsync(file, [...extraArgs, ...argv], {
    cwd: root,
    env,
    maxBuffer: 16 * 1024 * 1024
  });
}

async function runTest(name, fn) {
  try {
    const detail = await fn();
    tests.push({ name, status: 'passed', detail });
  } catch (error) {
    tests.push({
      name,
      status: 'failed',
      detail: error instanceof Error ? `${error.name}: ${error.message}` : String(error)
    });
  }
}

async function runSkipped(name, reason) {
  tests.push({ name, status: 'skipped', detail: reason });
}

async function testRootHelp() {
  const { stdout } = await runCli(['--help']);
  assert.match(stdout, /SearchCLI/);
  assert.match(stdout, /\bitem\b/);
  assert.doesNotMatch(stdout, /\bchat-mode\b/);
  assert.doesNotMatch(stdout, /\bchat-skill\b/);
  return `${command.prefix} --help`;
}

async function testSkillList() {
  const { stdout } = await runCli(['skill', 'list', '--json']);
  const payload = JSON.parse(stdout);
  const names = payload.skills.map(skill => skill.name).sort();
  assert.deepEqual(names, [
    'vs-alias-mapping',
    'vs-app-dataset-bind',
    'vs-chat',
    'vs-item-onboarding',
    'vs-recommend',
    'vs-search',
    'vs-search-tuning',
    'vs-shared'
  ]);
  return `${command.prefix} skill list --json`;
}

async function testSkillShow() {
  const { stdout } = await runCli(['skill', 'show', '--name', 'vs-item-onboarding', '--json']);
  const payload = JSON.parse(stdout);
  assert.equal(payload.name, 'vs-item-onboarding');
  assert.match(payload.description, /item-level onboarding/i);
  return `${command.prefix} skill show --name vs-item-onboarding --json`;
}

async function testDatasetListHelp() {
  const { stdout } = await runCli(['dataset', 'list', '--help']);
  assert.match(stdout, /--type/);
  assert.match(stdout, /--full/);
  assert.match(stdout, /dataset list \[--type <type>\] \[--name <text>\] \[--application-id <id>\] \[--full\]/i);
  return `${command.prefix} dataset list --help`;
}

async function testAppListHelp() {
  const { stdout } = await runCli(['app', '--help']);
  assert.match(stdout, /app list \[--name <text> --dataset-id <id> --industry <type> --state <state> --full\]/i);
  return `${command.prefix} app --help`;
}

async function testSearchTuneHelp() {
  const { stdout } = await runCli(['search', '--help']);
  assert.match(stdout, /search tune llm-check/i);
  assert.match(stdout, /search tune plan/i);
  assert.match(stdout, /search tune query-generate/i);
  assert.match(stdout, /search tune run/i);
  assert.match(stdout, /search tune apply/i);
  assert.match(stdout, /search tune report/i);
  return `${command.prefix} search --help`;
}

async function testSearchTunePlan() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'viking-acceptance-tune-plan-'));
  const queriesPath = path.join(workspace, 'queries.jsonl');
  fs.writeFileSync(
    queriesPath,
    [
      JSON.stringify({ id: 'q1', text: '对象存储' }),
      JSON.stringify({ id: 'q2', text: 'ECS API' }),
      JSON.stringify({ id: 'q3', query: { text: '如何创建云服务器实例' } })
    ].join('\n')
  );

  const { stdout } = await runCli([
    'search',
    'tune',
    'plan',
    '--application-id',
    'app-1',
    '--dataset-id',
    'ds-1',
    '--queries',
    queriesPath,
    '--query-count',
    '2',
    '--top-k',
    '5',
    '--max-strategies',
    '8',
    '--json'
  ]);
  const payload = JSON.parse(stdout);
  assert.equal(payload.profile, 'similarity-only');
  assert.equal(payload.querySource, 'user-provided');
  assert.equal(payload.estimated.queryCount, 2);
  assert.equal(payload.estimated.strategyCount, 8);
  assert.equal(payload.estimated.searchRequests, 16);
  assert.equal(payload.estimated.maxPointwiseJudgements, 80);
  assert.deepEqual(payload.fixed.mode, 'UserDefined');
  assert.ok(payload.tunedParameters.includes('user_defined_recall_mode'));
  assert.ok(payload.tunedParameters.includes('dense_weight'));
  assert.ok(payload.tunedParameters.includes('query_keyword_match_percent'));
  assert.ok(payload.tunedParameters.includes('max_retrieved_num'));
  assert.ok(payload.excludedParameters.includes('mode'));
  assert.deepEqual(payload.coverage.mode.values, ['UserDefined']);
  assert.ok(payload.coverage.user_defined_recall_mode.values.includes('KeywordOnly'));
  assert.ok(payload.coverage.user_defined_recall_mode.values.includes('SemanticOnly'));
  assert.ok(payload.coverage.user_defined_recall_mode.values.includes('KeywordSemantic'));
  return `${command.prefix} search tune plan --application-id app-1 --dataset-id ds-1 --queries ${queriesPath} --json`;
}

async function testSearchTuneRunHelp() {
  const { stdout } = await runCli(['search', 'tune', 'run', '--help']);
  assert.match(stdout, /--resume-run-id/);
  assert.match(stdout, /run-state\.json/);
  assert.match(stdout, /partial-metrics\.json/);
  return `${command.prefix} search tune run --help`;
}

async function testSearchTuneApplyDryRun() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'viking-acceptance-tune-apply-'));
  const runId = 'run_acceptance';
  const runDir = path.join(workspace, 'runs', runId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(
    path.join(runDir, 'report.json'),
    JSON.stringify(
      {
        runId,
        generatedAt: '2026-05-12T00:00:00Z',
        applicationId: 'app-1',
        datasetId: 'ds-1',
        profile: 'similarity-only',
        querySource: 'user-provided',
        topK: 5,
        queryCount: 2,
        strategyCount: 1,
        labelCount: 4,
        recommendedStrategyId: 'ks-test',
        strategyCoverage: {},
        strategies: [
          {
            id: 'ks-test',
            title: 'Keyword + semantic test',
            searchDynamic: {
              mode: 'UserDefined',
              user_defined_recall_mode: 'KeywordSemantic',
              dense_weight: 0.5,
              text_weight: 0.5,
              max_retrieved_num: 100,
              rerank_enabled: false
            },
            requestParams: {
              query_keyword_match_percent: 0.5,
              disable_personalize: true
            }
          }
        ],
        metrics: [],
        artifacts: {}
      },
      null,
      2
    )
  );

  const { stdout } = await runCli([
    'search',
    'tune',
    'apply',
    '--application-id',
    'app-1',
    '--run-id',
    runId,
    '--output-dir',
    workspace,
    '--dry-run',
    '--json'
  ]);
  const payload = JSON.parse(stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.dryRun, true);
  assert.equal(payload.createPayload.AppID, 'app-1');
  assert.equal(payload.onlinePayload.Config.SearchConfig.RetrieveConfigs[0].Mode, 4);
  assert.equal(payload.onlinePayload.Config.SearchConfig.RetrieveConfigs[0].UserDefinedRecallMode, 0);
  assert.equal(payload.onlinePayload.Config.SearchConfig.RetrieveConfigs[0].MaxRecallNum, 100);
  assert.equal(payload.onlinePayload.Config.SearchConfig.RetrieveConfigs[0].DenseWeight, 0.5);
  assert.equal(payload.unappliedRequestParams.query_keyword_match_percent, 0.5);
  return `${command.prefix} search tune apply --application-id app-1 --run-id ${runId} --output-dir ${workspace} --dry-run --json`;
}

async function testConfigSummaryHelp() {
  const datasetGet = await runCli(['dataset', 'get', '--help']);
  assert.match(datasetGet.stdout, /--full/);

  const appDatasetConfigGet = await runCli(['app', 'dataset-config', 'get', '--help']);
  assert.match(appDatasetConfigGet.stdout, /--full/);

  const appHelp = await runCli(['app', '--help']);
  assert.match(appHelp.stdout, /online-config get/i);
  assert.match(appHelp.stdout, /--full/);

  return `${command.prefix} dataset get --help && ${command.prefix} app dataset-config get --help && ${command.prefix} app --help`;
}

async function testItemProfile() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'viking-acceptance-profile-'));
  const samplePath = path.join(workspace, 'items.json');
  fs.writeFileSync(
    samplePath,
    JSON.stringify(
      [
        { doc_id: 'item-1', title: 'Blue notebook', category: 'stationery', content: 'Soft cover notebook' },
        { doc_id: 'item-2', title: 'Green notebook', category: 'stationery', content: 'Hard cover notebook' }
      ],
      null,
      2
    )
  );

  const { stdout } = await runCli(['item', 'profile', '--file', samplePath, '--json']);
  const payload = JSON.parse(stdout);
  assert.equal(payload.inferred.primaryKeyField, 'doc_id');
  assert.equal(payload.inferred.titleField, 'title');
  return `${command.prefix} item profile --file ${samplePath} --json`;
}

async function testItemPlan() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'viking-acceptance-plan-'));
  const samplePath = path.join(workspace, 'items.json');
  const outputDir = path.join(workspace, 'plans');
  fs.writeFileSync(
    samplePath,
    JSON.stringify(
      [
        { doc_id: 'item-1', title: 'Blue notebook', category: 'stationery', content: 'Soft cover notebook' },
        { doc_id: 'item-2', title: 'Green notebook', category: 'stationery', content: 'Hard cover notebook' }
      ],
      null,
      2
    )
  );

  const { stdout } = await runCli([
    'item',
    'plan',
    '--file',
    samplePath,
    '--goal',
    'Build stationery search',
    '--output-dir',
    outputDir,
    '--json'
  ]);
  const payload = JSON.parse(stdout);
  const files = payload.plan.files;
  for (const required of ['schema', 'fieldConfig', 'onlineConfig', 'validation']) {
    assert.ok(files[required], `missing ${required}`);
    assert.ok(fs.existsSync(path.join(payload.planDir, files[required])), `file not found for ${required}`);
  }
  assert.ok(fs.existsSync(payload.planPath), 'missing plan.json');
  return `${command.prefix} item plan --file ${samplePath} --goal "Build stationery search" --output-dir ${outputDir} --json`;
}

async function testHighRiskGuards() {
  const itemApplyHelp = await runCli(['item', 'apply', '--help']);
  assert.match(itemApplyHelp.stdout, /--confirm-review/);

  const recommendHelp = await runCli(['recommend', '--help']);
  assert.match(recommendHelp.stdout, /--confirm-entry-binding/);

  const chatSkill = await runCli(['skill', 'show', '--name', 'vs-chat', '--json']);
  const chatSkillPayload = JSON.parse(chatSkill.stdout);
  assert.match(JSON.stringify(chatSkillPayload.workflow), /not treat the output as NDJSON/i);

  return `${command.prefix} item apply --help && ${command.prefix} recommend --help && ${command.prefix} skill show --name vs-chat --json`;
}

async function testAuthImportEnv() {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'viking-acceptance-auth-'));
  const homeDir = path.join(workspace, 'home');
  fs.mkdirSync(homeDir, { recursive: true });

  await runCli(['auth', 'import-env', '--profile', 'acceptance', '--json'], {
    env: {
      HOME: homeDir,
      VIKING_AK: 'acceptance-ak',
      VIKING_SK: 'acceptance-sk'
    }
  });

  const { stdout } = await runCli(['auth', 'status', '--profile', 'acceptance', '--json'], {
    env: {
      HOME: homeDir
    }
  });
  const payload = JSON.parse(stdout);
  assert.equal(payload.activeProfile, 'acceptance');
  assert.equal(payload.loggedIn, true);
  return `${command.prefix} auth import-env --profile acceptance --json`;
}

function writeReport() {
  const lines = [
    '# Acceptance',
    '',
    `- mode: ${mode}`,
    `- live: ${live ? 'true' : 'false'}`,
    `- command: ${command.prefix}`,
    ''
  ];

  for (const test of tests) {
    lines.push(`## ${test.name}`);
    lines.push(`- status: ${test.status}`);
    lines.push(`- detail: ${test.detail}`);
    lines.push('');
  }

  fs.writeFileSync(reportPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`Acceptance report written: ${reportPath}`);
}

void main().catch(error => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
