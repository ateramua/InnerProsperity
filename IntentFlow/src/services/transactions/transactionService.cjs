// src/services/transactions/transactionService.cjs
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class TransactionService {
    constructor(dbPath = null) {
        // If no path is provided, use a default (fallback)
        this.dbPath = dbPath || path.join(__dirname, '..', '..', 'db', 'data', 'app.db');
        this.db = null;
    }

    async getDb() {
        if (this.db) return this.db;
        this.db = await open({
            filename: this.dbPath,
            driver: sqlite3.Database
        });
        return this.db;
    }

    // Get all transactions across all accounts
    async getAllTransactions(userId, filters = {}) {
        const db = await this.getDb();
        try {
            let query = `
                SELECT t.*, a.name as account_name, c.name as category_name 
                FROM transactions t
                JOIN accounts a ON t.account_id = a.id
                LEFT JOIN categories c ON t.category_id = c.id
                WHERE t.user_id = ?
                  AND (t.is_deleted IS NULL OR t.is_deleted = 0)
            `;
            const params = [userId];

            if (filters.startDate) {
                query += ` AND t.date >= ?`;
                params.push(filters.startDate);
            }
            if (filters.endDate) {
                query += ` AND t.date <= ?`;
                params.push(filters.endDate);
            }

            query += ` ORDER BY t.date DESC, t.created_at DESC`;

            const transactions = await db.all(query, params);
            return transactions || [];
        } finally {
            // If you want to close the connection, do it here. But sqlite3 handles it.
        }
    }

    // Create a transaction - UPDATED to support linkedTransactionId
    async createTransaction(transactionData) {
        const db = await this.getDb();
        const {
            accountId, userId, date, description, amount, categoryId,
            payee, memo, isCleared,
            // NEW TRANSFER FIELDS
            isTransfer,
            transferGroupId,
            linkedTransactionId,
            counterpartyAccountId
        } = transactionData;

        const query = `
    INSERT INTO transactions (
      account_id, user_id, date, description, amount, category_id,
      payee, memo, is_cleared, created_at,
      is_transfer, transfer_group_id, linked_transaction_id, counterparty_account_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch(), ?, ?, ?, ?)
  `;

        const params = [
            accountId, userId, date, description, amount, categoryId,
            payee, memo, isCleared || 0,
            isTransfer || 0,
            transferGroupId || null,
            linkedTransactionId || null,
            counterpartyAccountId || null
        ];

        const result = await db.run(query, params);
        await this.updateAccountBalances(accountId);
        return { id: result.lastID };
    }

    // Update a transaction - UPDATED to support linked_transaction_id
    async updateTransaction(id, userId, updates) {
        const db = await this.getDb();
        try {
            const oldTransaction = await this.getTransactionById(id, userId);
            if (!oldTransaction) return null;

            let effectiveUpdates = { ...updates };
            if (oldTransaction.plaid_transaction_id) {
                const {
                    filterPlaidTransactionUpdates,
                } = require('../../utils/plaidTransactionUtils.cjs');
                const { updates: filtered, removed } = filterPlaidTransactionUpdates(
                    oldTransaction,
                    updates
                );
                if (removed.length) {
                    const err = new Error(
                        `Bank-imported transactions cannot change: ${removed.join(', ')}. Edit category or memo only.`
                    );
                    err.code = 'PLAID_TRANSACTION_READONLY';
                    throw err;
                }
                effectiveUpdates = filtered;
            }

            const allowedUpdates = [
                'date', 'description', 'amount', 'category_id',
                'payee', 'memo', 'check_number', 'is_cleared',
                'linked_transaction_id'
            ];

            const setClauses = [];
            const values = [];

            for (const [key, value] of Object.entries(effectiveUpdates)) {
                if (allowedUpdates.includes(key)) {
                    setClauses.push(`${key} = ?`);
                    values.push(value);
                }
            }

            if (setClauses.length === 0) return null;

            setClauses.push('updated_at = datetime("now")');
            values.push(id, userId);

            await db.run(`
                UPDATE transactions 
                SET ${setClauses.join(', ')}
                WHERE id = ? AND user_id = ?
            `, values);

            await this.updateAccountBalances(oldTransaction.account_id);

            return this.getTransactionById(id, userId);
        } finally {
            // Connection management handled similarly
        }
    }

    // Get transactions for a specific account
    async getAccountTransactions(accountId, userId) {
        const db = await this.getDb();
        const query = `
    SELECT 
      t.*,
      CASE 
        WHEN t.is_transfer = 1 AND t.counterparty_account_id IS NOT NULL 
        THEN (SELECT name FROM accounts WHERE id = t.counterparty_account_id)
        ELSE NULL 
      END as transfer_counterparty_name
    FROM transactions t
    WHERE t.account_id = ? AND t.user_id = ?
      AND (t.is_deleted IS NULL OR t.is_deleted = 0)
    ORDER BY t.date DESC, t.created_at DESC
  `;
        return await db.all(query, [accountId, userId]);
    }

    // Delete a transaction
    async deleteTransaction(id, userId) {
        const db = await this.getDb();
        try {
            const transaction = await this.getTransactionById(id, userId);
            if (!transaction) return false;

            if (transaction.plaid_transaction_id) {
                await db.run(
                    `UPDATE transactions SET is_deleted = 1, updated_at = datetime('now')
                     WHERE id = ? AND user_id = ?`,
                    [id, userId]
                );
            } else {
                await db.run(
                    `DELETE FROM transactions WHERE id = ? AND user_id = ?`,
                    [id, userId]
                );
            }

            // Update account balances
            await this.updateAccountBalances(transaction.account_id);

            return true;
        } finally {
            // Connection management handled similarly
        }
    }

    // Get transaction by ID
    async getTransactionById(id, userId) {
        const db = await this.getDb();
        try {
            return await db.get(`
                SELECT t.*, a.name as account_name, c.name as category_name 
                FROM transactions t
                JOIN accounts a ON t.account_id = a.id
                LEFT JOIN categories c ON t.category_id = c.id
                WHERE t.id = ? AND t.user_id = ?
            `, [id, userId]);
        } finally {
            // Connection management handled similarly
        }
    }

    // Update account balances based on transactions
    async updateAccountBalances(accountId) {
        const db = await this.getDb();
        try {
            // Ledger is source of truth: working + display balance match sum of rows.
            // Cleared/reconciled rows (is_cleared 1 or 2) feed cleared_balance.
            await db.run(
                `
                UPDATE accounts
                SET
                  working_balance = (
                    SELECT COALESCE(SUM(amount), 0)
                    FROM transactions
                    WHERE account_id = ?
                  ),
                  cleared_balance = (
                    SELECT COALESCE(SUM(amount), 0)
                    FROM transactions
                    WHERE account_id = ? AND IFNULL(is_cleared, 0) IN (1, 2)
                  ),
                  balance = (
                    SELECT COALESCE(SUM(amount), 0)
                    FROM transactions
                    WHERE account_id = ?
                  ),
                  updated_at = datetime('now')
                WHERE id = ?
            `,
                [accountId, accountId, accountId, accountId]
            );

            console.log(`✅ Updated balances for account ${accountId}`);
        } finally {
            // Connection management handled similarly
        }
    }

    // Get transactions with running balance
    async getAccountTransactionsWithBalance(accountId, userId) {
        const db = await this.getDb();
        try {
            const transactions = await db.all(`
            SELECT t.*, c.name as category_name 
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.account_id = ? AND t.user_id = ?
              AND (t.is_deleted IS NULL OR t.is_deleted = 0)
            ORDER BY t.date ASC, t.created_at ASC
        `, [accountId, userId]);

            // Calculate running balance
            let runningBalance = 0;
            const transactionsWithBalance = transactions.map(t => {
                runningBalance += t.amount;
                return {
                    ...t,
                    running_balance: runningBalance
                };
            });

            // Return in descending order for display
            return transactionsWithBalance.reverse();
        } finally {
            // Connection management handled similarly
        }
    }

    // Reconcile account
    async reconcileAccount(accountId, userId, statementBalance, transactionsToClear) {
        const db = await this.getDb();
        try {
            // Create reconciliation record
            const reconciliationId = uuidv4();
            const account = await db.get(
                'SELECT working_balance FROM accounts WHERE id = ? AND user_id = ?',
                [accountId, userId]
            );

            await db.run(`
                INSERT INTO reconciliations (
                    id, account_id, reconciliation_date, 
                    statement_balance, calculated_balance,
                    difference, status
                ) VALUES (?, ?, date('now'), ?, ?, ?, 'completed')
            `, [
                reconciliationId, accountId,
                statementBalance, account.working_balance,
                statementBalance - account.working_balance
            ]);

            // Mark transactions as reconciled
            for (const transactionId of transactionsToClear) {
                await db.run(`
                    UPDATE transactions 
                    SET is_cleared = 2 
                    WHERE id = ? AND account_id = ?
                `, [transactionId, accountId]);

                await db.run(`
                    INSERT INTO reconciliation_entries (id, reconciliation_id, transaction_id)
                    VALUES (?, ?, ?)
                `, [uuidv4(), reconciliationId, transactionId]);
            }

            console.log(`✅ Reconciled account ${accountId} with ${transactionsToClear.length} transactions`);
            return { success: true, reconciliationId };
        } finally {
            // Connection management handled similarly
        }
    }
}

module.exports = TransactionService;