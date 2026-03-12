-- Drop the existing view if it exists
DROP VIEW IF EXISTS v_account_summary;

-- Recreate the view with user_id included
CREATE VIEW v_account_summary AS
SELECT 
    a.id,
    a.user_id,  -- This was missing!
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