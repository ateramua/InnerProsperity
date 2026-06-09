# IntentFlow single-writer SQLite architecture

One shared SQLite connection in Electron main; all writes serialized through the transaction broker.

| Phase | Doc | Summary |
|-------|-----|---------|
| 0 | [phase0](db-single-writer-phase0.md) | Dev restart gates, architecture banner |
| 1 | (in phase2-3) | `intentflow-sqlite-owner` singleton |
| 2 | [phase2-3](db-single-writer-phase2-3.md) | `enqueueWrite` transaction broker |
| 3 | [phase2-3](db-single-writer-phase2-3.md) | Shared connection in services |
| 4 | [phase4-5](db-single-writer-phase4-5.md) | Import hardening |
| 5 | [phase4-5](db-single-writer-phase4-5.md) | Harness IPC soft-delete + CI guards |
| 6 | [phase6-7](db-single-writer-phase6-7.md) | Full IPC write coverage (Plaid, etc.) |
| 7 | [phase6-7](db-single-writer-phase6-7.md) | Broker regression, manifest, observability |

## Startup banner

```
[IntentFlow DB] architecture=v2-transaction-broker connection=single pid=... electron=true
```

## CI / local checks

```bash
npm run check:db-single-writer      # no secondary connections in main/services
npm run check:ipc-write-broker      # 75 write IPC handlers broker-wrapped
npm run test:db-broker              # queue serialization + idle window
```

PlayBDD harness:

```bash
cd ../PlayBDDFramework && npm run check:intentflow-harness-db
```

## Key modules

- `src/db/intentflow-sqlite-owner.cjs` — single connection
- `src/db/dbWriteQueue.cjs` — write broker
- `src/db/transactionRunner.cjs` — savepoint-safe transactions
- `src/main/index.cjs` — IPC `enqueueWrite` wraps
