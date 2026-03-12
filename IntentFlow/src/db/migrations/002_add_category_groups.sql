-- src/db/migrations/002_add_category_groups.sql
-- Create category_groups table (no dependencies)

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

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_category_groups_user ON category_groups(user_id);