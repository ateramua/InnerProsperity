/**
 * Runtime environment profile for database path resolution and isolation guards.
 *
 * Profiles:
 *   production  — packaged Electron app (customer money-manager.db only)
 *   development — npm run dev (repo src/db/data/app.db)
 *   test        — automation / CI (INTENTFLOW_DB_PATH required or ephemeral default)
 */
const path = require('path');

const PROFILES = Object.freeze({
  PRODUCTION: 'production',
  DEVELOPMENT: 'development',
  TEST: 'test',
});

const CANONICAL_PROD_DIR = 'intentflow';
const DB_FILE_NAME = 'money-manager.db';
const DEV_DB_RELATIVE = path.join('src', 'db', 'data', 'app.db');

/** Names reserved for BDD / automation — must never appear in production. */
const TEST_ENTITY_NAME_PATTERN = /^BDD-/i;
const TEST_INTERNAL_PREFIX = /^_BDD\b/i;

function normalizeProfile(value) {
  const v = String(value || '').trim().toLowerCase();
  if (v === PROFILES.PRODUCTION || v === PROFILES.DEVELOPMENT || v === PROFILES.TEST) {
    return v;
  }
  return null;
}

/**
 * @param {{ isPackaged?: boolean }} [opts]
 */
function resolveRuntimeProfile(opts = {}) {
  const isPackaged = Boolean(opts.isPackaged);
  if (isPackaged) {
    return PROFILES.PRODUCTION;
  }
  const fromEnv = normalizeProfile(process.env.INTENTFLOW_RUNTIME_PROFILE);
  if (fromEnv) {
    return fromEnv;
  }
  if (process.env.NODE_ENV === 'test') {
    return PROFILES.TEST;
  }
  return PROFILES.DEVELOPMENT;
}

function getProjectRoot() {
  return path.resolve(__dirname, '../..');
}

function getDefaultDevelopmentDbPath() {
  return path.join(getProjectRoot(), DEV_DB_RELATIVE);
}

function isProductionDatabasePath(dbPath) {
  if (!dbPath) return false;
  const normalized = path.normalize(String(dbPath));
  const parts = normalized.split(path.sep);
  if (parts.includes(CANONICAL_PROD_DIR) && normalized.endsWith(DB_FILE_NAME)) {
    return true;
  }
  if (normalized.includes(`${path.sep}com.intentflow.moneymanager${path.sep}`)) {
    return true;
  }
  if (normalized.includes(`${path.sep}IntentFlow${path.sep}${DB_FILE_NAME}`)) {
    return true;
  }
  return false;
}

function isDevelopmentDatabasePath(dbPath) {
  if (!dbPath) return false;
  const normalized = path.normalize(String(dbPath));
  return normalized.endsWith(path.join('src', 'db', 'data', 'app.db'));
}

function assertDbPathAllowedForProfile(profile, dbPath) {
  const resolved = path.resolve(dbPath);
  if (profile === PROFILES.PRODUCTION) {
    if (!isProductionDatabasePath(resolved)) {
      throw new Error(
        `Production profile requires canonical user-data database path, got: ${resolved}`
      );
    }
    return resolved;
  }
  if (isProductionDatabasePath(resolved)) {
    throw new Error(
      `Refusing non-production profile on production database path: ${resolved}`
    );
  }
  if (profile === PROFILES.TEST && process.env.INTENTFLOW_ALLOW_PRODUCTION_DB_PATH === '1') {
    return resolved;
  }
  return resolved;
}

function assertProductionEntityNameAllowed(name, { field = 'name' } = {}) {
  const label = String(name || '').trim();
  if (!label) {
    return { ok: true };
  }
  if (TEST_ENTITY_NAME_PATTERN.test(label) || TEST_INTERNAL_PREFIX.test(label)) {
    return {
      ok: false,
      reason: `Test/automation ${field} "${label}" is not allowed in production`,
    };
  }
  return { ok: true };
}

function isTestEntityName(name) {
  const label = String(name || '').trim();
  return TEST_ENTITY_NAME_PATTERN.test(label) || TEST_INTERNAL_PREFIX.test(label);
}

module.exports = {
  PROFILES,
  CANONICAL_PROD_DIR,
  DB_FILE_NAME,
  DEV_DB_RELATIVE,
  TEST_ENTITY_NAME_PATTERN,
  resolveRuntimeProfile,
  getProjectRoot,
  getDefaultDevelopmentDbPath,
  isProductionDatabasePath,
  isDevelopmentDatabasePath,
  assertDbPathAllowedForProfile,
  assertProductionEntityNameAllowed,
  isTestEntityName,
};
