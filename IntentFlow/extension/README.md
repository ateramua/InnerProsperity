# IntentFlow Browser Extension

Modern browser extension companion for the IntentFlow Electron/Next.js desktop app.

## Goals

- Premium popup, side panel, onboarding, and settings experiences.
- Manifest V3 where supported, with Firefox and Safari WebExtension packaging paths.
- Secure desktop pairing through native messaging first, loopback second, cloud fallback later.
- Encrypted local session storage and offline sync queue.
- Lightweight content enhancements for receipts, invoices, subscriptions, banking, and shopping pages.

## Commands

```bash
npm install
npm run dev
npm run build
npm run build:firefox
npm run zip
```

From the parent `IntentFlow` package, use:

```bash
npm run ext:dev
npm run ext:build
npm run ext:build:firefox
```

## Architecture

- `src/entrypoints/background.ts`: service worker, commands, notifications, sync queue draining.
- `src/entrypoints/content.ts`: contextual browser capture chip.
- `src/entrypoints/popup`: quick dashboard and quick actions.
- `src/entrypoints/sidepanel`: richer browser-native command center.
- `src/entrypoints/options`: privacy, storage, cloud fallback, and theme settings.
- `src/bridge`: desktop communication contracts.
- `src/storage`: encrypted local storage and preferences.
- `src/sync`: durable extension-side offline queue.

## Production Notes

The Electron desktop app exposes a localhost-only bridge on `127.0.0.1:37631-37633`.
The extension tries native messaging first and then falls back to that loopback bridge.

To install the native messaging manifest after loading the extension once:

```bash
INTENTFLOW_CHROME_EXTENSION_IDS=<chrome-or-edge-extension-id> npm run ext:native-host:install --prefix ..
```

Firefox uses `intentflow-companion@intentflow.local` by default. Safari requires the Safari Web Extension app wrapper
instead of this native-host manifest path.
