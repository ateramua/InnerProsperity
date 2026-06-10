// src/db/migrations/index.cjs
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
// Add this near the top with your other requires
// const { app } = require('electron'); // Commented out to avoid requiring electron when not needed

async function columnExists(db, tableName, columnName) {
    const columns = await db.all(`PRAGMA table_info(${tableName})`);
    return columns.some(col => col.name === columnName);
}

function isSqlBoundaryChar(ch) {
    return ch === undefined || /[\s;,()]/.test(ch);
}

function matchesSqlKeyword(sql, index, keyword) {
    const slice = sql.slice(index, index + keyword.length);
    if (slice.toUpperCase() !== keyword.toUpperCase()) {
        return false;
    }
    const before = index > 0 ? sql[index - 1] : ' ';
    const after = sql[index + keyword.length];
    return isSqlBoundaryChar(before) && isSqlBoundaryChar(after);
}

/**
 * Split SQL migration scripts without breaking CREATE TRIGGER ... BEGIN ... END bodies.
 */
function splitMigrationSqlStatements(sql) {
    const statements = [];
    let current = '';
    let beginDepth = 0;
    let inSingle = false;
    let inDouble = false;

    for (let i = 0; i < sql.length; i += 1) {
        const ch = sql[i];

        if (!inSingle && !inDouble && ch === '-' && sql[i + 1] === '-') {
            while (i < sql.length && sql[i] !== '\n') {
                current += sql[i];
                i += 1;
            }
            if (i < sql.length) {
                current += sql[i];
            }
            continue;
        }

        if (ch === "'" && !inDouble) {
            if (inSingle && sql[i + 1] === "'") {
                current += "''";
                i += 1;
                continue;
            }
            inSingle = !inSingle;
            current += ch;
            continue;
        }

        if (ch === '"' && !inSingle) {
            inDouble = !inDouble;
            current += ch;
            continue;
        }

        if (!inSingle && !inDouble) {
            if (matchesSqlKeyword(sql, i, 'BEGIN')) {
                beginDepth += 1;
            } else if (beginDepth > 0 && matchesSqlKeyword(sql, i, 'END')) {
                beginDepth -= 1;
            }
        }

        if (ch === ';' && !inSingle && !inDouble && beginDepth === 0) {
            const trimmed = current.trim();
            if (trimmed) {
                statements.push(trimmed);
            }
            current = '';
            continue;
        }

        current += ch;
    }

    const tail = current.trim();
    if (tail) {
        statements.push(tail);
    }

    return statements;
}

async function executeMigrationSql(db, sql) {
    const statements = splitMigrationSqlStatements(sql);

    for (const statement of statements) {
        const cleanedStatement = statement.replace(/--.*$/gm, '').trim();
        if (!cleanedStatement) {
            continue;
        }

        const alterMatch = cleanedStatement.match(/^\s*ALTER\s+TABLE\s+([`"']?[^`"'\s]+[`"']?)\s+ADD\s+COLUMN\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"']?[^`"'\s]+[`"']?)\s+(.+)$/i);
        if (alterMatch) {
            const tableName = alterMatch[1].replace(/^[`"']|[`"']$/g, '');
            const columnName = alterMatch[2].replace(/^[`"']|[`"']$/g, '');
            const columnDefinition = alterMatch[3].trim();

            if (await columnExists(db, tableName, columnName)) {
                console.log(`⏭️  Skipping existing column ${tableName}.${columnName}`);
                continue;
            }

            const defaultMatch = columnDefinition.match(/\bDEFAULT\s+(.+)$/i);
            if (defaultMatch) {
                const defaultExpression = defaultMatch[1].trim();
                const isConstantDefault = /^('(?:[^']*)'|\d+(?:\.\d+)?|NULL)$/i.test(defaultExpression);

                if (!isConstantDefault) {
                    console.log(`⚠️  Rewriting dynamic default for ${tableName}.${columnName}`);
                    const definitionWithoutDefault = columnDefinition.replace(/\s+DEFAULT\s+(.+)$/i, '').trim();
                    await db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definitionWithoutDefault}`);
                    await db.exec(`UPDATE ${tableName} SET ${columnName} = ${defaultExpression} WHERE ${columnName} IS NULL`);
                    continue;
                }
            }
        }

        await db.exec(cleanedStatement);
    }
}

async function runMigrations(existingDb) {
    let db = existingDb;
    let shouldCloseDb = false;
    
    // If no database provided, create one (for CLI usage)
    if (!db) {
        const dbPath = path.join(__dirname, '..', 'data', 'app.db');
        console.log('🚀 Starting IntentFlow migrations...');
        console.log('📂 Database path:', dbPath);

        // Ensure the data directory exists
        const dataDir = path.join(__dirname, '..', 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
            console.log('📁 Created data directory');
        }

        db = await open({
            filename: dbPath,
            driver: sqlite3.Database
        });
        shouldCloseDb = true;
    } else {
        console.log('🚀 Running migrations on existing database connection...');
    }

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
            '009_fix_account_summary_view.sql',
            '010_add_check_number.sql',
            '011_add_user_password_columns.sql',
            '012_add_account_profile_columns.cjs',
            '013_plaid_integration.cjs',
            '014_add_transaction_transfer_columns.cjs',
            '015_plaid_phase3.cjs',
            '016_plaid_consent.cjs',
            '017_plaid_product_gaps.cjs',
            '018_credit_card_payment_system.cjs',
            '019_preserve_archived_category_group.cjs',
            '020_category_goal_frequency.cjs',
            '021_plaid_account_dismissals.cjs',
            '022_account_merge_framework.cjs',
            '023_import_category_mappings.cjs',
            '024_account_balance_engine.cjs',
            '025_transactions_cleared_column.cjs',
            '026_transactions_is_flagged.cjs',
            '027_import_category_mappings_institution.cjs',
            '028_budget_assignment_audit.cjs',
            '029_transaction_categorization.cjs',
            '030_category_ml_models.cjs',
            '031_payee_category_learning.cjs',
            '032_forecast_shares_and_prefs.cjs',
            '033_accounts_hidden_carryover.cjs',
            '034_user_budget_pool.cjs',
            '035_repair_category_group_ids.cjs',
        ];

        for (const migration of migrations) {
            if (executedNames.has(migration)) {
                console.log(`⏭️  Skipping ${migration} (already executed)`);
                continue;
            }

            console.log(`📦 Running migration: ${migration}`);

            try {
                const migrationPath = path.join(__dirname, migration);
                if (!fs.existsSync(migrationPath)) {
                    throw new Error(`Migration file not found: ${migrationPath}`);
                }

                if (migration.endsWith('.sql')) {
                    // Run SQL migration with idempotent column additions
                    const sql = fs.readFileSync(migrationPath, 'utf8');
                    await executeMigrationSql(db, sql);
                } else {
                    // Run JS migration
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
        if (shouldCloseDb) {
            await db.close();
        }
    }
}

if(require.main === module) {

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
}

// At the very bottom of the file, add:
module.exports = { runMigrations, splitMigrationSqlStatements, executeMigrationSql };