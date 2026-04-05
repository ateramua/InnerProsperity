// src/db/scripts/seed-database.js
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

// Fix: Go up from src/db/scripts to project root, then to src/db/data/
const SOURCE_DB = path.join(__dirname, '../../db/data/app.db');
// Or absolute path from project root
// const SOURCE_DB = path.join(__dirname, '../../../src/db/data/app.db');

const PRODUCTION_SEED_DB = path.join(__dirname, '../../db/data/production-seed.db');

async function seedDatabase() {
    console.log('🌱 Starting database seed...');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('Script location:', __dirname);
    console.log('Looking for DB at:', SOURCE_DB);
    
    // Check if source database exists
    if (!fs.existsSync(SOURCE_DB)) {
        console.error(`❌ Source database not found at: ${SOURCE_DB}`);
        console.log('\n📝 Please check:');
        console.log('   1. Run npm run dev first to create the database');
        console.log('   2. Verify the database exists at src/db/data/app.db');
        console.log('   3. Current script location:', __dirname);
        process.exit(1);
    }
    
    console.log(`✅ Found source database at: ${SOURCE_DB}`);
    
    // Get source database stats
    const sourceStats = fs.statSync(SOURCE_DB);
    console.log(`📊 Source database size: ${(sourceStats.size / 1024).toFixed(2)} KB`);
    
    // Create a copy for production seeding
    try {
        fs.copyFileSync(SOURCE_DB, PRODUCTION_SEED_DB);
        console.log(`📋 Copied to production seed: ${PRODUCTION_SEED_DB}`);
        
        const seedStats = fs.statSync(PRODUCTION_SEED_DB);
        console.log(`📦 Production seed size: ${(seedStats.size / 1024).toFixed(2)} KB`);
    } catch (err) {
        console.error(`❌ Failed to copy seed database: ${err.message}`);
        process.exit(1);
    }
    
    console.log('\n🎉 Database seed completed successfully!');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

seedDatabase();