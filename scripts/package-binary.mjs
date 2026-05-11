// Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
// SPDX-License-Identifier: Apache-2.0

import { chmod, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const releaseDir = path.join(root, 'release');
const standaloneEntry = path.join(root, 'dist', 'standalone.js');
const packageJson = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
const targets = process.argv.slice(2);
const resolvedTargets = targets.length > 0 ? targets : [defaultTarget()];

execFileSync('node', [path.join(root, 'scripts', 'generate-embedded-repo-skills.mjs')], { cwd: root, stdio: 'inherit' });
execFileSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit' });

await rm(releaseDir, { recursive: true, force: true });
await mkdir(releaseDir, { recursive: true });

for (const target of resolvedTargets) {
  const output = path.join(releaseDir, outputNameForTarget(target));
  execFileSync(
    path.join(root, 'node_modules', '.bin', 'pkg'),
    [standaloneEntry, '--targets', target, '--output', output, '--public'],
    { cwd: root, stdio: 'inherit' }
  );
  await chmod(output, 0o755);
}

await writeChecksums();
await writeManifest();
console.log(`Release artifacts written to ${releaseDir}`);

function defaultTarget() {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'node20-macos-arm64';
  if (process.platform === 'darwin' && process.arch === 'x64') return 'node20-macos-x64';
  if (process.platform === 'linux' && process.arch === 'x64') return 'node20-linux-x64';
  if (process.platform === 'win32' && process.arch === 'x64') return 'node20-win-x64';
  throw new Error(`Unsupported local platform for default binary target: ${process.platform}-${process.arch}`);
}

function outputNameForTarget(target) {
  const name = `vs-${target.replace(/^node\d+-/, '')}`;
  return target.includes('win') ? `${name}.exe` : name;
}

async function writeChecksums() {
  const files = (await readdir(releaseDir, { withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => entry.name)
    .filter(name => !name.endsWith('.sha256') && name !== 'SHA256SUMS' && name !== 'manifest.json');

  const lines = [];
  for (const file of files.sort()) {
    const content = await readFile(path.join(releaseDir, file));
    const hash = createHash('sha256').update(content).digest('hex');
    lines.push(`${hash}  ${file}`);
  }

  await writeFile(path.join(releaseDir, 'SHA256SUMS'), `${lines.join('\n')}\n`, 'utf8');
}

async function writeManifest() {
  const checksumFile = await readFile(path.join(releaseDir, 'SHA256SUMS'), 'utf8');
  const checksumByFile = new Map(
    checksumFile
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => {
        const [sha256, file] = line.split(/\s{2,}/);
        return [file, sha256];
      })
  );

  const binaries = (await readdir(releaseDir))
    .filter(name => name.startsWith('vs-') && name !== 'vs')
    .sort()
    .map(file => ({
      file,
      sha256: checksumByFile.get(file),
      target: inferTarget(file)
    }));

  const manifest = {
    name: packageJson.name,
    version: packageJson.version,
    generatedAt: new Date().toISOString(),
    binaries,
    checksums: 'SHA256SUMS'
  };

  await writeFile(path.join(releaseDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function inferTarget(file) {
  const normalized = file.replace(/^vs-/, '').replace(/\.exe$/, '');
  const [platform, arch] = normalized.split('-');
  return { platform, arch };
}
