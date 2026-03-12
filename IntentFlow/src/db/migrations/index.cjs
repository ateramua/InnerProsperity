// src/db/migrations/index.cjs
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

async function runMigrations() {
    const dbPath = path.join(__dirname, '..', 'data', 'app.db');
    console.log('🚀 Starting IntentFlow migrations...');
    console.log('📂 Database path:', dbPath);

    // Ensure the data directory exists
    const dataDir = path.join(__dirname, '..', 'data');
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
        console.log('📁 Created data directory');
    }

    const db = await open({
        filename: dbPath,
        driver: sqlite3.Database
    });

    try {
        // Enable foreign keys
        await db.exec('PRAGMA foreign_keys = OFF');

        // Create migrations tracking table
        await db.exec(`
            CREATE TABLE IF NOT EXISTS migrations (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                executed_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Get executed migrations
        const executed = await db.all('SELECT name FROM migrations ORDER BY name');
        const executedNames = new Set(executed.map(e => e.name));

        // Migration files in correct order
        const migrations = [
            '000_create_base_tables.sql',
            '001_enhance_accounts_table.cjs',
            '002_add_category_groups.sql',
            '003_enhance_categories.cjs',
            '004_create_credit_tables.sql',
            '005_create_reconciliation_tables.sql',
            '006_create_monthly_budgets.sql',
            '007_create_account_history.sql',
            '008_create_triggers_and_views.sql',
            '009_fix_account_summary_view.sql'
        ];

        for (const migration of migrations) {
            if (executedNames.has(migration)) {
                console.log(`⏭️  Skipping ${migration} (already executed)`);
                continue;
            }

            console.log(`📦 Running migration: ${migration}`);

            try {
                if (migration.endsWith('.sql')) {
                    // Run SQL migration
                    const sqlPath = path.join(__dirname, migration);
                    if (!fs.existsSync(sqlPath)) {
                        throw new Error(`Migration file not found: ${sqlPath}`);
                    }
                    const sql = fs.readFileSync(sqlPath, 'utf8');
                    await db.exec(sql);
                } else {
                    // Run JS migration
                    const migrationPath = path.join(__dirname, migration);
                    if (!fs.existsSync(migrationPath)) {
                        throw new Error(`Migration file not found: ${migrationPath}`);
                    }
                    const migrationModule = require(migrationPath);
                    await migrationModule(db);
                }

                // Record migration
                await db.run('INSERT INTO migrations (name) VALUES (?)', migration);
                console.log(`✅ Completed: ${migration}`);
            } catch (migrationError) {
                console.error(`❌ Error in migration ${migration}:`, migrationError);
                throw migrationError;
            }
        }

        // Re-enable foreign keys
        await db.exec('PRAGMA foreign_keys = ON');

        console.log('🎉 All migrations completed successfully!');

        // Show final tables
        const tables = await db.all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
        console.log('\n📊 Final tables in database:');
        tables.forEach(t => console.log(`   - ${t.name}`));

        // Show migration history
        const migrationHistory = await db.all('SELECT * FROM migrations ORDER BY executed_at');
        console.log('\n📋 Migration history:');
        migrationHistory.forEach(m => console.log(`   - ${m.name} (${m.executed_at})`));

    } catch (error) {
        console.error('❌ Migration failed:', error);
        throw error;
    } finally {
        await db.close();
    }
}

// Handle reset flag
if (process.argv.includes('--reset')) {
    console.log('⚠️  Reset flag detected. This will drop all user tables!');
    console.log('Press Ctrl+C to cancel, or wait 5 seconds to continue...');

    setTimeout(async () => {
        const dbPath = path.join(__dirname, '..', 'data', 'app.db');

        // Check if database exists
        if (!fs.existsSync(dbPath)) {
            console.log('📂 No database file found. Nothing to reset.');
            process.exit(0);
        }

        const db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });

        try {
            // Disable foreign keys temporarily
            await db.exec('PRAGMA foreign_keys = OFF');

            // Get all user tables (exclude sqlite_ system tables)
            const tables = await db.all(`
                SELECT name FROM sqlite_master 
                WHERE type='table' 
                AND name NOT LIKE 'sqlite_%'
                AND name != 'migrations'
            `);

            console.log(`\n🗑️  Dropping ${tables.length} user tables...`);

            // Drop each table
            for (const table of tables) {
                try {
                    await db.exec(`DROP TABLE IF EXISTS ${table.name}`);
                    console.log(`   ✅ Dropped: ${table.name}`);
                } catch (dropError) {
                    console.log(`   ⚠️  Could not drop ${table.name}: ${dropError.message}`);
                }
            }

            // Clear migrations table but keep the table itself
            await db.exec('DELETE FROM migrations');
            console.log('\n🗑️  Cleared migrations history');

            // Re-enable foreign keys
            await db.exec('PRAGMA foreign_keys = ON');

            // Vacuum to reclaim space
            await db.exec('VACUUM');

            console.log('\n✅ Reset complete! Database is clean.');
            console.log('👉 Run "npm run migrate" to recreate all tables.');

        } catch (error) {
            console.error('❌ Reset failed:', error);
        } finally {
            await db.close();
        }
    }, 5000);
} else {
    runMigrations()
        .then(() => process.exit(0))
        .catch(() => process.exit(1));
}