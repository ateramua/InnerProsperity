module.exports = async function migrate018CreditCardPaymentSystem(db) {
  const cols = async (table) => db.all(`PRAGMA table_info(${table})`);
  const hasCol = async (table, col) => (await cols(table)).some((c) => c.name === col);

  if (!(await hasCol('category_groups', 'system_managed'))) {
    await db.exec('ALTER TABLE category_groups ADD COLUMN system_managed INTEGER DEFAULT 0');
  }
  if (!(await hasCol('categories', 'is_credit_card_payment_category'))) {
    await db.exec('ALTER TABLE categories ADD COLUMN is_credit_card_payment_category INTEGER DEFAULT 0');
  }
  if (!(await hasCol('categories', 'linked_account_id'))) {
    await db.exec('ALTER TABLE categories ADD COLUMN linked_account_id TEXT');
  }
  if (!(await hasCol('categories', 'archived'))) {
    await db.exec('ALTER TABLE categories ADD COLUMN archived INTEGER DEFAULT 0');
  }
  if (!(await hasCol('categories', 'archived_at'))) {
    await db.exec('ALTER TABLE categories ADD COLUMN archived_at DATETIME');
  }
  if (!(await hasCol('categories', 'restored_at'))) {
    await db.exec('ALTER TABLE categories ADD COLUMN restored_at DATETIME');
  }
  if (!(await hasCol('categories', 'original_group_id'))) {
    await db.exec('ALTER TABLE categories ADD COLUMN original_group_id TEXT');
  }
  if (!(await hasCol('categories', 'is_loan_payment_category'))) {
    await db.exec('ALTER TABLE categories ADD COLUMN is_loan_payment_category INTEGER DEFAULT 0');
  }

  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_categories_cc_link ON categories(user_id, linked_account_id)'
  );
  await db.exec(
    'CREATE INDEX IF NOT EXISTS idx_categories_cc_payment ON categories(user_id, is_credit_card_payment_category)'
  );
};
