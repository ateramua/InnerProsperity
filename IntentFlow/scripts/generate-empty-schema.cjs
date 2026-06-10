#!/usr/bin/env node
/**
 * Build a schema-only SQLite file for production first-run seeding.
 * Never copies src/db/data/app.db (development / test data).
 */
const fs = require('fs');
const path = require('path');
const { initializeDatabase } = require('../src/db/initSchema.cjs');
const { assertCleanSeedDatabase } = require('../src/db/dbContaminationGuard.cjs');

const DATA_DIR = path.join(__dirname, '../src/db/data');
const OUT_PATH = path.join(DATA_DIR, 'empty-schema.sqlite');

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (fs.existsSync(OUT_PATH)) {
    fs.unlinkSync(OUT_PATH);
  }

  const db = await initializeDatabase(OUT_PATH, { injectRecoveryUser: false });
  const { runMigrations } = require('../src/db/migrations/index.cjs');
  await runMigrations(db);
  await db.close();
  await assertCleanSeedDatabase(OUT_PATH, { label: 'empty-schema.sqlite' });

  const stats = fs.statSync(OUT_PATH);
  console.log(
    `generate-empty-schema: OK (${OUT_PATH}, ${(stats.size / 1024).toFixed(1)} KB)`
  );
}

main().catch((err) => {
  console.error('generate-empty-schema: FAILED', err.message);
  process.exit(1);
});
