# Database environment isolation

IntentFlow uses **separate SQLite files** for development and production. They must never be mixed.

| Profile | Set by | Database path |
|---------|--------|----------------|
| `development` | `npm run dev` (default) | `IntentFlow/src/db/data/app.db` |
| `test` | `INTENTFLOW_RUNTIME_PROFILE=test` + optional `INTENTFLOW_DB_PATH` | Ephemeral or dev path (never Application Support) |
| `production` | Packaged `.app` only | `~/Library/Application Support/intentflow/money-manager.db` (macOS) |

## Rules

1. **Never bundle `app.db` in release builds** — only `empty-schema.sqlite` and `production-seed.db` (schema-only).
2. **`INTENTFLOW_DB_PATH` is ignored in production** — customer data stays in Application Support.
3. **UI automation** must use `http://127.0.0.1` or `localhost` and must not attach to a packaged app.
4. **Test entity names** (`BDD-*`, `_BDD*`) are blocked in production writes and flagged on startup.

## Build commands

```bash
npm run generate:empty-schema   # schema-only seed file (no user/transaction data)
npm run seed:db                 # copy empty schema → production-seed.db
npm run verify:release-db-policy
npm run dist                    # runs all gates + packages .app
```

## Recovery

If production shows test accounts after an old build, restore from backup or migrate from a legacy path under `Application Support/com.intentflow.moneymanager/`. Reinstall using a build that passes `verify:release-db-policy`.
