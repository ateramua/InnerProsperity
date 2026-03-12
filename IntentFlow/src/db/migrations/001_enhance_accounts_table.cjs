// src/db/migrations/001_enhance_accounts_table.cjs
async function migrate(db) {
    console.log('📁 Running migration: 001_enhance_accounts_table');
    try {
        await db.exec('BEGIN TRANSACTION');

        const tableCheck = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'");
        if (!tableCheck) throw new Error('Accounts table does not exist. Run base migration first.');

        const tableInfo = await db.all("PRAGMA table_info(accounts)");
        const existingColumns = tableInfo.map(col => col.name);

        const columnsToAdd = [
            { name: 'account_type_category', type: 'TEXT DEFAULT "budget"' },
            { name: 'cleared_balance', type: 'REAL DEFAULT 0' },
            { name: 'working_balance', type: 'REAL DEFAULT 0' },
            { name: 'credit_limit', type: 'REAL' },
            { name: 'interest_rate', type: 'REAL' },
            { name: 'due_date', type: 'DATE' },
            { name: 'minimum_payment', type: 'REAL' }
        ];

        for (const col of columnsToAdd) {
            if (!existingColumns.includes(col.name)) {
                console.log(`➕ Adding column: ${col.name}`);
                await db.exec(`ALTER TABLE accounts ADD COLUMN ${col.name} ${col.type}`);
            }
        }

        await db.exec(`
            UPDATE accounts 
            SET account_type_category = CASE 
                WHEN type IN ('checking','savings','cash','credit') THEN 'budget'
                WHEN type IN ('investment','mortgage','loan','asset') THEN 'tracking'
                ELSE 'budget'
            END
            WHERE account_type_category IS NULL
        `);

        await db.exec(`
            UPDATE accounts 
            SET working_balance = balance,
                cleared_balance = balance
            WHERE working_balance IS NULL
        `);

        await db.exec('COMMIT');
        console.log('✅ Migration 001_enhance_accounts_table completed');
    } catch (err) {
        await db.exec('ROLLBACK');
        console.error('❌ Migration failed:', err);
        throw err;
    }
}

module.exports = migrate;