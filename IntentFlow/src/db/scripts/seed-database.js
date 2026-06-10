// src/db/scripts/seed-database.js
/**
 * Production packaging seed — copies schema-only empty-schema.sqlite only.
 * Never copies src/db/data/app.db (development / automation data).
 */
const path = require('path');
const fs = require('fs');
const { assertCleanSeedDatabase } = require('../dbContaminationGuard.cjs');

const EMPTY_SCHEMA = path.join(__dirname, '../data/empty-schema.sqlite');
const PRODUCTION_SEED_DB = path.join(__dirname, '../data/production-seed.db');

function ensureDataDirectory() {
    const dataDir = path.dirname(PRODUCTION_SEED_DB);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log(`📁 Created data directory: ${dataDir}`);
    }
}

async function seedDatabase() {
    console.log('🌱 Production seed (schema-only, no dev app.db)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Empty schema path:', EMPTY_SCHEMA);
    console.log('Production seed path:', PRODUCTION_SEED_DB);

    ensureDataDirectory();

    if (!fs.existsSync(EMPTY_SCHEMA)) {
        console.error(
            `❌ Missing ${EMPTY_SCHEMA}. Run: npm run generate:empty-schema`
        );
        process.exit(1);
    }

    await assertCleanSeedDatabase(EMPTY_SCHEMA, { label: 'empty-schema.sqlite' });

    fs.copyFileSync(EMPTY_SCHEMA, PRODUCTION_SEED_DB);
    await assertCleanSeedDatabase(PRODUCTION_SEED_DB, { label: 'production-seed.db' });

    const seedStats = fs.statSync(PRODUCTION_SEED_DB);
    console.log(`📦 Production seed ready: ${(seedStats.size / 1024).toFixed(2)} KB`);
    console.log('\n🎉 Database seed completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

seedDatabase().catch((err) => {
    console.error(`❌ seed-database failed: ${err.message}`);
    process.exit(1);
});
