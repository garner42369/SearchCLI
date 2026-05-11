#!/usr/bin/env bash

# Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
# SPDX-License-Identifier: Apache-2.0

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

log() {
  printf '[viking-install] %s\n' "$*"
}

fail() {
  printf '[viking-install] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Command not found: $1"
  fi
}

require_cmd node
require_cmd npm

# When invoked from `npm run ...`, npm may inject a lowercase `npm_config_prefix`
# that overrides the uppercase prefix supplied by callers. Normalize both names
# so scripted installs stay inside the caller-provided prefix.
if [ -n "${NPM_CONFIG_PREFIX:-}" ]; then
  export npm_config_prefix="${NPM_CONFIG_PREFIX}"
elif [ -n "${npm_config_prefix:-}" ]; then
  export NPM_CONFIG_PREFIX="${npm_config_prefix}"
fi

NODE_MAJOR="$(node -p "Number(process.versions.node.split('.')[0])")"
if [ "${NODE_MAJOR}" -lt 20 ]; then
  fail "Node.js 20 or newer is required. Current version: $(node -v)"
fi

log "repo: ${REPO_ROOT}"
log "node: $(node -v)"
log "npm: $(npm -v)"

cd "${REPO_ROOT}"

log "installing dependencies"
npm install --no-fund --no-audit

log "validating skills"
npm run validate:skills

log "building dist"
npm run build

log "installing viking globally"
npm install --global --no-fund --no-audit .

NPM_PREFIX="$(npm config get prefix)"
NPM_BIN="${NPM_PREFIX}/bin"

log "install complete"
log "command: viking"
log "npm prefix: ${NPM_PREFIX}"

if command -v viking >/dev/null 2>&1; then
  log "found in PATH: $(command -v viking)"
else
  log "viking is not yet on PATH. Ensure PATH includes: ${NPM_BIN}"
fi

cat <<'EOF'

Recommended next steps:
  Set VIKING_AK / VIKING_SK in the current shell, then run:
  viking auth import-env
  viking doctor

To install Viking skills for an external agent:
  npx skills add "<public-repo-url>" -y -g

To install skills from this repo during local development:
  viking skill install all

Then run:
  viking --help

EOF
