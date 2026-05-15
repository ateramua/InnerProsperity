/** Plaid product gaps: category backfill key + balance lock */
module.exports = async function migrate017(db) {
  const txCols = await db.all('PRAGMA table_info(transactions)');
  const txNames = new Set(txCols.map((c) => c.name));
  if (!txNames.has('plaid_category_key')) {
    await db.exec(`ALTER TABLE transactions ADD COLUMN plaid_category_key TEXT`);
    console.log('➕ Added transactions.plaid_category_key');
  }
  await db.exec(
    `CREATE INDEX IF NOT EXISTS idx_transactions_plaid_category_key
     ON transactions(user_id, plaid_category_key)
     WHERE plaid_category_key IS NOT NULL AND plaid_transaction_id IS NOT NULL`
  );

  const accCols = await db.all('PRAGMA table_info(accounts)');
  const accNames = new Set(accCols.map((c) => c.name));
  if (!accNames.has('balance_locked')) {
    await db.exec(`ALTER TABLE accounts ADD COLUMN balance_locked INTEGER NOT NULL DEFAULT 0`);
    console.log('➕ Added accounts.balance_locked');
  }
};
