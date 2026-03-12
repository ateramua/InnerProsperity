// run_migration.cjs
const sqlite3 = require('sqlite3');
const fs = require('fs');
const path = require('path');

async function runMigration() {
    const dbPath = "/Users/macnifient/Library/Application Support/IntentFlow/money-manager.db";
    const migrationsDir = __dirname; // This folder contains all your migrations

    // Open database
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error('❌ Failed to open database:', err);
            process.exit(1);
        }
    });

    // Promisify db methods
    const exec = (sql) => new Promise((resolve, reject) => db.exec(sql, (err) => err ? reject(err) : resolve()));
    const all = (sql) => new Promise((resolve, reject) => db.all(sql, (err, rows) => err ? reject(err) : resolve(rows)));
    const get = (sql) => new Promise((resolve, reject) => db.get(sql, (err, row) => err ? reject(err) : resolve(row)));

    try {
        console.log('📂 Enabling foreign keys');
        await exec('PRAGMA foreign_keys = ON');

        // Get all files in migrations folder
        let files = fs.readdirSync(migrationsDir)
            .filter(f => f.match(/^\d+.*\.(sql|cjs)$/))
            .sort(); // alphabetical/numerical order

        for (const file of files) {
            const fullPath = path.join(migrationsDir, file);
            console.log(`\n📁 Running migration: ${file}`);

            if (file.endsWith('.sql')) {
                const sql = fs.readFileSync(fullPath, 'utf8');
                try {
                    await exec('BEGIN TRANSACTION');
                    await exec(sql);
                    await exec('COMMIT');
                    console.log(`✅ Migration completed for file: ${file}`);
                } catch (err) {
                    await exec('ROLLBACK');
                    console.error(`❌ Migration failed for file: ${file}`, err);
                    throw err;
                }
            } else if (file.endsWith('.cjs')) {
                const migrate = require(fullPath);
                try {
                    await migrate(db);
                } catch (err) {
                    console.error(`❌ JS Migration failed: ${file}`, err);
                    throw err;
                }
            }
        }

        console.log('\n🎉 All migrations completed successfully!');
    } catch (err) {
        console.error('❌ Migration process stopped due to error:', err);
        process.exit(1);
    } finally {
        db.close();
    }
}

runMigration().catch(console.error);