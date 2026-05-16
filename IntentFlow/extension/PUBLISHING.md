# Browser Store Publishing

## Chromium: Chrome, Brave, Arc

1. Run `npm run build`.
2. Run `npm run zip`.
3. Upload `.output/*-chrome.zip` to the Chrome Web Store.
4. Brave and Arc users can install through the Chrome Web Store distribution.

## Microsoft Edge

1. Use the Chrome build unless Edge-specific permissions or listing metadata are needed.
2. Upload the zipped Chromium artifact to Microsoft Edge Add-ons.
3. Keep the extension ID mapped in desktop bridge allowlists.

## Firefox

1. Run `npm run build:firefox`.
2. Run `npm run zip:firefox`.
3. Upload the Firefox artifact to AMO.
4. Validate `browser_specific_settings.gecko.id` before production release.

## Safari

Safari requires an Apple wrapper around the WebExtension:

1. Build the extension artifact.
2. Use Xcode's Safari Web Extension converter.
3. Review native permissions and App Store privacy labels.
4. Ship through the Mac App Store or notarized distribution.

## Release Compatibility

- Extension version: user-facing store version.
- Bridge protocol: `2026.05` in `src/bridge/protocol.ts`.
- Desktop app should support at least the current and previous bridge protocol before forcing an update.
