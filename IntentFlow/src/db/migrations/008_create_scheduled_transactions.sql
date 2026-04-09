-- src/db/migrations/008_create_scheduled_transactions.sql
-- Migration: Add scheduled transactions table

CREATE TABLE IF NOT EXISTS scheduled_transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL,
  date TEXT NOT NULL,
  payee TEXT NOT NULL,
  amount REAL NOT NULL,
  transaction_type TEXT NOT NULL,
  category_id TEXT,
  memo TEXT,
  user_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_account_id ON scheduled_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_date ON scheduled_transactions(date);
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_user_id ON scheduled_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_status ON scheduled_transactions(status);