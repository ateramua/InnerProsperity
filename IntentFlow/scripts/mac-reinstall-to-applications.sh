#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

export CSC_IDENTITY_AUTO_DISCOVERY=false

echo "🧹 Thorough clean (clean:deep)…"
npm run clean:deep

echo "📦 Full local distribution build (ad-hoc signing, no Apple Developer credentials)…"
npm run dist

APP="$(find release -maxdepth 4 -name '*.app' 2>/dev/null | head -1)"
if [[ -z "${APP}" || ! -d "${APP}" ]]; then
  echo "❌ No .app bundle found under release/. Build may have failed."
  exit 1
fi

echo "📲 Installing to /Applications/IntentFlow.app (from: $APP)"
rm -rf "/Applications/IntentFlow.app"
ditto "$APP" "/Applications/IntentFlow.app"

echo "🔑 Syncing Plaid credentials to Application Support (packaged app reads plaid.env.json)…"
if node scripts/sync-plaid-env-to-userdata.cjs; then
  echo "✅ Plaid env synced for production app"
else
  echo "⚠️  Plaid env not synced — copy IntentFlow/.env keys to ~/Library/Application Support/IntentFlow/plaid.env.json"
fi

echo "🚀 Opening IntentFlow…"
open "/Applications/IntentFlow.app"
