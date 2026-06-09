# IntentFlow DB architecture — Phase 2 & 3

## Phase 2: Transaction broker (serialized writes)

All SQLite **writes** from IPC handlers go through `enqueueWrite(label, fn)` in `setupIpcHandlers()` (`src/main/index.cjs`), backed by `dbWriteQueue.cjs` / `dbTransactionBroker.cjs`.

Covered write paths include:

- Accounts: `accounts:create`, `update`, `delete`, `applyManualAdjustment`
- Transactions: `createTransaction`, `addTransaction`, `updateTransaction`, `deleteTransaction`, bulk ops, splits, import (`transactions:executeImport`)
- Transfers: `create-linked-transfer`, `update-linked-transfer`, `delete-linked-transfer`
- Payees: `create-or-update-payee`
- Budget: `budget:bulkAssignMonth`, `repairAssignments`, `consolidateAssignments`, `unassignMonth`, `resetEnvelopes`, `setReadyToAssignPool`, `reconcilePoolEnvelope`, `scopeActiveAccounts`, `applyProsperityImport`
- Categories: `updateCategory`, `delete-category`, `categoryGroups:create|update|delete`
- Scheduled: `scheduled-transactions:*`, `accounts:scheduled:add|delete`
- Import mappings: `import-save-category-mappings`

Read-only IPC handlers are intentionally **not** queued.

Startup banner:

```
[IntentFlow DB] architecture=v2-transaction-broker connection=single pid=...
```

## Phase 3: Shared connection enforcement

- `intentflow-sqlite-owner.cjs` — single connection; `openStandalone()` blocked in Electron unless `INTENTFLOW_ALLOW_STANDALONE_DB=1`
- `TransactionService` — dbPath constructor redirects to `getDatabase()` in Electron (warn once)
- `payeeService.cjs` — `new TransactionService(() => getDatabase())`
- `scheduledTransactionService.cjs` — `new TransactionService(async () => db)`
- `index.cjs` — all `TransactionService` sites use provider constructor

## CI guard

```bash
npm run check:db-single-writer
```

Fails if `src/main`, `src/services`, or `src/db` (excluding scripts) contain forbidden `getDatabasePath()` / `dbPath` constructors or raw `sqlite3.Database()`.

## Before UI E2E

1. `npm run dev:restart`
2. Confirm `architecture=v2-transaction-broker` in terminal
3. Run PlayBDD scenarios
