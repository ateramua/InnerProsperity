# Extension Privacy And Data Use

IntentFlow Companion is designed as a local-first browser extension for the IntentFlow desktop app.

## Data The Extension Can Handle

- Extension preferences such as theme, notification settings, and optional cloud/telemetry endpoints.
- Pairing session metadata approved by the desktop app.
- Captured page metadata when the user clicks capture:
  - URL
  - page title
  - optional selected text
  - detected page type
  - capture timestamp
- Offline sync queue entries when desktop/cloud endpoints are unavailable.

## Data The Extension Must Not Store Or Send For Diagnostics

- Plaid access tokens.
- Plaid secrets.
- IntentFlow production secrets.
- Bank account numbers.
- Routing numbers.
- Balances or transaction amounts.
- Page URLs or titles in telemetry.
- Selected text in telemetry.

## Storage

- Preferences are stored in browser extension local storage.
- Sensitive session data is encrypted with WebCrypto before storage.
- Offline queue data remains local until successfully synced.

## Network Behavior

- Desktop communication uses native messaging where configured.
- Fallback desktop communication uses `127.0.0.1` only.
- Cloud fallback is disabled by default and requires a configured API base URL.
- Telemetry is disabled by default and requires a configured endpoint.

## User Controls

- Pair or disconnect the desktop app from extension settings.
- Enable or disable browser context enhancements.
- Enable or disable notifications.
- Enable or disable cloud fallback.
- Enable or disable diagnostics.
