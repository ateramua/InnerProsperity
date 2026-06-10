#!/usr/bin/env node
/**
 * Pre-packaging gate: production bundles must not include dev app.db or test data.
 */
const fs = require('fs');
const path = require('path');
const { assertCleanSeedDatabase, scanFileForTestMarkers } = require('../src/db/dbContaminationGuard.cjs');

const ROOT = path.join(__dirname, '..');
const PACKAGE_JSON = path.join(ROOT, 'package.json');
const EMPTY_SCHEMA = path.join(ROOT, 'src/db/data/empty-schema.sqlite');
const PRODUCTION_SEED = path.join(ROOT, 'src/db/data/production-seed.db');
const DEV_APP_DB = path.join(ROOT, 'src/db/data/app.db');

function fail(message) {
  console.error(`verify-release-db-policy: ${message}`);
  process.exit(1);
}

function assertExtraResourcesPolicy() {
  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
  const resources = pkg.build?.extraResources || [];

  for (const entry of resources) {
    if (!entry || typeof entry !== 'object') continue;
    const from = String(entry.from || '');
    const filters = Array.isArray(entry.filter) ? entry.filter : [];
    const isWildcardDbBundle =
      from.replace(/\\/g, '/').includes('src/db/data') &&
      filters.some((f) => String(f).includes('*'));
    if (isWildcardDbBundle) {
      fail(
        'package.json extraResources must not bundle all of src/db/data/ (would ship dev app.db)'
      );
    }
    if (from.endsWith('app.db') || from.includes('/app.db')) {
      fail('package.json extraResources must not reference app.db');
    }
  }
}

async function assertSeedArtifacts() {
  if (!fs.existsSync(EMPTY_SCHEMA)) {
    fail(`missing ${EMPTY_SCHEMA} — run: npm run generate:empty-schema`);
  }
  await assertCleanSeedDatabase(EMPTY_SCHEMA, { label: 'empty-schema.sqlite' });

  if (fs.existsSync(PRODUCTION_SEED)) {
    await assertCleanSeedDatabase(PRODUCTION_SEED, { label: 'production-seed.db' });
  }

  if (fs.existsSync(DEV_APP_DB)) {
    const devMarkers = scanFileForTestMarkers(DEV_APP_DB);
    if (devMarkers.length) {
      console.warn(
        'verify-release-db-policy: dev app.db contains test markers (OK for dev, never bundled)'
      );
    }
  }
}

async function main() {
  assertExtraResourcesPolicy();
  await assertSeedArtifacts();
  console.log('verify-release-db-policy: OK');
}

main().catch((err) => {
  fail(err.message || String(err));
});
