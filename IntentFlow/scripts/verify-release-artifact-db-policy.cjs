#!/usr/bin/env node
/**
 * Post electron-builder gate: scan packaged .app for dev app.db or BDD test markers.
 */
const fs = require('fs');
const path = require('path');
const {
  assertCleanSeedDatabase,
  scanFileForTestMarkers,
} = require('../src/db/dbContaminationGuard.cjs');

const { listPackage } = require('@electron/asar');

const ROOT = path.join(__dirname, '..');
const RELEASE_DIR = path.join(ROOT, 'release');

const REQUIRED_ASAR_PATHS = [
  'src/db/initSchema.cjs',
  'src/db/database.cjs',
  'src/db/database.config.js',
  'src/db/transactionRunner.cjs',
  'src/main/index.cjs',
];

const FORBIDDEN_FLAT_DB_PATHS = [
  'initSchema.cjs',
  'database.cjs',
  'database.config.js',
];

function fail(message) {
  console.error(`verify-release-artifact-db-policy: ${message}`);
  process.exit(1);
}

function findAppBundles(dir) {
  const found = [];
  if (!fs.existsSync(dir)) return found;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name.endsWith('.app')) {
        found.push(full);
      } else {
        found.push(...findAppBundles(full));
      }
    }
  }
  return found;
}

function collectDbFiles(appRoot) {
  const results = [];
  const resources = path.join(appRoot, 'Contents', 'Resources');
  if (!fs.existsSync(resources)) return results;

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.db') || entry.name.endsWith('.sqlite')) {
        results.push(full);
      }
    }
  };
  walk(resources);
  return results;
}

function assertAsarLayout(appPath) {
  const asarPath = path.join(appPath, 'Contents', 'Resources', 'app.asar');
  if (!fs.existsSync(asarPath)) {
    fail(`missing app.asar in ${appPath}`);
  }

  const entries = new Set(
    listPackage(asarPath).map((entry) => entry.replace(/^[/\\]+/, ''))
  );

  for (const required of REQUIRED_ASAR_PATHS) {
    if (!entries.has(required)) {
      fail(`app.asar missing required module: ${required}`);
    }
  }

  for (const flat of FORBIDDEN_FLAT_DB_PATHS) {
    if (entries.has(flat)) {
      fail(
        `app.asar has flattened db file at ${flat} — package.json build.files must use "to": "src/db"`
      );
    }
  }
}

async function main() {
  const apps = findAppBundles(RELEASE_DIR);
  if (!apps.length) {
    console.warn('verify-release-artifact-db-policy: no .app in release/ (skipped)');
    return;
  }

  for (const appPath of apps) {
    assertAsarLayout(appPath);
    const dbFiles = collectDbFiles(appPath);
    for (const dbFile of dbFiles) {
      const base = path.basename(dbFile);
      if (base === 'app.db') {
        fail(`packaged app contains forbidden dev database: ${dbFile}`);
      }
      const markers = scanFileForTestMarkers(dbFile);
      if (markers.length) {
        fail(markers.map((m) => m.message).join('; '));
      }
      await assertCleanSeedDatabase(dbFile, { label: path.relative(appPath, dbFile) });
    }
  }

  console.log(`verify-release-artifact-db-policy: OK (${apps.length} app bundle(s))`);
}

main().catch((err) => {
  fail(err.message || String(err));
});
