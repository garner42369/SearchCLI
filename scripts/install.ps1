# Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
# SPDX-License-Identifier: Apache-2.0

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

function Write-InstallLog {
  param([string]$Message)
  Write-Host "[viking-install] $Message"
}

function Assert-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Command not found: $Name"
  }
}

Assert-Command node
Assert-Command npm

$nodeMajor = [int](node -p "Number(process.versions.node.split('.')[0])")
if ($nodeMajor -lt 20) {
  throw "Node.js 20 or newer is required. Current version: $(node -v)"
}

Write-InstallLog "repo: $repoRoot"
Write-InstallLog "node: $(node -v)"
Write-InstallLog "npm: $(npm -v)"

Push-Location $repoRoot
try {
  Write-InstallLog "installing dependencies"
  npm install --no-fund --no-audit

  Write-InstallLog "validating skills"
  npm run validate:skills

  Write-InstallLog "building dist"
  npm run build

  Write-InstallLog "installing vs globally"
  npm install --global --no-fund --no-audit .
}
finally {
  Pop-Location
}

$npmPrefix = (npm config get prefix).Trim()

Write-InstallLog "install complete"
Write-InstallLog "command: vs"
Write-InstallLog "npm prefix: $npmPrefix"

if (Get-Command vs -ErrorAction SilentlyContinue) {
  Write-InstallLog "found in PATH: $((Get-Command vs).Source)"
}
else {
  Write-InstallLog "vs is not yet on PATH. Ensure PATH includes your npm global bin directory."
}

Write-Host ""
Write-Host "Recommended next steps:"
Write-Host "  Set VIKING_AK / VIKING_SK in the current shell, then run:"
Write-Host "  vs auth import-env"
Write-Host "  vs doctor"
Write-Host ""
Write-Host "To install Viking skills for an external agent:"
Write-Host '  npx skills add "<public-repo-url>" -y -g'
Write-Host ""
Write-Host "To install skills from this repo during local development:"
Write-Host "  vs skill install all"
Write-Host ""
Write-Host "Then run:"
Write-Host "  vs --help"
