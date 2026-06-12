#!/usr/bin/env node
/**
 * Copy PLAID_* keys from IntentFlow/.env → macOS userData/plaid.env.json
 * so packaged /Applications/IntentFlow.app can use Plaid after a production build.
 *
 * Usage: node scripts/sync-plaid-env-to-userdata.cjs
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { syncPlaidEnvJsonFromDotEnv } = require('../src/services/plaid/loadPlaidEnv.cjs');

const ROOT = path.resolve(__dirname, '..');
const dotEnvPath = process.env.INTENTFLOW_PLAID_DOTENV_PATH || path.join(ROOT, '.env');

function resolveUserDataDir() {
  const home = os.homedir();
  if (process.platform === 'darwin') {
    return path.join(home, 'Library', 'Application Support', 'IntentFlow');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'IntentFlow');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'), 'IntentFlow');
}

const userDataPath = resolveUserDataDir();

if (!fs.existsSync(dotEnvPath)) {
  console.error(`❌ No .env found at ${dotEnvPath}`);
  console.error('   Set PLAID_CLIENT_ID, PLAID_SECRET, and PLAID_ENV in IntentFlow/.env first.');
  process.exit(1);
}

const result = syncPlaidEnvJsonFromDotEnv({ userDataPath, dotEnvPath });
if (!result.synced) {
  console.error(`❌ Could not sync Plaid env (${result.reason || 'unknown'})`);
  console.error(`   Source: ${dotEnvPath}`);
  console.error(`   Target: ${path.join(userDataPath, 'plaid.env.json')}`);
  process.exit(1);
}

console.log(`✅ Plaid credentials synced to ${result.targetPath}`);
console.log(`   (${result.keys} keys from ${result.dotEnvPath})`);
console.log('   Restart IntentFlow if it is already running.');
