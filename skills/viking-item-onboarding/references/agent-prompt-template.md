# Agent Prompt Template

Use the text below when you want an external agent to run item-data onboarding with this skill.

## Template

Help me onboard a structured item dataset into Viking for item-level search.

Please confirm the following first:

1. SearchCLI and Viking skills are installed; if not, install them first
2. The current terminal is already authenticated for Viking; if not, handle auth in this order:
   - if `VIKING_AK` / `VIKING_SK` already exist in the current shell, run `viking auth import-env`
   - otherwise, if you can keep a real terminal session open for user input, run `viking auth login`
   - otherwise, ask me to set `VIKING_AK` / `VIKING_SK` in the current shell and then run `viking auth import-env`

Then run this workflow:

1. Understand my business goal and the meaning of the dataset fields before using any generated plan
2. Run `viking item profile --file <DATA_FILE> --pretty`
3. Run `viking item plan --file <DATA_FILE> --goal "<BUSINESS_GOAL>"`
4. Review `schema.json`, `field-config.json`, `online-config.json`, and `validation.json` in the plan directory, then explicitly confirm schema, field attributes, display style, and index choices with me
5. If automatic inference looks wrong, edit the generated plan and explain your reasoning
6. Run `viking item apply --plan-dir <PLAN_DIR> --dry-run`
7. Only proceed to a real apply if there are no blocking issues and the dry-run steps make sense
8. For the real apply, use `--confirm-review --wait-ready --run-trials`
9. If recommendation bootstrap needs `BhvSceneTypes`, ask me before filling them in and confirm the target page / module before you create or update any recommend scene
10. If you bootstrap recommendation, add `--confirm-recommend-entry-binding`
11. If `search` or `chat` verification fails, fall back to `viking app diagnose --application-id <APP_ID>`

Output requirements:

- First summarize your understanding of the business goal and the dataset
- Then explain the reasoning behind your schema, field-config, and online-config choices
- Before the real apply, summarize the dry-run result
- Before the real apply, ask me to confirm the schema, field attributes, display style, and index choices
- If you find blocking issues or data-modeling problems, stop and explain them before continuing

## Filled Example

Help me onboard `./content-cards.json` into Viking for content search.

Please understand the fields and the search use case first, then follow the `viking-item-onboarding` workflow: run `item profile`, then `item plan`, review the plan, run `--dry-run`, and only then perform the real apply and smoke checks. Before the real apply, confirm the schema, field attributes, display style, and index choices with me. Only continue with recommend bootstrap if `BhvSceneTypes` are known and the target page / module has been confirmed; otherwise keep the generated template and tell me what input is needed next.
