// src/db/migrations/003_enhance_categories.cjs
async function migrate(db) {
    console.log('📁 Running migration: 003_enhance_categories');
    
    try {
        await db.exec('BEGIN TRANSACTION');

        // Check existing columns in categories table
        const tableInfo = await db.all("PRAGMA table_info(categories)");
        const existingColumns = tableInfo.map(col => col.name);
        console.log('📋 Existing category columns:', existingColumns);

        // Columns to add to categories table
        const columnsToAdd = [
            { name: 'group_id', type: 'TEXT' },
            { name: 'target_type', type: 'TEXT' },
            { name: 'target_amount', type: 'REAL' },
            { name: 'target_date', type: 'DATE' }
        ];

        for (const col of columnsToAdd) {
            if (!existingColumns.includes(col.name)) {
                try {
                    console.log(`➕ Adding column: ${col.name}`);
                    await db.exec(`ALTER TABLE categories ADD COLUMN ${col.name} ${col.type}`);
                } catch (err) {
                    console.log(`⚠️  Could not add ${col.name}: ${err.message}`);
                }
            }
        }

        // Add foreign key constraint for group_id (SQLite doesn't support adding FK constraints easily)
        // We'll handle this at the application level for now

        await db.exec('COMMIT');
        console.log('✅ Categories enhancement completed');

    } catch (error) {
        await db.exec('ROLLBACK');
        console.error('❌ Categories enhancement failed:', error);
        throw error;
    }
}

module.exports = migrate;