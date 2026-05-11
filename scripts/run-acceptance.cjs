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
      .filter(name => /^viking-(?!agent)/.test(name) && !name.endsWith('.sha256') && name !== 'SHA256SUMS' && name !== 'manifest.json' && name !== 'install.sh')
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
    'viking-chat',
    'viking-item-onboarding',
    'viking-recommend',
    'viking-search',
    'viking-shared'
  ]);
  return `${command.prefix} skill list --json`;
}

async function testSkillShow() {
  const { stdout } = await runCli(['skill', 'show', '--name', 'viking-item-onboarding', '--json']);
  const payload = JSON.parse(stdout);
  assert.equal(payload.name, 'viking-item-onboarding');
  assert.match(payload.description, /item-level search onboarding/i);
  return `${command.prefix} skill show --name viking-item-onboarding --json`;
}

async function testDatasetListHelp() {
  const { stdout } = await runCli(['dataset', 'list', '--help']);
  assert.match(stdout, /--type/);
  assert.match(stdout, /--full/);
  assert.match(stdout, /dataset list \[--type <type> --name <text> --application-id <id> --full\]/i);
  return `${command.prefix} dataset list --help`;
}

async function testAppListHelp() {
  const { stdout } = await runCli(['app', '--help']);
  assert.match(stdout, /app list \[--name <text> --dataset-id <id> --industry <type> --state <state> --full\]/i);
  return `${command.prefix} app --help`;
}

async function testConfigSummaryHelp() {
  const datasetGet = await runCli(['dataset', 'get', '--help']);
  assert.match(datasetGet.stdout, /--full/);

  const appDatasetConfigGet = await runCli(['app', 'dataset-config', 'get', '--help']);
  assert.match(appDatasetConfigGet.stdout, /--full/);

  const appOnlineConfigGet = await runCli(['app', 'online-config', 'get', '--help']);
  assert.match(appOnlineConfigGet.stdout, /--full/);

  return `${command.prefix} dataset get --help && ${command.prefix} app dataset-config get --help && ${command.prefix} app online-config get --help`;
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
  assert.match(itemApplyHelp.stdout, /--confirm-recommend-entry-binding/);

  const recommendCreateHelp = await runCli(['recommend', 'scene', 'create', '--help']);
  assert.match(recommendCreateHelp.stdout, /--confirm-entry-binding/);

  const chatSkill = await runCli(['skill', 'show', '--name', 'viking-chat', '--json']);
  const chatSkillPayload = JSON.parse(chatSkill.stdout);
  assert.match(JSON.stringify(chatSkillPayload.workflow), /not treat the output as NDJSON/i);

  return `${command.prefix} item apply --help && ${command.prefix} recommend scene create --help && ${command.prefix} skill show --name viking-chat --json`;
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
