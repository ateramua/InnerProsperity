/**
 * Load Plaid credentials for packaged apps from userData/plaid.env.json
 * (see plaid.env.example.json). Dev still uses IntentFlow/.env via dotenv.
 */
const fs = require('fs');
const path = require('path');
const os = require('os');

const PLAID_ENV_KEYS = [
  'PLAID_CLIENT_ID',
  'PLAID_SECRET',
  'PLAID_ENV',
  'PLAID_ENABLED',
  'PLAID_REDIRECT_URI',
  'PLAID_WEBHOOK_RELAY_URL',
  'PLAID_WEBHOOK_RELAY_API_KEY',
  'PLAID_LINK_PRODUCTS',
];

let lastLoadResult = { loaded: false };

function getLastPlaidEnvLoadResult() {
  return lastLoadResult;
}

function applyPlaidEnvFromObject(raw) {
  if (!raw || typeof raw !== 'object') return 0;
  let count = 0;
  for (const key of PLAID_ENV_KEYS) {
    if (raw[key] != null && raw[key] !== '') {
      process.env[key] = String(raw[key]);
      count += 1;
    }
  }
  return count;
}

function parseDotEnvFile(envPath) {
  if (!envPath || !fs.existsSync(envPath)) return null;
  try {
    const dotenv = require('dotenv');
    return dotenv.parse(fs.readFileSync(envPath, 'utf8'));
  } catch (err) {
    console.warn(`Plaid dotenv parse failed (${envPath}):`, err.message);
    return null;
  }
}

function hasPlaidCredentials(raw) {
  return Boolean(raw?.PLAID_CLIENT_ID && raw?.PLAID_SECRET);
}

function writePlaidEnvJson(targetPath, raw) {
  const payload = {};
  for (const key of PLAID_ENV_KEYS) {
    if (raw[key] != null && raw[key] !== '') {
      payload[key] = String(raw[key]);
    }
  }
  if (!hasPlaidCredentials(payload)) {
    return { written: false, reason: 'missing-credentials' };
  }
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  return { written: true, path: targetPath, keys: Object.keys(payload).length };
}

function resolveUserDataPlaidJsonCandidates(getUserDataPath) {
  const home = os.homedir();
  const appSupport = process.platform === 'darwin'
    ? path.join(home, 'Library', 'Application Support')
    : process.platform === 'win32'
      ? path.join(process.env.APPDATA || path.join(home, 'AppData', 'Roaming'))
      : path.join(process.env.XDG_CONFIG_HOME || path.join(home, '.config'));

  const folderNames = new Set();
  if (typeof getUserDataPath === 'function') {
    try {
      folderNames.add(getUserDataPath());
    } catch {
      /* ignore */
    }
  }
  folderNames.add(path.join(appSupport, 'IntentFlow'));
  folderNames.add(path.join(appSupport, 'intentflow'));
  folderNames.add(path.join(appSupport, 'com.intentflow.moneymanager'));

  return [...folderNames].map((dir) => path.join(dir, 'plaid.env.json'));
}

function loadPlaidEnvFromJsonFile(configPath) {
  if (!configPath || !fs.existsSync(configPath)) {
    return { loaded: false, path: configPath };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const keysSet = applyPlaidEnvFromObject(raw);
    return { loaded: keysSet > 0, path: configPath, keysSet, source: 'json' };
  } catch (err) {
    console.warn('Plaid userData env load failed:', err.message);
    return { loaded: false, path: configPath, error: err.message, source: 'json' };
  }
}

function loadPlaidEnvFromDotEnvFile(envPath) {
  const parsed = parseDotEnvFile(envPath);
  if (!parsed || !hasPlaidCredentials(parsed)) {
    return { loaded: false, path: envPath, source: 'dotenv' };
  }
  const keysSet = applyPlaidEnvFromObject(parsed);
  return { loaded: keysSet > 0, path: envPath, keysSet, source: 'dotenv' };
}

/**
 * Copy PLAID_* keys from a .env file into userData/plaid.env.json (packaged apps).
 */
function syncPlaidEnvJsonFromDotEnv({ userDataPath, dotEnvPath }) {
  const parsed = parseDotEnvFile(dotEnvPath);
  if (!parsed) {
    return { synced: false, reason: 'dotenv-missing', dotEnvPath };
  }
  const targetPath = path.join(userDataPath, 'plaid.env.json');
  const writeResult = writePlaidEnvJson(targetPath, parsed);
  if (!writeResult.written) {
    return { synced: false, reason: writeResult.reason, dotEnvPath, targetPath };
  }
  return { synced: true, dotEnvPath, targetPath, keys: writeResult.keys };
}

function loadPlaidEnvFromUserData(getUserDataPath, options = {}) {
  const { isPackaged = false, bootstrapFromDotEnv = true } = options;
  const userDataPath = typeof getUserDataPath === 'function' ? getUserDataPath() : null;

  for (const configPath of resolveUserDataPlaidJsonCandidates(getUserDataPath)) {
    const result = loadPlaidEnvFromJsonFile(configPath);
    if (result.loaded) {
      lastLoadResult = result;
      return result;
    }
  }

  if (userDataPath && bootstrapFromDotEnv) {
    const targetJson = path.join(userDataPath, 'plaid.env.json');
    const dotEnvCandidates = [
      process.env.INTENTFLOW_PLAID_DOTENV_PATH,
      path.join(userDataPath, '.env'),
    ].filter(Boolean);

    if (isPackaged) {
      const projectRoot = process.env.INTENTFLOW_PROJECT_ROOT;
      if (projectRoot) {
        dotEnvCandidates.push(path.join(projectRoot, '.env'));
      }
    }

    for (const envPath of dotEnvCandidates) {
      if (!fs.existsSync(envPath)) continue;
      const syncResult = syncPlaidEnvJsonFromDotEnv({ userDataPath, dotEnvPath: envPath });
      if (syncResult.synced) {
        console.log(`✅ Plaid env bootstrapped to ${syncResult.targetPath} from ${syncResult.dotEnvPath}`);
        const loaded = loadPlaidEnvFromJsonFile(syncResult.targetPath);
        lastLoadResult = { ...loaded, bootstrapped: true, bootstrapSource: syncResult.dotEnvPath };
        return lastLoadResult;
      }
    }
  }

  lastLoadResult = { loaded: false, path: userDataPath ? path.join(userDataPath, 'plaid.env.json') : null };
  return lastLoadResult;
}

module.exports = {
  PLAID_ENV_KEYS,
  applyPlaidEnvFromObject,
  getLastPlaidEnvLoadResult,
  loadPlaidEnvFromUserData,
  loadPlaidEnvFromJsonFile,
  loadPlaidEnvFromDotEnvFile,
  resolveUserDataPlaidJsonCandidates,
  syncPlaidEnvJsonFromDotEnv,
  writePlaidEnvJson,
};
