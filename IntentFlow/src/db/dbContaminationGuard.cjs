/**
 * Detect test/automation artifacts in SQLite databases (build gates + production startup).
 */
const { open } = require('sqlite');
const sqlite3 = require('sqlite3');
const fs = require('fs');
const { isTestEntityName } = require('./runtimeProfile.cjs');

const TEST_USERNAMES = new Set(['teramua']);

async function openDbReadOnly(dbPath) {
  return open({
    filename: dbPath,
    driver: sqlite3.Database,
    mode: sqlite3.OPEN_READONLY,
  });
}

async function scanDatabaseForTestArtifacts(dbOrPath) {
  const issues = [];
  let db = dbOrPath;
  let owned = false;

  if (typeof dbOrPath === 'string') {
    if (!fs.existsSync(dbOrPath)) {
      return [{ code: 'missing', message: `Database file not found: ${dbOrPath}` }];
    }
    db = await openDbReadOnly(dbOrPath);
    owned = true;
  }

  try {
    const tables = await db.all(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    const tableNames = new Set((tables || []).map((t) => t.name));

    if (tableNames.has('accounts')) {
      const rows = await db.all(
        "SELECT name FROM accounts WHERE name LIKE 'BDD-%' OR name LIKE '_BDD%' LIMIT 20"
      );
      for (const row of rows || []) {
        issues.push({
          code: 'test_account',
          message: `Test account in database: ${row.name}`,
        });
      }
    }

    if (tableNames.has('categories')) {
      const rows = await db.all(
        "SELECT name FROM categories WHERE name LIKE 'BDD-%' OR name LIKE '_BDD%' LIMIT 20"
      );
      for (const row of rows || []) {
        issues.push({
          code: 'test_category',
          message: `Test category in database: ${row.name}`,
        });
      }
    }

    if (tableNames.has('users')) {
      const rows = await db.all('SELECT username FROM users LIMIT 50');
      for (const row of rows || []) {
        if (TEST_USERNAMES.has(String(row.username || '').trim())) {
          issues.push({
            code: 'test_user',
            message: `Automation test user in database: ${row.username}`,
          });
        }
      }
    }
  } finally {
    if (owned && db) {
      await db.close().catch(() => {});
    }
  }

  return issues;
}

/**
 * Fast binary scan for obvious test markers (pre-schema files / CI without sqlite open).
 */
function scanFileForTestMarkers(filePath) {
  const issues = [];
  if (!fs.existsSync(filePath)) {
    return issues;
  }
  const buf = fs.readFileSync(filePath);
  const text = buf.toString('latin1');
  if (text.includes('BDD-ORCH') || text.includes('BDD-S0')) {
    issues.push({
      code: 'binary_marker',
      message: `File contains BDD test markers: ${filePath}`,
    });
  }
  return issues;
}

async function assertCleanSeedDatabase(filePath, { label = 'seed database' } = {}) {
  const binaryIssues = scanFileForTestMarkers(filePath);
  if (binaryIssues.length) {
    const msg = binaryIssues.map((i) => i.message).join('; ');
    throw new Error(`${label} failed contamination check: ${msg}`);
  }
  const sqlIssues = await scanDatabaseForTestArtifacts(filePath);
  if (sqlIssues.length) {
    const msg = sqlIssues.map((i) => i.message).join('; ');
    throw new Error(`${label} failed contamination check: ${msg}`);
  }
}

function formatContaminationReport(issues) {
  return issues.map((i) => `• ${i.message}`).join('\n');
}

module.exports = {
  scanDatabaseForTestArtifacts,
  scanFileForTestMarkers,
  assertCleanSeedDatabase,
  formatContaminationReport,
  isTestEntityName,
};
