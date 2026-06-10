#!/usr/bin/env node
const assert = require('assert');
const path = require('path');
const runtimeProfile = require('../src/db/runtimeProfile.cjs');
const { scanFileForTestMarkers } = require('../src/db/dbContaminationGuard.cjs');

const root = path.join(__dirname, '..');

assert.strictEqual(
  runtimeProfile.resolveRuntimeProfile({ isPackaged: true }),
  'production'
);
assert.strictEqual(
  runtimeProfile.resolveRuntimeProfile({ isPackaged: false }),
  'development'
);

process.env.INTENTFLOW_RUNTIME_PROFILE = 'test';
assert.strictEqual(
  runtimeProfile.resolveRuntimeProfile({ isPackaged: false }),
  'test'
);
delete process.env.INTENTFLOW_RUNTIME_PROFILE;

const prodPath = '/Users/me/Library/Application Support/intentflow/money-manager.db';
const devPath = path.join(root, 'src/db/data/app.db');
assert(runtimeProfile.isProductionDatabasePath(prodPath));
assert(!runtimeProfile.isProductionDatabasePath(devPath));
assert(runtimeProfile.isDevelopmentDatabasePath(devPath));

assert.throws(() => {
  runtimeProfile.assertDbPathAllowedForProfile('development', prodPath);
});

const bdd = runtimeProfile.assertProductionEntityNameAllowed('BDD-S02 Checking', {
  field: 'account name',
});
assert.strictEqual(bdd.ok, false);

const emptySchema = path.join(root, 'src/db/data/empty-schema.sqlite');
const fs = require('fs');
if (fs.existsSync(emptySchema)) {
  const markers = scanFileForTestMarkers(emptySchema);
  assert.strictEqual(markers.length, 0, 'empty-schema must not contain BDD markers');
}

console.log('test-db-environment-isolation: OK');
