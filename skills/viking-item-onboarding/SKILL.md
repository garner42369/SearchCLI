---
name: viking-item-onboarding
description: "General item-level search onboarding: understand structured item data, generate schema and config plans, create datasets and apps, and run the first verification pass."
category: workflow
applies_to: codex, agents, external-agent
requires_cli: ">=0.1.0"
keywords: item search onboarding, structured data onboarding, schema design, field config, online config, validation, recommend bootstrap, item profile, item plan, item apply
commands: item profile, item plan, item apply, dataset schema check, app diagnose, search run, chat run, recommend scene create
---

# Viking Item Onboarding

## When to Use

Use this skill when a user provides structured item data and expects the agent to understand the data, design the schema, generate field and runtime config, and connect the data to Viking for item-level search. The main idea is to understand the business goal first, then use `item profile / plan / apply` to standardize the high-risk execution steps.

## Preconditions

- `viking` CLI and Viking skills are installed
- authentication is complete, and at least `viking auth status` and `viking doctor` succeed
- the input file is preferably `JSON array`, `JSONL`, or `CSV`
- if the user provides a binary spreadsheet format, convert it to `CSV` or `JSON` first
- before a real apply, the user should provide a business goal such as "Build catalog search" or "Build content search"

## Commands

- `item profile`: first-pass profiling for field shape, primary-key candidates, title candidates, cleanup, and validation risk
- `item plan`: generate a reviewable plan that contains `schema.json`, `field-config.json`, `online-config.json`, `validation.json`, and search/recommend templates
- `item apply`: stable executor for `validation gate -> schema check -> create dataset -> ingest -> create app -> activate -> optional smoke checks`
- `search run` / `chat run`: verify the new app with minimal runtime requests
- `recommend scene create`: continue recommend bootstrap only after the user confirms the target page / module and the required `BhvSceneTypes`
- `app diagnose`: inspect readiness, scene, or runtime-config problems

## Workflow

1. Clarify the business goal and desired search experience: what users will search for, which fields matter most for recall, and what should appear in the results
2. Skim a few rows of the raw file, then run `item profile --file <data>` for first-pass profiling
3. Run `item plan --file <data> --goal "<business goal>"` to generate the plan directory
4. Review `schema.json`, `field-config.json`, `online-config.json`, and `validation.json` with [references/review-checklist.md](references/review-checklist.md), and confirm field attributes and display expectations with the user
5. If automatic inference is wrong, edit the generated JSON directly; only fall back to lower-level `dataset/app/search` commands when the item workflow is clearly not a good fit
6. Run `item apply --plan-dir <dir> --dry-run` first and confirm the steps and resource names
7. If there are no blocking issues, run `item apply --plan-dir <dir> --confirm-review --wait-ready --run-trials`
8. `item apply --run-trials` bootstraps a default search scene and binds it into `ChatConfig.SearchSceneID`
9. If the required behavior scene types are already known and the target page / module has been confirmed, add `--confirm-recommend-entry-binding --recommend-bhv-scene-types <scene_a,scene_b>` for recommend bootstrap; otherwise keep the generated recommend template and wait for user input
10. If `search` or `chat` verification fails, use `app diagnose --application-id <app>` to inspect readiness, scene, and runtime config

## References

- JSON walkthrough:
  [references/walkthrough-card-full.md](references/walkthrough-card-full.md)
- generic CSV walkthrough:
  [references/walkthrough-csv.md](references/walkthrough-csv.md)
- artifact review checklist:
  [references/review-checklist.md](references/review-checklist.md)
- prompt template for external agents:
  [references/agent-prompt-template.md](references/agent-prompt-template.md)

## Constraints

- Always run `item plan` before `item apply`; do not skip plan generation and create resources blindly
- `item profile / plan / apply` are stable execution primitives for the skill, not a substitute for human or agent judgment
- Generated schema and field config are first-pass proposals; allow review and manual edits for complex data
- Do not run a real `item apply` until the user confirms schema, field attributes, display style, and index choices
- Do not bypass blocking validation issues unless this is an explicit controlled test with `--force`
- `item apply --run-trials` bootstraps a default search scene and then runs `search/chat` smoke checks
- `item apply` generates recommend templates; it only bootstraps recommend scenes automatically when `--recommend-bhv-scene-types` is provided and `--confirm-recommend-entry-binding` is explicitly acknowledged
- If the dataset obviously requires custom modeling, table splitting, or semantic cleanup, do not force the item workflow; explain why and switch to lower-level commands
