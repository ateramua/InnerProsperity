# IntentFlow DB architecture — Phase 0 (operational gates)

## Electron main does not hot-reload

Changes under these paths require a **full Electron restart** before UI E2E or manual testing:

- `src/main/**`
- `src/db/**`
- `src/preload/**`

The Next.js renderer hot-reloads; the main process and preload script do not.

## Restart dev cleanly

```bash
cd IntentFlow
npm run dev:restart
```

Or manually stop `npm run dev` (Ctrl+C), ensure no stale Electron process remains, then:

```bash
env -u ELECTRON_RUN_AS_NODE npm run dev
```

## Verify fresh main loaded

On startup you should see exactly one banner like:

```
[IntentFlow DB] architecture=v2-transaction-broker connection=single pid=... electron=true
```

If this line is missing after a main-process change, tests may be running against stale DB logic.

## Before UI E2E (PlayBDDFramework)

1. Restart IntentFlow dev (`npm run dev:restart`)
2. Confirm the architecture banner in the terminal
3. Run scenarios with `INTENTFLOW_BASE_URL` matching the port printed by dev (often `3000`)
