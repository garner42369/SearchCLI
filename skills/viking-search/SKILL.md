---
name: viking-search
description: "Search runtime and scene management: run queries, inspect scenes, debug app readiness, and diagnose recall or config issues."
category: search
applies_to: codex, agents, external-agent
requires_cli: ">=0.1.0"
keywords: search debug, search run, query run, search scene, search diagnosis, recall issue
commands: search run, search scene create, search scene list, search scene get, search scene update, app status, app diagnose
---

# Viking Search

## When to Use

Use this skill for search query verification, scene management, online result checks, recall issues, and runtime configuration debugging.

## Preconditions

- an `application-id` is available
- if you will edit a scene, you should preferably know the `scene-id`
- for fresh apps, be prepared for the runtime not to be ready yet

## Commands

- `search run`: send a production-style search request
- `search scene create` / `search scene list` / `search scene get`: manage search scenes
- `search scene update`: update scene configuration
- `app status` / `app diagnose`: inspect readiness before blaming the query

## Workflow

1. Start with `search run`
2. If the first request succeeds, iterate on the query or scene as needed
3. When changing a scene, inspect it first with `search scene list/get`, then use `search scene update`
4. If a fresh app fails, check `app status` and then `app diagnose`
5. Only after readiness is clear should you focus on recall quality or scene configuration

## Constraints

- When an app is bound to exactly one dataset, the CLI can infer `dataset-id`
- For fresh apps, treat readiness as the first hypothesis before blaming the query
- Prefer public `viking search ...` commands over bypassing the CLI and calling lower-level APIs directly
