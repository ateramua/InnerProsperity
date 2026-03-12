-- src/db/migrations/005_create_reconciliation_tables.sql
-- Reconciliation history
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

-- Reconciliation entries
CREATE TABLE IF NOT EXISTS reconciliation_entries (
    id TEXT PRIMARY KEY,
    reconciliation_id TEXT NOT NULL,
    transaction_id TEXT NOT NULL,
    FOREIGN KEY (reconciliation_id) REFERENCES reconciliations(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    UNIQUE(reconciliation_id, transaction_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reconciliations_account ON reconciliations(account_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_date ON reconciliations(reconciliation_date);
CREATE INDEX IF NOT EXISTS idx_reconciliation_entries_reconciliation ON reconciliation_entries(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_entries_transaction ON reconciliation_entries(transaction_id);