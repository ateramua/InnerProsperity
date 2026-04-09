-- src/db/migrations/000_create_base_tables.sql
-- Base tables creation (idempotent)

-- USERS
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ACCOUNTS
CREATE TABLE IF NOT EXISTS accounts (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    balance REAL DEFAULT 0,
    currency TEXT DEFAULT 'USD',
    institution TEXT,
    is_active INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- TRANSACTIONS
CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT,
    user_id INTEGER,
    date DATE NOT NULL,
    description TEXT NOT NULL,
    amount REAL NOT NULL,
    category_id TEXT,
    payee TEXT,
    memo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- CATEGORIES
CREATE TABLE IF NOT EXISTS categories (
    id TEXT PRIMARY KEY,
    user_id INTEGER,
    name TEXT NOT NULL,
    description TEXT,
    is_hidden INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
-- src/db/migrations/000_create_base_tables.sql
-- Add this after your existing tables (around line 30-40)

-- Scheduled Transactions Table
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

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_account_id ON scheduled_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_date ON scheduled_transactions(date);
CREATE INDEX IF NOT EXISTS idx_scheduled_transactions_user_id ON scheduled_transactions(user_id);