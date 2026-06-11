---
name: vs-product-qa
description: "Answer Viking AI Search product questions, CLI usage questions, API/auth questions, configuration questions, and troubleshooting questions by grounding every claim in either the installed `vs` CLI's own output or official Volcengine documentation. Never fabricate."
category: shared
applies_to: codex, agents, external-agent
requires_cli: ">=0.2.0"
keywords: viking ai search, product question, product concept, concept, how to, usage, api, authentication, ak sk, configuration, error, troubleshooting, docs, official docs, help, faq
commands: doctor, auth status, llm status, skill list, skill search, skill show
---

# vs-product-qa

## When to Use

Use this skill when the user asks product questions about Viking AI Search and expects a grounded answer instead of agent memory.

Broad trigger intents include product concepts, capability explanations, CLI usage, API/auth semantics, configuration guidance, console UI paths, billing/quota questions, and local error troubleshooting.

Typical trigger questions include:

- Concept: "what is a scene / dataset / hybrid search / agentic search"
- Onboarding path: "which dataset type fits my use case", "how do I configure recommendation"
- API and auth: "how does AK/SK work", "what does error code X mean"
- Configuration: "where do I set boost/bury", "how do I enable rerank"
- CLI usage: "how do I use `vs item apply`", "what does `vs auth status` mean"

Do not use this skill when the user is asking to execute a specialized workflow:

- sign-up, purchase, payment, or first AK/SK setup -> delegate to `vs-user-onboarding`
- item data ingestion or dataset creation -> delegate to `vs-item-onboarding`
- search tuning suggestions or search tuning execution -> delegate to `vs-search-tuning`

If another skill is active and the user asks a product-concept question outside that skill's scripted scope, temporarily answer with `vs-product-qa`, then return to the original workflow only after the answer is complete.

## Preconditions

- The installed `vs` CLI is available when answering CLI behavior, local auth, LLM config, or local error questions.
- Official Volcengine documentation can be fetched when answering product concepts, API field semantics, purchase, billing, quota, or console UI path questions.
- The agent must classify the question before choosing a knowledge source.
- The agent must not rely on repository source code, generated repo snapshots, or training memory as the source of truth in customer environments.
- If the selected source cannot answer the question, explicitly say the point is not covered by `vs` help or the official documentation checked in this turn, then suggest support ticket / oncall escalation.

## Customer Environment Principle

Trust the user's installed `vs` CLI behavior as authoritative for how `vs` behaves on their machine. For CLI-usage questions, check `vs <cmd> --help`, `vs doctor`, `vs auth status`, `vs llm status`, or `vs skill show <name>` first before consulting documentation.

If installed CLI behavior conflicts with documentation, trust the installed CLI, state that the documentation may be stale, and suggest filing a documentation issue or support ticket.

## Question Routing

Classify the question, then pick the source. Do not default to one source for all questions.

| Question type | Primary source | Example |
|---|---|---|
| CLI command / flag / usage | `vs <cmd> --help` | "How do I use `vs item apply`" |
| Local authentication / credential | `vs auth status` / `vs doctor` | "Why does `vs auth status` say invalid" |
| Local CLI error / stack trace | The error's own recovery output | "I see `ERR_AUTH_REQUIRED`; what now" |
| Product concept (scene, hybrid, ANN, rerank, etc.) | Official docs | "What is a scene in Viking AI Search" |
| API field semantics, request/response shape | Official docs / OpenAPI docs | "What does `recall_mode` accept" |
| Purchase / billing / pricing / quota | Official docs | "How do I upgrade my plan" |
| Console UI path / where to click | Official docs | "Where do I configure boost/bury" |

Do not default to `vs --help` for product-concept questions; CLI help does not define product concepts. Do not default to docs for "what does this flag do"; the installed CLI is authoritative for command behavior.

## Knowledge Source

### CLI source

Allowed CLI source commands include:

- `vs --help`
- `vs <cmd> --help`
- `vs doctor`
- `vs auth status`
- `vs llm status`
- `vs skill list`
- `vs skill search <query>`
- `vs skill show <name>`

Before recommending a command or flag, validate that it exists through `vs skill list`, `vs <domain> --help`, or `vs <cmd> --help`.

### Documentation source

Root URL: `https://www.volcengine.com/docs/85296/1544972?lang=en`

Source acquisition protocol:

1. Primary path: fetch the root URL, parse the sidebar `<a href>` list, identify the target sub-page, fetch that sub-page, and extract the relevant body text.
2. Fallback path: if sub-page extraction fails because of selector changes, network errors, or timeout, return the root URL and tell the user to browse manually. Do not guess sub-page URLs.

Fetch budget:

- Up to 3 fetches per answer.
- Up to 5 seconds per fetch.
- Total budget is 15 seconds or less.
- On timeout or overrun, degrade honestly and cite the root URL.

Not used in MVP:

- `https://www.volcengine.com/llms.txt`
- `https://www.volcengine.com/sitemap.xml`
- undocumented per-page markdown endpoints

These may be used later only if they become publicly available and are actually fetched during the turn.

## Commands

- `doctor`: inspect local CLI environment and service readiness for local troubleshooting.
- `auth status`: inspect local Viking AK/SK auth state.
- `llm status`: inspect local LLM auth state when the question involves LLM-backed features.
- `skill list`: list installed skills before recommending a handoff.
- `skill search`: find a relevant installed skill before recommending a handoff.
- `skill show`: inspect another skill's documented workflow before delegating.
- `vs <cmd> --help`: inspect command-specific usage and flags. This is a source rule, not a frontmatter command entry.

## Workflow

1. Classify the question using **Question Routing** before choosing a source.
2. Fetch from the chosen source:
   - CLI route: run the relevant `vs ... --help`, status, doctor, or skill command.
   - Local CLI error route: use the error's own recovery output from this turn first; only run help/status commands if the recovery output is missing or ambiguous.
   - Docs route: follow the documentation source acquisition protocol.
3. Extract only the relevant section or output lines needed to answer.
4. Answer in the required output format.
5. If write operations such as `apply`, `update`, `create`, or `bind` are mentioned, explain only the safe dry-run or draft path unless the user explicitly asks to run a specialized workflow. This skill must not execute write commands.
6. If credentials, environment variables, or `vs auth import-env` are involved, append the AK/SK security notice from [references/aksk-notice.md](references/aksk-notice.md).
7. If no source can answer, say `unknown` and explicitly state that the checked `vs` help or official documentation does not cover this point; cite the root documentation URL or the CLI command checked, and suggest support ticket / oncall escalation.

## Output Format

Use this structure and omit fields that have no grounded content:

```text
**Conclusion**: <one-line direct answer>
**Source**: <doc URL + section heading> OR <CLI command + relevant output>
**Steps**: <ordered steps, only if actionable>
**CLI entry**: <`vs ...` command, or "see `vs <x> --help`">
```

Rules:

- For CLI-usage questions, `Source` cites the command whose output was used.
- For doc-grounded answers, `Source` must be a real URL retrieved during this turn.
- Do not fill missing fields with speculation.
- Do not paste large documentation blocks; summarize in your own words and link the source.

## Constraints

1. **Grounded**: every factual claim must cite either CLI output from this turn or an official documentation URL retrieved in this turn. Do not answer product-specific questions from training memory.
2. **No fabricated URLs**: sub-page URLs must come from sidebar parsing or another routing source actually fetched during this turn. Do not guess URL paths.
3. **No CLI hallucination**: do not recommend commands or flags that do not exist. Validate via `vs skill list`, `vs <domain> --help`, or `vs <cmd> --help` first.
4. **CLI overrides docs**: if CLI help and docs disagree, trust the installed CLI and say the docs may be stale.
5. **No silent execution**: do not run write commands such as `apply`, `update`, `create`, or `bind` on the user's behalf. Emit explanations, drafts, or dry-run guidance only.
6. **AK/SK notice**: whenever credentials, environment variables, or `vs auth import-env` are involved, append the AK/SK security notice from [references/aksk-notice.md](references/aksk-notice.md).
7. **Honest unknowns**: if all available sources cannot answer, return `unknown`, explicitly say the checked `vs` help or official documentation does not cover the point, and include the root documentation URL or a support-ticket / oncall suggestion. Do not fabricate.
8. **Honest fallback**: if exact sub-page lookup fails and the answer falls back to the chapter root, explicitly say: "exact sub-page lookup failed; here is the chapter root."
9. **No large doc dumps**: summarize in your own words and link the source instead of pasting long documentation sections.
10. **Delegation**: if the user asks for sign-up / purchase, item onboarding, or search tuning execution, hand off using [references/delegation.md](references/delegation.md) instead of answering inside this skill.

## Delegation

Use [references/delegation.md](references/delegation.md). When delegating, briefly say which skill takes over and why, then stop.

## Examples

### CLI usage question

User: "What does the `--scene-id` flag of `vs search run` do?"

1. Classify as CLI usage.
2. Run `vs search run --help`.
3. Answer using only that command output.

Expected shape:

```text
**Conclusion**: Per `vs search run --help`, `--scene-id` selects the configured search scene used for the request.
**Source**: `vs search run --help` output from this turn.
**CLI entry**: `vs search run --scene-id <id> ...`
```

### Product concept question

User: "What is a scene in Viking AI Search?"

1. Classify as product concept.
2. Fetch the documentation root, parse sidebar links, fetch the relevant sub-page if found.
3. Answer using only retrieved documentation.

### Delegation question

User: "How do I buy Viking AI Search and create my first AK/SK?"

Answer: "This is covered by `vs-user-onboarding` because it is a sign-up, purchase, and first AK/SK workflow. Handing off."

## References

- AK/SK security notice: [references/aksk-notice.md](references/aksk-notice.md)
- Delegation matrix: [references/delegation.md](references/delegation.md)
