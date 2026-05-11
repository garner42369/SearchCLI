# Copyright (c) 2026 ByteDance Ltd. and/or its affiliates
# SPDX-License-Identifier: Apache-2.0

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$skillsRoot = Join-Path $repoRoot "skills"

function Write-SkillLog {
  param([string]$Message)
  Write-Host "[viking-skills] $Message"
}

function Fail {
  param([string]$Message)
  throw "[viking-skills] $Message"
}

function Get-DefaultTargets {
  param([string]$Mode, [string]$ExplicitDest)

  if ($ExplicitDest) {
    return @($ExplicitDest)
  }

  $codexHome = if ($env:CODEX_HOME) { $env:CODEX_HOME } else { Join-Path $HOME ".codex" }
  $agentsHome = if ($env:AGENTS_HOME) { $env:AGENTS_HOME } else { Join-Path $HOME ".agents" }
  $codexDest = Join-Path $codexHome "skills"
  $agentsDest = Join-Path $agentsHome "skills"

  switch ($Mode) {
    "auto" {
      $targets = @()
      if ($env:CODEX_HOME -or (Test-Path $codexHome)) { $targets += $codexDest }
      if ($env:AGENTS_HOME -or (Test-Path $agentsHome)) { $targets += $agentsDest }
      if ($targets.Count -eq 0) { $targets = @($codexDest) }
      return $targets
    }
    "codex" { return @($codexDest) }
    "agents" { return @($agentsDest) }
    "both" { return @($codexDest, $agentsDest) }
    default { Fail "unsupported --target: $Mode" }
  }
}

function Get-InstallSkillNames {
  param([string[]]$Requested)

  $allSkills = Get-ChildItem -Path $skillsRoot -Directory | Sort-Object Name | Select-Object -ExpandProperty Name
  if ($Requested.Count -eq 0 -or ($Requested.Count -eq 1 -and $Requested[0] -eq "all")) {
    return $allSkills
  }
  return $Requested
}

$targetMode = "auto"
$force = $false
$dest = $null
$listOnly = $false
$requested = New-Object System.Collections.Generic.List[string]

for ($i = 0; $i -lt $args.Length; $i++) {
  switch ($args[$i]) {
    "list" { $listOnly = $true }
    "--force" { $force = $true }
    "--target" {
      $i++
      if ($i -ge $args.Length) { Fail "--target requires a value" }
      $targetMode = $args[$i]
    }
    "--dest" {
      $i++
      if ($i -ge $args.Length) { Fail "--dest requires a value" }
      $dest = $args[$i]
    }
    "--help" {
      Write-Host "USAGE"
      Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\install-skills.ps1 list"
      Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\install-skills.ps1 all [--target auto|codex|agents|both] [--dest <dir>] [--force]"
      Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\install-skills.ps1 <skill-name> [<skill-name> ...] [--target auto|codex|agents|both] [--dest <dir>] [--force]"
      exit 0
    }
    default { $requested.Add($args[$i]) }
  }
}

if (-not (Test-Path $skillsRoot)) {
  Fail "skills directory not found: $skillsRoot"
}

node (Join-Path $scriptDir "validate-skills.mjs") $skillsRoot | Out-Null

if ($listOnly) {
  Get-ChildItem -Path $skillsRoot -Directory | Sort-Object Name | Select-Object -ExpandProperty Name
  exit 0
}

$targets = Get-DefaultTargets -Mode $targetMode -ExplicitDest $dest
$selectedSkills = Get-InstallSkillNames -Requested $requested.ToArray()

foreach ($targetRoot in $targets) {
  if (-not (Test-Path $targetRoot)) {
    New-Item -ItemType Directory -Force -Path $targetRoot | Out-Null
  }
  foreach ($skillName in $selectedSkills) {
    $sourceDir = Join-Path $skillsRoot $skillName
    if (-not (Test-Path $sourceDir)) {
      Fail "unknown skill: $skillName"
    }
    $targetDir = Join-Path $targetRoot $skillName
    if (Test-Path $targetDir) {
      if (-not $force) {
        Fail "destination exists: $targetDir (use --force to overwrite)"
      }
      Remove-Item -Recurse -Force $targetDir
    }
    Copy-Item -Recurse -Force $sourceDir $targetDir
    Write-SkillLog "installed $skillName -> $targetDir"
  }
}

Write-SkillLog "done"
Write-SkillLog "restart your agent client to pick up new skills"
