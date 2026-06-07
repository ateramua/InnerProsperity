const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const crypto = require('crypto');
const fs = require('fs');

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex');
  return { salt, hash };
}

async function ensureSchema(db) {
  console.log('🔧 Ensuring database schema exists...');

  await db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE,
      password_hash TEXT,
      password_salt TEXT,
      full_name TEXT,
      avatar_color TEXT,
      is_active INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_login DATETIME
    );

    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      balance REAL DEFAULT 0,
      initial_balance REAL DEFAULT 0,
      cleared_balance REAL DEFAULT 0,
      working_balance REAL DEFAULT 0,
      account_type_category TEXT DEFAULT 'budget',
      currency TEXT DEFAULT 'USD',
      institution TEXT,
      credit_limit REAL,
      interest_rate REAL,
      due_date DATE,
      minimum_payment REAL,
      original_balance REAL,
      term_months INTEGER,
      payment_amount REAL,
      payment_frequency TEXT DEFAULT 'monthly',
      next_payment_date DATE,
      account_number TEXT,
      routing_number TEXT,
      debit_card_number TEXT,
      daily_withdrawal_limit REAL,
      overdraft_protection INTEGER DEFAULT 0,
      account_holder_name TEXT,
      loan_type TEXT,
      paired_category_id TEXT,
      rewards_program TEXT,
      transfer_limit REAL,
      linked_savings_account TEXT,
      notes TEXT,
      is_active INTEGER DEFAULT 1,
      account_status TEXT NOT NULL DEFAULT 'active',
      merged_into_account_id TEXT,
      merged_at TEXT,
      merge_session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      is_hidden INTEGER DEFAULT 0,
      is_credit_card_payment_category INTEGER DEFAULT 0,
      is_loan_payment_category INTEGER DEFAULT 0,
      linked_account_id TEXT,
      group_id TEXT,
      original_group_id TEXT,
      original_group_name TEXT,
      target_type TEXT,
      target_frequency TEXT DEFAULT 'monthly',
      target_amount REAL,
      target_date DATE,
      assigned REAL DEFAULT 0,
      activity REAL DEFAULT 0,
      available REAL DEFAULT 0,
      priority INTEGER DEFAULT 2,
      last_month_assigned REAL DEFAULT 0,
      average_spending REAL DEFAULT 0,
      archived INTEGER DEFAULT 0,
      archived_at DATETIME,
      restored_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS category_groups (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      sort_order INTEGER DEFAULT 0,
      is_hidden INTEGER DEFAULT 0,
      system_managed INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      date DATE NOT NULL,
      description TEXT,
      amount REAL NOT NULL,
      direction TEXT CHECK(direction IN ('inflow','outflow') OR direction IS NULL),
      category_id TEXT,
      payee TEXT,
      memo TEXT,
      is_cleared INTEGER DEFAULT 0,
      cleared INTEGER DEFAULT 0,
      is_system INTEGER DEFAULT 0,
      is_adjustment INTEGER DEFAULT 0,
      is_reconciled INTEGER DEFAULT 0,
      is_flagged INTEGER DEFAULT 0,
      is_transfer INTEGER DEFAULT 0,
      transfer_group_id TEXT,
      linked_transaction_id TEXT,
      counterparty_account_id TEXT,
      transfer_account_id TEXT,
      import_id TEXT,
      check_number TEXT,
      plaid_transaction_id TEXT UNIQUE,
      plaid_category_key TEXT,
      is_deleted INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS scheduled_transactions (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      date TEXT NOT NULL,
      payee TEXT NOT NULL,
      amount REAL NOT NULL,
      transaction_type TEXT NOT NULL,
      category_id TEXT,
      memo TEXT,
      user_id INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS forecast_shares (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      payload TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      expires_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS forecast_recurring_prefs (
      user_id INTEGER NOT NULL,
      recurring_id TEXT NOT NULL,
      status TEXT NOT NULL,
      override_json TEXT,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, recurring_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      executed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      description TEXT
    );

    CREATE TABLE IF NOT EXISTS plaid_items (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      access_token TEXT NOT NULL,
      institution_id TEXT,
      institution_name TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      last_sync DATETIME,
      cursor TEXT,
      consent_expires_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS plaid_accounts (
      plaid_account_id TEXT PRIMARY KEY,
      item_id TEXT NOT NULL,
      account_id TEXT,
      mask TEXT,
      name TEXT,
      official_name TEXT,
      type TEXT,
      subtype TEXT,
      fingerprint TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (item_id) REFERENCES plaid_items(id),
      FOREIGN KEY (account_id) REFERENCES accounts(id)
    );

    CREATE TABLE IF NOT EXISTS account_merge_sessions (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      survivor_account_id TEXT NOT NULL,
      merged_account_id TEXT NOT NULL,
      plaid_account_id TEXT,
      confidence_score INTEGER,
      initiated_by TEXT,
      pre_merge_snapshot TEXT,
      post_merge_snapshot TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      rolled_back_at TEXT
    );

    CREATE TABLE IF NOT EXISTS plaid_category_mappings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plaid_category TEXT NOT NULL,
      category_id TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES categories(id),
      UNIQUE(user_id, plaid_category)
    );

    CREATE TABLE IF NOT EXISTS import_category_mappings (
      user_id INTEGER NOT NULL,
      institution_key TEXT NOT NULL DEFAULT '',
      bank_category TEXT NOT NULL,
      category_id TEXT,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_id, institution_key, bank_category),
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    CREATE TABLE IF NOT EXISTS user_settings (
      user_id INTEGER NOT NULL,
      key TEXT NOT NULL,
      value TEXT,
      updated_at DATETIME,
      PRIMARY KEY (user_id, key),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS reconciliations (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      reconciliation_date DATE NOT NULL,
      statement_balance REAL NOT NULL,
      calculated_balance REAL NOT NULL,
      difference REAL,
      status TEXT DEFAULT 'pending',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS reconciliation_entries (
      id TEXT PRIMARY KEY,
      reconciliation_id TEXT NOT NULL,
      transaction_id TEXT NOT NULL,
      FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
      UNIQUE(reconciliation_id, transaction_id)
    );

    CREATE TABLE IF NOT EXISTS monthly_budgets (
      id TEXT PRIMARY KEY,
      category_id TEXT NOT NULL,
      month DATE NOT NULL,
      budgeted_amount REAL DEFAULT 0,
      activity_amount REAL DEFAULT 0,
      available_amount REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE,
      UNIQUE(category_id, month)
    );

    CREATE TABLE IF NOT EXISTS account_balance_history (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      balance REAL NOT NULL,
      date DATE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
      UNIQUE(account_id, date)
    );

    CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
    CREATE INDEX IF NOT EXISTS idx_category_groups_user ON category_groups(user_id);
    CREATE INDEX IF NOT EXISTS idx_plaid_items_user_id ON plaid_items(user_id);
    CREATE INDEX IF NOT EXISTS idx_plaid_category_mappings_user_id ON plaid_category_mappings(user_id);
    CREATE INDEX IF NOT EXISTS idx_import_category_mappings_user_id ON import_category_mappings(user_id);
    CREATE INDEX IF NOT EXISTS idx_import_category_mappings_institution
      ON import_category_mappings(user_id, institution_key);
    CREATE INDEX IF NOT EXISTS idx_monthly_budgets_category_id ON monthly_budgets(category_id);
    CREATE INDEX IF NOT EXISTS idx_monthly_budgets_month ON monthly_budgets(month);
  `);

  console.log('✅ Database schema ensured');
}

async function injectTemporaryRecoveryUser(db) {
  console.log('🔐 Checking temporary recovery credentials...');
  const existingUser = await db.get(
    'SELECT id FROM users WHERE username = ? OR email = ?',
    ['teramua', 'teramua@example.com']
  );

  if (existingUser) {
    console.log('✅ Temporary recovery user already exists, skipping injection');
    return false;
  }

  const { salt, hash } = hashPassword('test');

  await db.run(
    `INSERT INTO users (username, email, password_hash, password_salt, full_name, avatar_color, is_active)
     VALUES (?, ?, ?, ?, ?, ?, 1)`,
    ['teramua', 'teramua@example.com', hash, salt, 'Recovery User', '#8B5CF6']
  );

  console.log('✅ Temporary recovery user injected: teramua / test');
  return true;
}

async function initializeDatabase(dbPath, options = {}) {
  const dbPathExists = fs.existsSync(dbPath);
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec('PRAGMA foreign_keys = ON');

  let hasSchema = false;
  try {
    const row = await db.get(
      "SELECT count(*) AS count FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
    );
    hasSchema = row && row.count > 0;
  } catch (schemaCheckError) {
    console.warn('⚠️ Failed to check existing schema, creating schema from scratch:', schemaCheckError.message);
  }

  if (!dbPathExists || !hasSchema) {
    console.log('🆕 Creating fresh database schema');
    await ensureSchema(db);
  } else {
    console.log('🔧 Existing database detected, running migrations if needed');
    const runMigrations = require('./migrations/index.cjs').runMigrations;
    await runMigrations(db);
  }

  if (options.injectRecoveryUser) {
    await injectTemporaryRecoveryUser(db);
  }

  return db;
}

module.exports = {
  ensureSchema,
  injectTemporaryRecoveryUser,
  initializeDatabase,
  hashPassword
};
