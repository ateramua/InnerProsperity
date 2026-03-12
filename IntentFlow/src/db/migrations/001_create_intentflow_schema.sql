-- src/db/migrations/001_create_intentflow_schema.sql
-- Enhanced IntentFlow schema (idempotent)

-- 1. ACCOUNTS TABLE - add missing columns
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_type_category TEXT DEFAULT 'budget';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS cleared_balance REAL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS working_balance REAL DEFAULT 0;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS credit_limit REAL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS interest_rate REAL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS due_date DATE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS minimum_payment REAL;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS account_number TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS routing_number TEXT;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_synced DATETIME;

-- 2. CATEGORY GROUPS
CREATE TABLE IF NOT EXISTS category_groups (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    sort_order INTEGER,
    is_hidden INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. CATEGORIES (enhanced)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS target_type TEXT; -- 'monthly', 'by_date', 'none'
ALTER TABLE categories ADD COLUMN IF NOT EXISTS target_amount REAL;
ALTER TABLE categories ADD COLUMN IF NOT EXISTS target_date DATE;

-- 4. TRANSACTIONS TABLE - add missing columns
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS check_number TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_cleared INTEGER DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_transfer INTEGER DEFAULT 0;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS transfer_account_id TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS import_id TEXT;

-- 5. CREDIT CARD PAYMENTS
CREATE TABLE IF NOT EXISTS credit_card_payments (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL,
    credit_card_account_id TEXT NOT NULL,
    category_id TEXT,
    payment_category_id TEXT,
    amount REAL NOT NULL,
    payment_date DATE NOT NULL,
    is_paid INTEGER DEFAULT 0,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (credit_card_account_id) REFERENCES accounts(id)
);

-- 6. RECONCILIATIONS
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

-- 7. RECONCILIATION ENTRIES
CREATE TABLE IF NOT EXISTS reconciliation_entries (
    id TEXT PRIMARY KEY,
    reconciliation_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    UNIQUE(reconciliation_id, transaction_id)
);

-- 8. ACCOUNT BALANCE HISTORY
CREATE TABLE IF NOT EXISTS account_balance_history (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    balance REAL NOT NULL,
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, date)
);

-- 9. MONTHLY BUDGETS
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

-- =========================
-- INDEXES
-- =========================
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_accounts_type ON accounts(type);
CREATE INDEX IF NOT EXISTS idx_accounts_account_type_category ON accounts(account_type_category);

CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);
CREATE INDEX IF NOT EXISTS idx_transactions_is_cleared ON transactions(is_cleared);
CREATE INDEX IF NOT EXISTS idx_transactions_is_transfer ON transactions(is_transfer);

CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_group_id ON categories(group_id);

CREATE INDEX IF NOT EXISTS idx_monthly_budgets_category_id ON monthly_budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_monthly_budgets_month ON monthly_budgets(month);

CREATE INDEX IF NOT EXISTS idx_account_balance_history_account_id ON account_balance_history(account_id);
CREATE INDEX IF NOT EXISTS idx_account_balance_history_date ON account_balance_history(date);

-- =========================
-- TRIGGERS FOR UPDATED_AT
-- =========================
CREATE TRIGGER IF NOT EXISTS update_accounts_timestamp 
AFTER UPDATE ON accounts
BEGIN
    UPDATE accounts SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_transactions_timestamp 
AFTER UPDATE ON transactions
BEGIN
    UPDATE transactions SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_categories_timestamp 
AFTER UPDATE ON categories
BEGIN
    UPDATE categories SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

CREATE TRIGGER IF NOT EXISTS update_monthly_budgets_timestamp 
AFTER UPDATE ON monthly_budgets
BEGIN
    UPDATE monthly_budgets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;

-- =========================
-- TRIGGER TO UPDATE WORKING BALANCE
-- =========================
CREATE TRIGGER IF NOT EXISTS update_account_working_balance
AFTER INSERT ON transactions
BEGIN
    UPDATE accounts 
    SET working_balance = (
        SELECT SUM(amount) FROM transactions WHERE account_id = NEW.account_id
    )
    WHERE id = NEW.account_id;
END;