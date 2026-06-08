---
name: vs-onboarding-purchase
title: vs-onboarding-purchase
description: "Guide a brand-new Volcengine user from sign-up and purchase of Viking AI Search to a working authenticated CLI, with explicit human checkpoints for registration, real-name verification, payment, and access key creation. Use whenever a user asks how to start using vs, sign up, buy, or onboard."
category: workflow
applies_to: codex, agents, external-agent
requires_cli: ">=0.2.0"
keywords: onboarding, sign up, signup, register, purchase, buy, real-name, real name, access key, AK SK, first run, get started, viking ai search
commands: auth status, auth login, auth import-env, doctor, skill list, skill show, purchase link, purchase order status, purchase order wait
---

# vs-onboarding-purchase

# AI Search New User Purchase Onboarding

## When to Use

Use this skill when the agent detects that a new user needs to complete AI Search purchase / order placement before continuing with later onboarding steps. The agent must guide the user to the console purchase page, wait for explicit purchase completion, verify that the order is visible, and then guide AK/SK creation.

Typical trigger phrases include:

- the user asks to place an order, purchase, activate, or open AI Search
- the user is in a new-user registration conversion flow
- the user says they have completed the purchase and needs the agent to verify it
- the user needs to create AK/SK after purchase

## Preconditions

- The user is in the new-user registration conversion flow.
- Workflow step 1 and step 2 are intentionally skipped for now; start from step 3.
- The agent can ask the user which supported environment they are in and wait for explicit user confirmation.
- The user completes the actual purchase on the console web page; the agent does not create an order programmatically.
- `vs` CLI is installed. Purchase link retrieval does not require local AK/SK authentication, but order visibility checks require a configured local AK/SK.

## Commands

- `purchase link`: print the onboarding purchase page link for the user's selected environment.
- `purchase order status`: check once whether the onboarding purchase order is visible.
- `purchase order wait`: wait until the onboarding purchase order is visible; when it is not found, retry every 2 seconds, up to 5 attempts.
- `auth status`: inspect local auth before order visibility checks or when the workflow reaches AK/SK configuration readiness checks.
- `doctor`: inspect local CLI environment if command execution fails before reaching the service.

## Workflow

### Step 1: Detect current authentication state
 
Run `vs auth status --json` and inspect the result:
 
- **Authenticated** (status `ok` and a doctor check `vs doctor --json` passes)
  → Go directly to Step 6 (early exit; do not force a returning user through
  registration again).
- **Not authenticated / invalid / product-not-enabled / network-error** → Go to
  Step 2.
 
> If the CLI version exposes structured failure reasons (`unconfigured`,
> `invalid`, `product-not-enabled`, `network-error`), use them to skip steps
> where possible (e.g., `product-not-enabled` → skip account registration and
> jump to Step 3 with the purchase-page deeplink). If the CLI only reports
> "authenticated / not authenticated", proceed to Step 2's question.
 
### Step 2: Ask the user which state they are in (Stage A confirmation)
 
Present this exact table to the user and ask them to pick one option. Do not show
the internal next-step routing to the user.
 
| Option | Your state                                          |
|--------|-----------------------------------------------------|
| A      | I don't have a Volcengine account yet               |
| B      | I have an account but haven't purchased Viking AI Search |
| C      | I've already purchased; I need to get my AK/SK       |
| D      | I already have AK/SK, just need to configure the CLI |

Internal routing after the user answers:

- A or B -> Step 3
- C -> Step 5
- D -> Step 6
 
**Confirmation contract**: the user must reply with the option letter or its
plain equivalent ("A", "option A", "I don't have an account"). Free-text replies
that don't clearly map to an option require re-asking. If the user is unsure
("I'm not sure if I bought it"), conservatively pick the earlier option (treat
"not sure if bought" as B, not C).

### Step 3 and Step 4 - deliver purchase deep link and wait for purchase

1. Ask the user to choose exactly one supported environment:
   - `volcano-cn-beijing`
   - `volcano-ap-southeast-1`
   - `byteplus-ap-southeast-1`
2. After the user chooses an environment, run `vs purchase link --environment-id <environment-id>` and show the returned purchase page link.
3. Do not hardcode or rewrite the purchase page link in the agent response; use the command output as the source of truth.
4. Show this instruction together with the URL:
   `On the order page, complete: choose edition -> real-name verification (opened in-page; skipped if already verified) -> payment. After finishing, reply that the purchase is complete.`
5. Wait for the user to clearly say that the purchase is complete, using wording such as `purchase completed`, `payment completed`, `order placed`, or `activation completed`.
6. Do not treat vague replies such as `ok`, `opened`, `I will check`, or `I am on the page` as purchase completion.

### Order verification

6. After the user explicitly confirms purchase completion, ensure local AK/SK is configured before checking order visibility. If auth is missing, guide the user through `vs auth import-env` or `vs auth login`, then continue.
7. Run:
   `vs purchase order wait --max-attempts 5 --poll-interval-ms 2000`
8. Interpret the command result as the source of truth for whether the order is visible:
   - success: the order is visible; continue to step 5
   - not found during polling: the CLI retries every 2 seconds, up to 5 attempts
   - timeout after 5 attempts: report order creation failure and return to the purchase deep-link step
   - any non-retryable error: surface the exact error and return to the purchase deep-link step if the user still wants to continue
   - failed order / failed instance state: tell the user the order appears failed, then return to the purchase deep-link step

### Step 5 - guide AK/SK creation

8. After order verification succeeds, guide the user to create AK/SK at:
   `https://console.volcengine.com/iam/keymanage`
9. Tell the user not to paste AK/SK into chat.
10. Prefer one of these local credential flows:
   - user sets `VIKING_AK` and `VIKING_SK` in their real terminal, then runs `vs auth import-env`
   - user runs `vs auth login` in an interactive terminal
11. After credentials are imported, the agent may run `vs auth status` and `vs doctor` to confirm local readiness.

### Step 6 - confirm local readiness

12. After credentials are imported, the agent may run `vs auth status` and `vs doctor` to confirm local readiness.

## Order Verification Behavior

- `purchase order wait` exists so the agent can verify order visibility instead of trusting chat text alone.
- If the order is not found, `purchase order wait` retries every 2 seconds.
- If the order is still not found after 5 attempts, report order creation failure.
- If the command returns any non-retryable error, do not keep retrying; show the error to the user.
- If the returned order indicates failure, tell the user that the order exists but failed.
- On order creation failure, failed order state, timeout, or any blocking error, show the purchase URL again and ask the user to confirm whether the page-side purchase succeeded.

## Constraints

- Start with Step 1 when the user's current CLI authentication state is unknown. If the product owner asks to skip registration-state detection in a specific run, start from Step 3 instead.
- Do not create an order programmatically; the user must purchase through the console page.
- Do not proceed to AK/SK creation until both conditions are true: the user explicitly says purchase is complete, and `vs purchase order wait --max-attempts 5 --poll-interval-ms 2000` succeeds.
- Do not run `purchase order status` or `purchase order wait` without local AK/SK authentication. If missing, ask the user to configure auth first.
- Do not accept vague replies like `ok`, `opened`, `I see it`, or `I entered the page` as purchase completion.
- Do not implement extra retry loops in the agent; the CLI command owns the polling behavior.
- Do not ask the user to paste AK/SK, SK, API keys, payment credentials, or identity documents into chat.
- If order verification times out or fails, report the failure and show the purchase URL again.
- Always obtain the purchase URL from `vs purchase link --environment-id <environment-id>`; do not hardcode the URL in the skill workflow or agent response.
- Only the following environment ids are supported for purchase link selection: `volcano-cn-beijing`, `volcano-ap-southeast-1`, and `byteplus-ap-southeast-1`.
- If the user asks a product concept, capability, API field, console UI path, or troubleshooting question outside this purchase workflow, temporarily hand off to `vs-product-qa`; after that answer, return to this workflow only if the user still wants to continue purchasing.
