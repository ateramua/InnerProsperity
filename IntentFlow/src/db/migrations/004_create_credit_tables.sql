-- Credit card payments tracking
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_credit_card_payments_transaction ON credit_card_payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_credit_card_payments_account ON credit_card_payments(credit_card_account_id);