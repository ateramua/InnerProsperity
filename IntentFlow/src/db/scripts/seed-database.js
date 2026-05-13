// src/db/scripts/seed-database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const SOURCE_DB = path.join(__dirname, '../data/app.db');
const PRODUCTION_SEED_DB = path.join(__dirname, '../data/production-seed.db');

function ensureDataDirectory() {
    const dataDir = path.dirname(PRODUCTION_SEED_DB);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log(`📁 Created data directory: ${dataDir}`);
    }
}

async function createEmptySeedDatabase() {
    return new Promise((resolve, reject) => {
        const db = new sqlite3.Database(PRODUCTION_SEED_DB, (err) => {
            if (err) return reject(err);
            db.close((closeErr) => {
                if (closeErr) return reject(closeErr);
                resolve();
            });
        });
    });
}

async function seedDatabase() {
    console.log('🌱 Starting database seed...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Script location:', __dirname);
    console.log('Source DB path:', SOURCE_DB);
    console.log('Production seed path:', PRODUCTION_SEED_DB);

    ensureDataDirectory();

    if (fs.existsSync(SOURCE_DB)) {
        console.log(`✅ Found source database at: ${SOURCE_DB}`);
        const sourceStats = fs.statSync(SOURCE_DB);
        console.log(`📊 Source database size: ${(sourceStats.size / 1024).toFixed(2)} KB`);

        try {
            fs.copyFileSync(SOURCE_DB, PRODUCTION_SEED_DB);
            console.log(`📋 Copied production seed to: ${PRODUCTION_SEED_DB}`);

            const seedStats = fs.statSync(PRODUCTION_SEED_DB);
            console.log(`📦 Production seed size: ${(seedStats.size / 1024).toFixed(2)} KB`);
        } catch (err) {
            console.error(`❌ Failed to copy seed database: ${err.message}`);
            process.exit(1);
        }
    } else {
        console.warn(`⚠️ Source database not found at: ${SOURCE_DB}`);
        console.log('🛠️ Creating an empty production seed database so packaging can continue.');

        try {
            await createEmptySeedDatabase();
            const seedStats = fs.statSync(PRODUCTION_SEED_DB);
            console.log(`📦 Created empty production seed database: ${(seedStats.size / 1024).toFixed(2)} KB`);
        } catch (err) {
            console.error(`❌ Failed to create empty production seed: ${err.message}`);
            process.exit(1);
        }
    }

    console.log('\n🎉 Database seed completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

seedDatabase();