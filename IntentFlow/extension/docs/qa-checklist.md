# Extension QA Checklist

## Local Desktop Pairing

- Start IntentFlow desktop with `npm run dev`.
- Load `.output/chrome-mv3` as an unpacked extension in Chrome.
- Open onboarding and click **Pair with desktop**.
- Confirm the desktop approval prompt appears.
- Approve pairing and confirm popup shows connected state.
- Confirm dashboard summary loads after pairing.
- Disconnect from settings and verify dashboard falls back to empty/offline state.

## Capture Flow

- Open a receipt, invoice, shopping, banking, or subscription page.
- Confirm the IntentFlow capture chip appears only on detected pages.
- Click capture and confirm notification/queued status.
- Confirm `extension_captures` receives a row in the desktop database.
- Repeat while desktop is closed and verify offline queue behavior.
- Reopen desktop and confirm queued items sync.

## Browser Matrix

- Chrome latest: popup, side panel, content chip, pairing, capture.
- Microsoft Edge latest: popup, side panel, pairing, capture.
- Brave latest: popup, pairing, capture.
- Arc latest: popup, pairing, capture.
- Firefox latest: popup, sidebar fallback behavior, pairing/capture.
- Safari: validate after Xcode wrapper is created.

## Security Checks

- Confirm extension pages use only local bundled scripts.
- Confirm native messaging manifest includes only expected extension IDs.
- Confirm unpaired bridge calls return `401`.
- Confirm loopback bridge binds to `127.0.0.1`, not `0.0.0.0`.
- Confirm telemetry is disabled by default.
- Confirm diagnostics payloads do not include page URLs, selected text, tokens, balances, or amounts.

## Accessibility Checks

- Keyboard navigation through popup, onboarding, side panel, and settings.
- Visible focus state for all controls.
- Reduced-motion mode does not animate.
- Text contrast passes in light and dark themes.
- Buttons and status text have clear labels.
