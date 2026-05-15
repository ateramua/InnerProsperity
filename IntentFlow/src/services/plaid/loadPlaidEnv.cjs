/**
 * Load Plaid credentials for packaged apps from userData/plaid.env.json
 * (see plaid.env.example.json). Dev still uses IntentFlow/.env via dotenv.
 */
const fs = require('fs');
const path = require('path');

function loadPlaidEnvFromUserData(getUserDataPath) {
  if (typeof getUserDataPath !== 'function') return { loaded: false };
  try {
    const configPath = path.join(getUserDataPath(), 'plaid.env.json');
    if (!fs.existsSync(configPath)) {
      return { loaded: false, path: configPath };
    }
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const keys = [
      'PLAID_CLIENT_ID',
      'PLAID_SECRET',
      'PLAID_ENV',
      'PLAID_ENABLED',
      'PLAID_REDIRECT_URI',
      'PLAID_WEBHOOK_RELAY_URL',
      'PLAID_WEBHOOK_RELAY_API_KEY',
    ];
    let count = 0;
    for (const key of keys) {
      if (raw[key] != null && raw[key] !== '') {
        process.env[key] = String(raw[key]);
        count += 1;
      }
    }
    return { loaded: true, path: configPath, keysSet: count };
  } catch (err) {
    console.warn('Plaid userData env load failed:', err.message);
    return { loaded: false, error: err.message };
  }
}

module.exports = { loadPlaidEnvFromUserData };
