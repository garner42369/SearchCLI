# AK/SK Security Notice

Use this notice whenever a product-answering flow mentions credentials, environment variables, `vs auth import-env`, `vs auth login`, Access Key, Secret Key, AK, or SK:

> `vs` authenticates with Access Key / Secret Key (AK/SK); all operations run under the corresponding account's permissions. Keep AK/SK private - never commit them to repositories, write them to logs, or share them with unauthorized parties.

## Handling Rules

- Do not ask the user to paste AK/SK into chat.
- Prefer `vs auth login` for interactive setup.
- Prefer `VIKING_AK` / `VIKING_SK` plus `vs auth import-env` when the user already has credentials in their own terminal.
- If the user has accidentally shared AK/SK, tell them to rotate the credentials immediately.
