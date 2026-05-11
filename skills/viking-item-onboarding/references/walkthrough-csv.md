# Walkthrough: Generic CSV Catalog

This walkthrough is intended for flat CSV datasets such as catalogs, content tables, asset tables, or SKU-style exports.

Assume the user provides:

- `./catalog.csv`

Typical columns include:

- `item_id`
- `title`
- `category`
- `brand`
- `price`
- `tags`
- `description`
- `image_url`

## 1. Run Profile

```bash
viking item profile --file ./catalog.csv --pretty
```

Confirm these first:

- Is `item_id` stable and unique?
- Is `title` really the display title users should search and see?
- Is `tags` already a multi-value field, or is it just a comma-joined string?
- Should `price` be used as a filter instead of an index field?

## 2. Run Plan

```bash
viking item plan --file ./catalog.csv --goal "Build catalog search"
```

Pay special attention to:

- `price`, `brand`, and `category` are usually filter or display fields
- `description` is often a full-text index field
- `image_url` must remain a displayable URL
- If `tags` is a comma-separated string, split or fix its strategy before apply

## 3. Common Edits

- Move wrongly inferred numeric fields out of `IndexFields`
- Add structured fields that make sense to `FilterFields`
- Remove very long or noisy fields from full-text indexing
- If CSV headers are messy, rename fields in the plan output to stable, maintainable names

## 4. Apply Strategy

Start with:

```bash
viking item apply --plan-dir ./.viking/item-plans/<plan> --dry-run
```

If there are no blocking issues, continue with:

```bash
viking item apply --plan-dir ./.viking/item-plans/<plan> --confirm-review --wait-ready --run-trials
```

## 5. When This Workflow Is Not A Good Fit

- One CSV mixes several different entities and needs table splitting first
- Key fields are nested JSON strings and require preprocessing
- There is no stable primary key
- The same column mixes incompatible value types such as price, prose, and booleans
