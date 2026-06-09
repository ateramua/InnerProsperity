# IntentFlow DB architecture — Phase 4 & 5

## Phase 4: Import hardening

### Service (`transactionImportService.cjs`)

- Entire row loop runs inside `dbWriteQueue.runImmediateTransaction()` (single `BEGIN IMMEDIATE` batch on the shared connection).
- Per-row inserts use `runInWriteContext()` (no nested broker enqueue / retry storms).
- Returns `success: false` when `failed > 0` and both `imported` and `matched` are zero, with the first failure message in `error`.

### IPC (`transactions:executeImport`)

- Propagates hard failures as `{ success: false, error, data }` instead of always `{ success: true }`.
- Skips prosperity notifications when import hard-fails.

### UI (`TransactionImportModal.jsx`)

- Waits for `waitForDbIdle` before import and after success.
- Hard failures keep the modal open, show an error dialog (`Import failed`), and surface per-line failure text.
- Partial success (some imported, some failed) still completes but uses an error-styled dialog.

## Phase 5: Harness IPC bulk soft-delete

### Main process

- `harness:softDeleteMonthTransactions` — broker-wrapped, `runImmediateTransaction` batch soft-delete for BDD month prefix.
- Preload: `electronAPI.softDeleteMonthTransactions(payload)`.

### PlayBDD harness (`intentflowDbQuiet.js`)

- `fastSoftDeleteBddMonthTransactions` calls IPC first when `page` is available.
- Direct `openAppDb()` SQL only when `INTENTFLOW_UI_ALLOW_DIRECT_DB=1` (debug / no-Electron runs).
- IPC path waits for `waitForDbIdle` before delete and retries transient `SQLITE_BUSY`.

## CI guards

```bash
# IntentFlow — no secondary connections in main/services
cd IntentFlow && npm run check:db-single-writer

# PlayBDD — harness uses IPC soft-delete + IntentFlow guard
cd PlayBDDFramework && npm run check:intentflow-harness-db
```

IntentFlow `npm run build` runs `check:db-single-writer` first.
