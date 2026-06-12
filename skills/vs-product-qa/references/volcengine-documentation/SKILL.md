---
name: volcengine-documentation
description: "Volcengine official documentation lookup helper. Supports both document search and full-content fetch across Volcengine products, developer tools, support content, best practices, pricing, deployment, troubleshooting, API, SDK, and policy pages."
---

# volcengine-documentation

## Overview
This helper provides two core capabilities for Volcengine official documentation:

- `search`: retrieve relevant official documentation pages
- `fetch`: retrieve the full content of a known documentation page

Use official documentation as the authoritative source for Volcengine product questions.

When this helper is used by `vs-product-qa` for Viking AI Search:

- `search` must use `ServiceCodes="Universal AI Search"`
- `fetch` must use URLs under `https://www.volcengine.com/docs/85296`
- Do not use any other search source or documentation subtree

## Decision Logic
### Trigger rules
1. If the page URL is already known, call `fetch` directly without searching first.

### How to combine `search` and `fetch`
1. For Viking AI Search question-style requests, start with `search` and always pass `ServiceCodes="Universal AI Search"`.
2. Reject or ignore results that do not belong to `Universal AI Search` or whose URL is outside `https://www.volcengine.com/docs/85296`.
3. When full page content is needed, use `search` to identify the page first, then call `fetch`.

## Capabilities
### 1. Document search (`search`)
Search Volcengine official documentation by user question, with optional product filtering.
- Endpoint: `https://docs-api.cn-beijing.volces.com/api/v1/doc/search`

#### Request parameters
| Name | Type | Required | Description |
|------|------|----------|-------------|
| Query | string | Yes | User question or search query |
| Limit | number | No | Number of documents to return, default is 5 |
| ServiceCodes | array<string> | No | Product filter. For Viking AI Search inside `vs-product-qa`, this must be `["Universal AI Search"]`. |

#### Response fields
The main data is in `Result.DocList`. Each document item includes:
| Field | Type | Description |
|------|------|-------------|
| Title | string | Official document title |
| Url | string | Official document URL |
| Content | string | Document content returned by the API |
| ServiceCodes | array<string> | Product code list associated with the document |

---

### 2. Full-content fetch (`fetch`)
Fetch the full content of a known Volcengine documentation page and return structured title and body text.
- Endpoint: `https://docs-api.cn-beijing.volces.com/api/v1/doc/fetch`

#### Request parameters
| Name | Type | Required | Description |
|------|------|----------|-------------|
| Url | string | Yes | Volcengine documentation URL, such as `https://www.volcengine.com/docs/6349/162514`. For Viking AI Search inside `vs-product-qa`, this must stay under `https://www.volcengine.com/docs/85296`. |

Important rule:
If the input URL contains query parameters, such as `https://www.volcengine.com/docs/6396/624853?lang=zh`, strip all query parameters before sending the request and keep only the clean page URL.

#### Response fields
The main data is in `Result`:
| Field | Type | Description |
|------|------|-------------|
| Title | string | Full document title |
| Content | string | Full document body text in structured plain-text form |

## Result Handling Rules
### General hard rules
1. Every answer must include the corresponding official document URL as a reference, using the format `[Document Title](clean URL)`.
2. If multiple results are returned, show the most relevant ones first and limit the answer to at most 3 items.
3. Always use the script-returned `CleanUrl` as the citation URL. Do not cite URLs with query parameters such as `?lang=zh`.
4. For Viking AI Search inside `vs-product-qa`, reject results unless the page URL starts with `https://www.volcengine.com/docs/85296`.

### Search-result handling
1. Prefer using the returned `Content` field to answer the question because it is already documentation-grounded.
2. The API may already return enough page content, so extra summarization is optional rather than required.
3. For Viking AI Search inside `vs-product-qa`, reject search hits whose `ServiceCodes` do not include `Universal AI Search`.

### Fetch-result handling
1. The API returns full page content and can be used directly as the source material.

## Script Usage
### Search documents
```bash
python {skill_dir}/scripts/volcengine_docs.py search "query" [limit] [service_code_1,service_code_2...]
```
Example:
```bash
python {skill_dir}/scripts/volcengine_docs.py search "what is a Viking AI Search scene" 3 "Universal AI Search"
```

### Fetch full page content
```bash
python {skill_dir}/scripts/volcengine_docs.py fetch "volcengine documentation url"
```
Example:
```bash
python {skill_dir}/scripts/volcengine_docs.py fetch "https://www.volcengine.com/docs/85296/1544972?lang=en"
```
