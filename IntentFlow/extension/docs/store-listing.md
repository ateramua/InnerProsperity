# Store Listing Draft

## Short Description

IntentFlow Companion brings secure finance workflows, quick capture, and desktop sync into your browser.

## Long Description

IntentFlow Companion is the browser extension for the IntentFlow desktop finance app. It lets you capture receipts,
invoices, subscriptions, shopping pages, and money-related browser context directly into IntentFlow.

The extension pairs with the local desktop app using an approval prompt and encrypted session storage. When the desktop
app is not available, captures can be queued offline and synced later. Optional cloud fallback and diagnostics are
available only when explicitly configured.

Core features:

- Premium popup dashboard and quick actions.
- Side panel command center.
- Browser page capture for receipts, invoices, subscriptions, banking, and shopping pages.
- Local desktop pairing with approval.
- Offline queue and recovery.
- Dark/light/system theme support.
- Privacy-first diagnostics that exclude URLs, selected text, tokens, and financial amounts.

## Permissions Rationale

- `storage`: encrypted session storage, preferences, offline sync queue.
- `alarms`: periodic sync and diagnostics queue flushing.
- `notifications`: optional capture/sync notifications.
- `scripting`: future contextual enhancements on user-approved pages.
- `sidePanel`: premium side panel command center.
- `nativeMessaging` optional permission: secure desktop bridge where supported.
- Host permissions are limited to IntentFlow cloud domains and can remain unused until cloud fallback is configured.

## Privacy Summary

IntentFlow Companion does not sell data and does not collect financial page content for analytics. Captured page details
are sent only to the paired IntentFlow desktop app or a user-configured IntentFlow cloud endpoint. Diagnostics are
disabled by default and, when enabled, are sanitized to remove URLs, selected text, tokens, passwords, account details,
balances, and amounts.

## Screenshot Checklist

- Popup connected state.
- Popup offline/queued state.
- Onboarding pairing screen.
- Desktop approval prompt.
- Side panel dashboard.
- Settings privacy controls.
- Content capture chip on a receipt/invoice page.
