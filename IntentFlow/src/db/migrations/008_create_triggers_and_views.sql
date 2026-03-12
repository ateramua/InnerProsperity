-- src/db/migrations/008_create_triggers_and_views.sql
-- Triggers
CREATE TRIGGER IF NOT EXISTS update_account_working_balance
AFTER INSERT ON transactions
BEGIN
    UPDATE accounts 
    SET working_balance = (
        SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE account_id = NEW.account_id
    )
    WHERE id = NEW.account_id;
END;

-- Views
CREATE VIEW IF NOT EXISTS v_account_summary AS
SELECT 
    a.id,
    a.name,
    a.type,
    a.account_type_category,
    a.balance,
    a.cleared_balance,
    a.working_balance,
    a.currency,
    COUNT(t.id) as transaction_count,
    SUM(CASE WHEN t.date >= date('now', '-30 days') THEN 1 ELSE 0 END) as transactions_last_30_days
FROM accounts a
LEFT JOIN transactions t ON a.id = t.account_id
WHERE a.is_active = 1
GROUP BY a.id;

CREATE VIEW IF NOT EXISTS v_monthly_spending AS
SELECT 
    c.id as category_id,
    c.name as category_name,
    cg.name as group_name,
    strftime('%Y-%m', t.date) as month,
    SUM(t.amount) as total_spent,
    COUNT(t.id) as transaction_count
FROM transactions t
JOIN categories c ON t.category_id = c.id
LEFT JOIN category_groups cg ON c.group_id = cg.id
WHERE t.amount < 0
GROUP BY c.id, strftime('%Y-%m', t.date);