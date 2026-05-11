<p align="center">
  <img src="docs/assets/searchcli-logo.svg" alt="SearchCLI logo" width="560" />
</p>

# SearchCLI

English | [中文README](README.zh_CN.md)

Connect stable, tunable search, recommendation, and conversational retrieval to your agent system or business system.

[Quick Start](#quick-start-human-users) · [AI Agent Setup](#quick-start-ai-agents) · [Full Agent Guide](docs/agent-quick-start.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

SearchCLI is the open CLI for AI Search on Volcengine.

If your agent system or business system needs stable, tunable information distribution services, SearchCLI gives you a practical path to integrate production-grade search, recommendation, and conversational retrieval into real workflows.

With SearchCLI and its installable `Viking skills`, external agents can onboard data, build and validate search and recommendation flows, run conversational retrieval, tune strategy configuration, inspect bad cases, and iterate on retrieval quality in a stable, reviewable way.

## What SearchCLI Is

- The command-line integration surface for AI Search on Volcengine.
- A stable path for external systems to access search, recommendation, and conversational retrieval capabilities.
- An agent-friendly workflow layer built around installable skills and automation-safe command output.
- A reviewable execution model with dry-runs, confirmation gates, and read-after-write verification.

## Who It Is For

- Developers integrating AI-powered information distribution into business systems.
- Teams building agent systems that need stable, configurable search, recommendation, and retrieval workflows.
- Operators and solution teams who need a reviewable way to onboard data, configure applications, and verify runtime behavior before production use.

## What It Enables

- Item and catalog search on top of structured business data.
- Recommendation flows connected to application scenes and user behavior.
- Conversational retrieval experiences grounded in application search.
- Agent workflows that can onboard data, configure applications, and validate runtime behavior with explicit review steps.

## Core Capabilities

- `viking item profile | plan | apply` for structured item onboarding.
- `viking app`, `viking dataset`, and `viking data` for application and dataset management.
- `viking search run`, `viking recommend run`, and `viking chat run` for runtime verification.
- Installable `Viking skills` so external agents can use the same workflows.

## Requirements

- Node.js 20 or newer
- `git`
- Volcengine AK/SK with access to AI Search

## Quick Start (Human Users)

### 1. Install

```bash
git clone <public-repo-url> viking_cli
cd viking_cli
bash ./scripts/install.sh
```

### 2. Authenticate

If the current shell already has `VIKING_AK` and `VIKING_SK`:

```bash
viking auth import-env
viking auth status --json
viking doctor --json
```

Otherwise, run interactive login in a real terminal:

```bash
viking auth login
```

### 3. Run the First Onboarding Flow

```bash
viking item profile --file ./items.json --pretty
viking item plan --file ./items.json --goal "Build item search"
viking item apply --plan-dir ./.viking/item-plans/<plan> --dry-run
viking item apply --plan-dir ./.viking/item-plans/<plan> --confirm-review --wait-ready --run-trials
```

## Quick Start (AI Agents)

If an external agent needs to operate AI Search through this repository:

### 1. Install SearchCLI

```bash
git clone <public-repo-url> viking_cli
cd viking_cli
bash ./scripts/install.sh
```

### 2. Install Viking skills

```bash
npx skills add "<public-repo-url>" -y -g
```

The default public skill bundle is:

- `viking-shared`
- `viking-item-onboarding`
- `viking-search`
- `viking-chat`
- `viking-recommend`

### 3. Authenticate

If the current shell already has `VIKING_AK` and `VIKING_SK`, prefer:

```bash
viking auth import-env
```

Otherwise:

```bash
viking auth login
```

### 4. Verify

```bash
viking --help
viking auth status --json
viking doctor --json
viking skill list
```

## Public Command Groups

- `viking auth`
- `viking doctor`
- `viking skill`
- `viking item`
- `viking app`
- `viking dataset`
- `viking data`
- `viking search`
- `viking chat`
- `viking recommend`

## Documentation

- [Agent Quick Start](docs/agent-quick-start.md)
- [Contributing](CONTRIBUTING.md)
- [Security](SECURITY.md)

## Maintainer Workflow

If you are maintaining the open-source repository itself, the local skill tooling is:

```bash
viking skill list
viking skill init viking-demo-skill
viking skill validate
viking skill install all
```

Build and run repository checks:

```bash
npm install
npm run validate:skills
npm run build
npm run test:acceptance:dist
```

## Contribution

Please check [Contributing](CONTRIBUTING.md) for more details.

External contributors must complete the Contributor License Agreement (CLA) before a pull request can be accepted.

## Code of Conduct

Please check [Code of Conduct](CODE_OF_CONDUCT.md) for more details.

## Security

If you discover a potential security issue in this project, or think you may have discovered a security issue, we ask that you notify Bytedance Security via our [security center](https://security.bytedance.com/src) or [vulnerability reporting email](mailto:sec@bytedance.com).

Please do **not** create a public GitHub issue.

## License

This project is licensed under the [Apache-2.0 License](LICENSE).
