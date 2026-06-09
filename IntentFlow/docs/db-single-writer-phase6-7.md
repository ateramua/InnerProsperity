# IntentFlow DB architecture — Phase 6 & 7

## Phase 6: Complete broker coverage

All remaining SQLite **write** IPC paths are wrapped with `enqueueWrite(channel, fn)` in `src/main/index.cjs`, including:

- **Plaid:** exchange token, sync item/account/transactions, link/merge/rollback, unlink, remove item, category mapping save/reapply
- **Accounts:** `create-account`, permanent credit/loan delete, ensure CC payment categories
- **Categories:** `createCategory`, archive/restore/toggleHide, legacy `deleteCategory`
- **Settings:** `save-user-setting`, `set-auto-sync-setting` (harness uses this for Plaid pause)
- **Cash forecast / validation** write paths
- **Legacy:** `update-account`, `delete-account`

Manifest: `scripts/ipc-write-handlers.manifest.json` (75 channels).

Helper added in `setupIpcHandlers()`:

```javascript
const registerWriteHandler = (channel, handler) => {
  ipcMain.handle(channel, async (...args) => enqueueWrite(channel, () => handler(...args)));
};
```

## Phase 7: Observability, regression, closure

### Broker logging

Set `INTENTFLOW_DB_BROKER_LOG=1` to log each `enqueueWrite` with queue depth.

### Regression tests

```bash
npm run test:db-broker
npm run check:ipc-write-broker
npm run check:db-single-writer
```

`npm run build` runs all three guards before Next.js build.

### Harness hardening

`pausePlaidAutoSync` no longer falls back to direct SQLite unless `INTENTFLOW_UI_PLAID_PAUSE_DB=1`.

### Validation before UI E2E

1. `cd IntentFlow && npm run dev:restart`
2. Confirm banner: `architecture=v2-transaction-broker`
3. `cd PlayBDDFramework && npm run check:intentflow-harness-db`
4. Run UI-E2E scenarios
