// scripts/migrate-existing-transfers.js
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const fs = require('fs');
const crypto = require('crypto');

async function migrate() {
    const dbPath = process.argv[2];
    
    if (!dbPath) {
        console.error('❌ Please provide database path');
        console.log('Usage: node scripts/migrate-existing-transfers.js <database-path>');
        process.exit(1);
    }
    
    if (!fs.existsSync(dbPath)) {
        console.error(`❌ Database file not found at: ${dbPath}`);
        process.exit(1);
    }
    
    console.log(`📂 Database path: ${dbPath}`);
    
    let db = null;
    
    try {
        db = await open({ filename: dbPath, driver: sqlite3.Database });
        console.log('✅ Connected to database');
        
        // Check if transactions table exists
        const tableCheck = await db.get(`
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name='transactions'
        `);
        
        if (!tableCheck) {
            console.error('❌ Transactions table does not exist');
            return;
        }
        
        // Check current columns
        const columns = await db.all(`PRAGMA table_info(transactions)`);
        const columnNames = columns.map(c => c.name);
        console.log('📋 Existing columns:', columnNames.join(', '));
        
        // Add missing transfer columns if needed
        const transferColumns = ['is_transfer', 'transfer_group_id', 'linked_transaction_id', 'counterparty_account_id'];
        for (const col of transferColumns) {
            if (!columnNames.includes(col)) {
                try {
                    const colType = col === 'is_transfer' ? 'INTEGER DEFAULT 0' : 'TEXT';
                    await db.run(`ALTER TABLE transactions ADD COLUMN ${col} ${colType}`);
                    console.log(`   ✅ Added column: ${col}`);
                } catch (err) {
                    console.log(`   ⚠️ Could not add ${col}: ${err.message}`);
                }
            }
        }
        
        // Add common columns if missing
        const commonColumns = ['user_id', 'payee', 'description', 'category_id', 'memo', 'is_cleared', 'created_at'];
        for (const col of commonColumns) {
            if (!columnNames.includes(col)) {
                try {
                    let colType = 'TEXT';
                    if (col === 'user_id') colType = 'INTEGER';
                    if (col === 'is_cleared') colType = 'INTEGER DEFAULT 0';
                    if (col === 'created_at') colType = 'DATETIME DEFAULT CURRENT_TIMESTAMP';
                    await db.run(`ALTER TABLE transactions ADD COLUMN ${col} ${colType}`);
                    console.log(`   ✅ Added column: ${col}`);
                } catch (err) {
                    console.log(`   ⚠️ Could not add ${col}: ${err.message}`);
                }
            }
        }
        
        // Check if we have payee or description for migration
        const hasPayee = columnNames.includes('payee');
        const hasDesc = columnNames.includes('description');
        
        if (!hasPayee && !hasDesc) {
            console.log('⚠️ No payee or description column. Skipping transfer detection.');
            console.log('✅ Schema update complete');
            return;
        }
        
        // Use payee or description field
        const textField = hasPayee ? 'payee' : 'description';
        
        // Find potential transfers
        console.log(`\n🔍 Looking for transfers in ${textField} field...`);
        
        const potentialTransfers = await db.all(`
            SELECT id, account_id, amount, date, user_id, ${textField} as text_value
            FROM transactions 
            WHERE ${textField} LIKE 'Transfer:%'
            AND (is_transfer IS NULL OR is_transfer = 0)
        `);
        
        console.log(`Found ${potentialTransfers.length} potential transfers`);
        
        let migratedCount = 0;
        
        for (const tx of potentialTransfers) {
            const destName = tx.text_value?.replace('Transfer:', '').trim();
            if (!destName) continue;
            
            const destAccount = await db.get(
                `SELECT id, name FROM accounts WHERE name LIKE ?`,
                [`%${destName}%`]
            );
            
            if (!destAccount) {
                console.log(`   ⚠️ No account found for: ${destName}`);
                continue;
            }
            
            const transferGroupId = crypto.randomUUID();
            
            // Update source transaction
            await db.run(`
                UPDATE transactions 
                SET is_transfer = 1, 
                    transfer_group_id = ?,
                    counterparty_account_id = ?
                WHERE id = ?
            `, [transferGroupId, destAccount.id, tx.id]);
            
            migratedCount++;
            console.log(`   ✅ Marked as transfer: ${tx.id} -> ${destAccount.name}`);
        }
        
        const finalCount = await db.get(`
            SELECT COUNT(*) as count FROM transactions WHERE is_transfer = 1
        `);
        
        console.log(`\n📊 Migration Summary:`);
        console.log(`   Transfers marked: ${migratedCount}`);
        console.log(`   Total transfers in DB: ${finalCount.count}`);
        console.log('\n✅ Migration complete!');
        
    } catch (error) {
        console.error('❌ Migration error:', error.message);
    } finally {
        if (db) {
            try {
                await db.close();
                console.log('🔒 Database connection closed');
            } catch (err) {
                console.log('⚠️ Error closing database:', err.message);
            }
        }
    }
}

migrate().catch(console.error);