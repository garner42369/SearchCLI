# Walkthrough: Content Cards JSON

This walkthrough uses a generic content-card style JSON file such as:

- `./content-cards.json`

It is a good fit for showing how content-card style item data moves through the onboarding flow.

## 1. Start With Profile

```bash
viking item profile --file ./content-cards.json --pretty
```

Typical first-pass results are close to:

- `doc_id` is inferred as the primary key
- `title` is inferred as the title field
- `title / keywords / abstract / content` become primary index fields
- category, tag, and source-style fields become filter candidates

## 2. Generate The Plan

```bash
viking item plan \
  --file ./content-cards.json \
  --goal "Build content search"
```

In the plan directory, pay special attention to:

- `schema.json`
- `field-config.json`
- `online-config.json`
- `validation.json`
- `search-scene-create.json`
- `recommend-scene-create.json`
- `report.md`

## 3. Review The Plan Carefully

- Is `doc_id` really a stable primary key?
- Does `title` represent the main card title well enough?
- Should `content` be full-text indexed, or is it too heavy?
- Should `keywords` be included in suggest and index fields?
- Are category or tag fields actually useful filters?

If any of these inferences look wrong, edit the generated JSON directly instead of forcing the first-pass output.

## 4. Run Dry-Run First

```bash
viking item apply --plan-dir ./.viking/item-plans/<plan> --dry-run
```

Typical dry-run steps include:

- `validation_gate`
- `schema_check`
- `create_dataset`
- `ingest_items`
- `create_application`
- `activate_application`
- `search_scene_bootstrap`
- `search_trial`
- `chat_trial`

## 5. Run The Real Apply

```bash
viking item apply \
  --plan-dir ./.viking/item-plans/<plan> \
  --confirm-review \
  --wait-ready \
  --run-trials
```

If you already know the behavior scene types required for recommend bootstrap and the target page / module has been confirmed, add:

```bash
--confirm-recommend-entry-binding \
--recommend-bhv-scene-types your_bhv_scene
```

## 6. Fallback Paths

- If the fresh app is not ready: `viking app diagnose --application-id <app>`
- If recall quality is poor: inspect `field-config.json` and the search scene first
- If chat does not trigger retrieval: inspect the chat section of `online-config.json` and the default search-scene binding
