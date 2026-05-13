---
name: vs-search-tuning
description: "Use when a user asks an agent to evaluate or tune text search similarity for an existing Viking AI Search application and dataset."
category: search
applies_to: codex, agents, external-agent
requires_cli: ">=0.1.0"
keywords: search tuning, search evaluation, llm judge, ndcg, query generation, similarity tuning
commands: search tune llm-check, search tune query-generate, search tune plan, search tune run, search tune report, search tune apply, app status, doctor
---

# Viking Search Tuning

## When to Use

Use this skill when the user wants an external agent to evaluate and tune text search similarity for an existing AI Search application and dataset.

This first version is for text-query similarity only. It fixes `mode=UserDefined` and tunes the user-defined recall strategy, recall weights, keyword match ratio, and max retrieved count. It does not tune rerank, personalization, hotness, boost/bury, sort rules, serving controls, or business operating rules.

## Preconditions

- an `application-id` is available
- a `dataset-id` is preferred; if omitted, the CLI can try to infer a unique search dataset from the application
- Viking auth is configured with `vs auth status`
- LLM config is available to the CLI through `VIKING_LLM_BASE_URL`, `VIKING_LLM_API_KEY` or `VIKING_LLM_AK/SK`, and `VIKING_LLM_MODEL`
- the user understands that LLM relevance labels are silver labels and should be reviewed before high-risk production changes

## Commands

- `search tune llm-check`: verify CLI-managed LLM configuration
- `search tune query-generate`: generate a reusable synthetic query set from dataset samples when the user has no query set
- `search tune plan`: show query source, candidate strategies, estimated requests/labels, and parameter coverage before running
- `search tune run`: generate or load queries, run candidate search strategies, label top results, compute metrics, and write artifacts; use `--resume-run-id <run-id>` to continue an interrupted run
- `search tune report`: read a previous tuning report
- `search tune apply`: create a new candidate search scene from a completed tuning report recommendation
- `app status` / `doctor`: verify app and local environment readiness

## Workflow

1. Ask the user whether they have a tuning query set. Good sources include online search logs, customer support query collections, or a manually curated representative set. If the user has one, use it with `--queries <file>`. If not, say the CLI will generate synthetic queries from dataset samples and that those queries should be reviewed.
2. Check the local environment:
   - `vs auth status --json`
   - `vs doctor --json`
   - `vs search tune llm-check --json`
3. Check that the application is ready:
   - `vs app status --application-id <id> --json`
4. Confirm the tuning boundary with the user:
   - text query only
   - similarity-only profile
   - fixed `mode=UserDefined`
   - tunes only `user_defined_recall_mode`, `dense_weight`, `text_weight`, `query_keyword_match_percent`, and `max_retrieved_num`
   - no rerank, personalization, hotness, boost/bury, sort rules, serving controls, or business operating rules
5. If the user has no query set, generate one first:
   - `vs search tune query-generate --application-id <id> --dataset-id <dataset> --query-count 100 --json`
   Show the returned `sampleQueries` and `typeCounts` to the user. Use the returned `queryFile` only after the user accepts the query set for first-pass tuning.
6. Run a plan before any expensive evaluation:
   - with user queries: `vs search tune plan --application-id <id> --dataset-id <dataset> --queries <file> --profile similarity-only --json`
   - with generated queries: use the `queryFile` returned by `query-generate`
   Summarize the estimated search requests, max pointwise LLM judgements, and parameter coverage.
7. Run tuning only after the plan is acceptable:
   - with user queries: `vs search tune run --application-id <id> --dataset-id <dataset> --queries <file> --profile similarity-only --search-concurrency 18`
   - with generated queries: use the `queryFile` returned by `query-generate`
   Use the command form above for first-pass tuning unless the user explicitly asks for a different evaluation scope. Search requests default to 18-way concurrency.
8. While a run is active, use the artifact paths from progress output if troubleshooting is needed:
   - `run-state.json`: current status, completed searches, labels, and resume metadata
   - `partial-metrics.json`: partial metrics from completed query/strategy pairs
   - `rankings.jsonl` and `labels-used.jsonl`: completed rankings and labels used by the run
   If the process is interrupted, resume with `vs search tune run --application-id <id> --resume-run-id <run-id>`.
9. Read and summarize the generated report:
   - `vs search tune report --run-id <run-id> --json`
10. Explain the recommended strategy, metric deltas, parameter coverage, and risk notes. Treat the output as a recommendation.
11. If the user asks to materialize the recommendation as a candidate scene, inspect first:
   - `vs search tune apply --application-id <id> --run-id <run-id> --dry-run --json`
   Explain `unappliedRequestParams`; request-only params such as `query_keyword_match_percent` are not persisted in scene config.
12. If the user accepts the dry-run payload, create a new candidate scene:
   - `vs search tune apply --application-id <id> --run-id <run-id> --confirm-create-scene --json`

## Customer Environment Principle

- In customer environments, assume repository source code is unavailable.
- Execute tasks using only the installed skills, the packaged `vs` CLI surface (`--help`, command output, and observed runtime behavior), and explicit user-provided information.
- Do not rely on reading local repository source files, generated repo snapshots, or implementation details to decide runtime actions.
- If the installed CLI behavior conflicts with a skill, trust the installed CLI behavior first.
- If the skills and the packaged CLI still do not provide enough information to proceed safely, stop and ask the user instead of searching source code.

## Constraints

- Do not run tuning before asking the user whether they have a query set.
- Do not run tuning before `search tune plan` has been shown and summarized.
- Do not let `search tune run` auto-generate queries during agent-led tuning. If the user has no query set, run `search tune query-generate`, show query samples, and then pass the generated `queryFile` to `plan` and `run`.
- Do not run tuning until `search tune llm-check` succeeds or the user provides a query/label path supported by a future workflow.
- Do not present the recommendation as an online change. `search tune apply` creates a new candidate scene only; it does not switch the default entrance.
- If a tuning process is interrupted, prefer `--resume-run-id` over starting a duplicate run with the same query set and strategy space.
- Do not tune or attribute changes to rerank, personalization, hotness, boost/bury, sort rules, serving controls, or business rules in this first-version workflow.
- Do not create, update, publish, or switch search scenes as a fallback for failed automatic tuning. Only use `search tune apply` after a completed report and explicit user approval.
- Do not call a result "optimal" or "best" unless a completed `search tune run` report exists. Without a report, call it manual candidate validation or a tool failure diagnosis.
- Do not delete or prune `.viking/search-tuning` artifacts unless the user explicitly asks.
- If `search tune run` generates queries automatically, tell the user the query set is synthetic and should be reviewed for high-risk usage.
