# Extension Roadmap Status

## Implemented

- Dedicated WXT/React/TypeScript extension workspace.
- Chrome/Edge/Brave/Arc Chromium build.
- Firefox build.
- Safari publishing path documented.
- Popup, side panel, onboarding, settings, background worker, and content script.
- Encrypted extension session storage.
- Desktop-approved pairing flow.
- Authenticated desktop bridge requests.
- Localhost-only desktop bridge with dashboard summary and page capture endpoints.
- Native messaging proxy and macOS manifest installer.
- Offline capture queue and periodic sync drain.
- Unit tests for bridge protocol and session expiry.
- Disabled-by-default cloud fallback client.
- Disabled-by-default privacy-safe telemetry queue.
- Store listing draft, privacy/data-use document, publishing guide, and QA checklist.

## Production Dependencies Still Needed

- Real browser store extension IDs before native messaging manifests can be finalized.
- Safari Xcode wrapper and App Store metadata.
- Cloud API base URL and auth provider before cloud fallback can be enabled in production.
- Error reporting/telemetry endpoint before diagnostics can send events.
- Store-specific screenshots.

## Recommended Next Milestones

1. Load the Chrome build locally and record its extension ID.
2. Run `INTENTFLOW_CHROME_EXTENSION_IDS=<id> npm run ext:native-host:install`.
3. Start `npm run dev`, pair from the extension onboarding page, and test capture/dashboard.
4. Configure cloud auth/API integration after backend endpoints are defined.
5. Package and submit Chrome/Edge/Firefox builds.
6. Create Safari Web Extension wrapper in Xcode.
