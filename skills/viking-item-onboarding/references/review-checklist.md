# Review Checklist

Before running `item apply`, review at least these six categories of artifacts.

## 1. schema.json

- Is `PrimaryKey` a stable identifier rather than a display field or temporary ID?
- Are field names normalized into maintainable long-term names?
- Do field types match the raw data, especially for numeric, boolean, and multi-value fields?
- Are obvious large noise fields excluded from the stored schema?

## 2. field-config.json

- Does `TitleField` match the title the user really wants to show?
- Do `IndexFields` cover the main recall signal instead of indexing only a summary field?
- Do `FilterFields` contain only structured fields that make sense as filters?
- Are `SuggestFields` appropriate for autocomplete or suggestions?
- Are image fields truly safe to use for display?
- Have the field attributes and display-facing fields been confirmed with the user?

## 3. online-config.json

- Do default search parameters align with the business goal?
- Does the chat config already include `SearchSceneID`?
- Have fields that should not be used online been excluded?
- Has the intended result-card or display style already been clarified with the user?

## 4. validation.json

- Are there any blocking issues?
- Are there duplicate primary keys, missing primary keys, missing titles, or mixed types?
- Did cleanup rename fields or normalize values more aggressively than expected?

## 5. search-scene*.json

- Are the scene name and description understandable to the next maintainer?
- Is the scene type appropriate for the current item-search scenario?
- If this is a new app, is the default search scene good enough for the first smoke check?

## 6. recommend-scene*.json

- Does the user actually need recommendation?
- Are `BhvSceneTypes` already known?
- Has the target page / module been confirmed with the user?
- If behavior scene types are not known, do not force a recommend scene into production
- If the page / module is not confirmed yet, do not create or update the recommend scene

## When Not To Continue With Apply

- The business goal is too vague to choose title, index, and filter tradeoffs
- The primary-key strategy is obviously unstable
- The raw data needs splitting, flattening, or aggregation before it can represent an item cleanly
- Validation still has blocking issues that the user has not accepted
- The page / module for recommendation is still unknown

## When It Is Safe To Continue

- The schema and field config only need small edits
- Validation has warnings but no blocking issues
- `item apply --dry-run` shows the expected steps and resource names
- The user has explicitly confirmed schema, field attributes, display style, and any recommend entry binding
