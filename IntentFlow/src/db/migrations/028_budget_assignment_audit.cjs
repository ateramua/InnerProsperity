/**
 * Audit log for category assignment changes (global Ready to Assign model).
 */
module.exports = async function migration028(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS budget_assignment_audit (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      category_id TEXT NOT NULL,
      month TEXT NOT NULL,
      previous_assigned REAL NOT NULL DEFAULT 0,
      new_assigned REAL NOT NULL DEFAULT 0,
      amount_changed REAL NOT NULL DEFAULT 0,
      source TEXT,
      metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_budget_assignment_audit_user_created
      ON budget_assignment_audit(user_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_budget_assignment_audit_category_month
      ON budget_assignment_audit(category_id, month);
  `);
};
