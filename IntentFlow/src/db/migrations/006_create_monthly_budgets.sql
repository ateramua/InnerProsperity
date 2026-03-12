-- src/db/migrations/006_create_monthly_budgets.sql
-- Monthly budgets table
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_monthly_budgets_category ON monthly_budgets(category_id);
CREATE INDEX IF NOT EXISTS idx_monthly_budgets_month ON monthly_budgets(month);