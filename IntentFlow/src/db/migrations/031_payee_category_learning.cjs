/**
 * Payee category learning settings and rule-change audit (FR-2, FR-8).
 */

async function tableExists(db, tableName) {
  const row = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [tableName]
  );
  return !!row;
}

module.exports = async function migration031(db) {
  console.log('   Payee category learning settings & audit…');

  if (!(await tableExists(db, 'user_settings'))) {
    await db.exec(`
      CREATE TABLE user_settings (
        user_id INTEGER NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT DEFAULT (datetime('now')),
        PRIMARY KEY (user_id, key)
      );
    `);
    console.log('   + user_settings');
  }

  if (!(await tableExists(db, 'payee_category_rule_audit'))) {
    await db.exec(`
      CREATE TABLE payee_category_rule_audit (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        payee_id TEXT NOT NULL,
        previous_category_id TEXT,
        new_category_id TEXT,
        change_source TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_payee_rule_audit_user
        ON payee_category_rule_audit(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_payee_rule_audit_payee
        ON payee_category_rule_audit(payee_id);
    `);
    console.log('   + payee_category_rule_audit');
  }

  /* Spec name alias — category_rules is the canonical table (FR-2). */
  await db.exec(`
    CREATE VIEW IF NOT EXISTS payee_category_rules AS
    SELECT
      id,
      user_id,
      payee_id,
      default_category_id AS category_id,
      confidence_score,
      confirmation_count AS transaction_count,
      created_at,
      updated_at
    FROM category_rules;
  `);
};
