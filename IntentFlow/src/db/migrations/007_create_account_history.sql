-- src/db/migrations/007_create_account_history.sql
-- Account balance history
CREATE TABLE IF NOT EXISTS account_balance_history (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL,
    balance REAL NOT NULL,
    date DATE NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    UNIQUE(account_id, date)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_account_balance_history_account ON account_balance_history(account_id);
CREATE INDEX IF NOT EXISTS idx_account_balance_history_date ON account_balance_history(date);