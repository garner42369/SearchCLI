# Viking Agent Quick Start

Use this flow when an external agent needs to install the CLI, install Viking skills, and complete authentication without asking the user to paste AK/SK into chat.

All commands below must run in a real machine terminal, not in a sandbox.

## 1. Install

```bash
git clone <public-repo-url> viking_cli
cd viking_cli
bash ./scripts/install.sh
npx skills add "<public-repo-url>" -y -g
```

## 2. Authenticate

Use this priority order:

1. If the current shell already has `VIKING_AK` and `VIKING_SK`, run:

```bash
viking auth import-env
```

2. Otherwise, if the agent can open a real system terminal and keep the interactive prompt alive, run:

```bash
viking auth login
```

3. Only if interactive login is not possible, ask the user to set environment variables in the current shell and then run:

```bash
viking auth import-env
```

macOS / Linux:

```bash
export VIKING_AK=...
export VIKING_SK=...
```

Windows PowerShell:

```powershell
$env:VIKING_AK="..."
$env:VIKING_SK="..."
```

## 3. Verify

```bash
viking --help
viking auth status --json
viking doctor --json
viking skill list
viking skill show --name viking-item-onboarding
```

## 4. Run The First Onboarding Flow

To onboard structured item data:

```bash
viking item profile --file ./items.json --pretty
viking item plan --file ./items.json --goal "Build item search"
viking item apply --plan-dir ./.viking/item-plans/<plan> --dry-run
```
