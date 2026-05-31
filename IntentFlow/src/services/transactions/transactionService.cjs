// src/services/transactions/transactionService.cjs
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const {
    calculateTransactionImpact,
    computeAccountBalances,
    computeTransactionsWithRunningBalance,
    isSystemTransaction,
    signedStartingBalanceAmount,
} = require('../../utils/accountBalanceEngine.cjs');

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

            if (isSystemTransaction(oldTransaction) && !updates.is_system) {
                const err = new Error('Cannot modify system transaction');
                err.code = 'SYSTEM_TRANSACTION_READONLY';
                throw err;
            }

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
                'linked_transaction_id', 'direction', 'is_reconciled'
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

            if (isSystemTransaction(transaction)) {
                const err = new Error('Cannot delete system transaction');
                err.code = 'SYSTEM_TRANSACTION_READONLY';
                throw err;
            }

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

    /**
     * Delete many transactions in one DB transaction + one balance refresh pass.
     * Handles linked transfers (both legs) and Plaid soft-delete.
     * @param {(string|number)[]} ids
     * @param {string|number} userId
     */
    async bulkDeleteTransactions(ids, userId) {
        const db = await this.getDb();
        const uniqueIds = [...new Set((ids || []).map((id) => String(id)).filter(Boolean))];
        if (!uniqueIds.length) {
            return { deleted: 0, accountIds: [], dates: [] };
        }

        const rows = [];
        const chunkSize = 400;
        for (let i = 0; i < uniqueIds.length; i += chunkSize) {
            const chunk = uniqueIds.slice(i, i + chunkSize);
            const placeholders = chunk.map(() => '?').join(', ');
            const part = await db.all(
                `SELECT id, account_id, date, plaid_transaction_id, is_transfer, linked_transaction_id
                 FROM transactions
                 WHERE user_id = ?
                   AND id IN (${placeholders})
                   AND (is_deleted IS NULL OR is_deleted = 0)`,
                [userId, ...chunk]
            );
            rows.push(...part);
        }

        if (!rows.length) {
            return { deleted: 0, accountIds: [], dates: [] };
        }

        const deleteOne = async (row) => {
            if (row.plaid_transaction_id) {
                await db.run(
                    `UPDATE transactions SET is_deleted = 1, updated_at = datetime('now')
                     WHERE id = ? AND user_id = ?`,
                    [row.id, userId]
                );
            } else {
                await db.run(
                    `DELETE FROM transactions WHERE id = ? AND user_id = ?`,
                    [row.id, userId]
                );
            }
        };

        const processed = new Set();
        const accountIds = new Set();
        const dates = [];

        await db.run('BEGIN TRANSACTION');
        try {
            for (const row of rows) {
                if (processed.has(row.id)) continue;

                const fullRow = await db.get(
                    `SELECT is_system FROM transactions WHERE id = ? AND user_id = ?`,
                    [row.id, userId]
                );
                if (fullRow && (fullRow.is_system === 1)) {
                    continue;
                }

                accountIds.add(row.account_id);
                if (row.date) dates.push(row.date);

                if (row.is_transfer === 1) {
                    const linkedId = row.linked_transaction_id;
                    if (linkedId && !processed.has(linkedId)) {
                        const peer = await db.get(
                            `SELECT id, account_id, date, plaid_transaction_id
                             FROM transactions WHERE id = ? AND user_id = ?`,
                            [linkedId, userId]
                        );
                        if (peer) {
                            accountIds.add(peer.account_id);
                            if (peer.date) dates.push(peer.date);
                            await deleteOne(peer);
                            processed.add(peer.id);
                        }
                    }
                    await deleteOne(row);
                    processed.add(row.id);
                    continue;
                }

                await deleteOne(row);
                processed.add(row.id);
            }
            await db.run('COMMIT');
        } catch (err) {
            await db.run('ROLLBACK');
            throw err;
        }

        for (const accountId of accountIds) {
            await this.updateAccountBalances(accountId);
        }

        return {
            deleted: processed.size,
            accountIds: [...accountIds],
            dates,
        };
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

    // Update account balances based on transactions (YNAB-style engine)
    async updateAccountBalances(accountId) {
        const db = await this.getDb();
        try {
            const account = await db.get(
                `SELECT id, type, initial_balance, source, sync_enabled, balance_locked, balance
                 FROM accounts WHERE id = ?`,
                [accountId]
            );
            if (!account) return;

            const isPlaidLinked =
                String(account.source || '').toLowerCase() === 'plaid' &&
                account.sync_enabled !== 0 &&
                account.balance_locked !== 1;

            const activeFilter = `(is_deleted IS NULL OR is_deleted = 0)`;
            const transactions = await db.all(
                `SELECT * FROM transactions WHERE account_id = ? AND ${activeFilter}`,
                [accountId]
            );

            const balances = computeAccountBalances(account, transactions);

            if (isPlaidLinked) {
                await db.run(
                    `
                    UPDATE accounts
                    SET working_balance = ?, cleared_balance = ?, updated_at = datetime('now')
                    WHERE id = ?
                `,
                    [balances.working_balance, balances.cleared_balance, accountId]
                );
                console.log(`✅ Updated register balances for Plaid account ${accountId}`);
                return balances;
            }

            await db.run(
                `
                UPDATE accounts
                SET working_balance = ?, cleared_balance = ?, balance = ?, updated_at = datetime('now')
                WHERE id = ?
            `,
                [
                    balances.working_balance,
                    balances.cleared_balance,
                    balances.current_balance,
                    accountId,
                ]
            );

            console.log(`✅ Updated balances for account ${accountId}`);
            return balances;
        } finally {
            // Connection management handled similarly
        }
    }

    /**
     * Three-tier balance breakdown for an account.
     */
    async getAccountBalanceDetails(accountId, userId) {
        const db = await this.getDb();
        const account = await db.get(
            `SELECT * FROM accounts WHERE id = ? AND user_id = ?`,
            [accountId, userId]
        );
        if (!account) return null;

        const transactions = await db.all(
            `SELECT * FROM transactions
             WHERE account_id = ? AND user_id = ?
               AND (is_deleted IS NULL OR is_deleted = 0)
             ORDER BY date ASC, created_at ASC`,
            [accountId, userId]
        );

        const balances = computeAccountBalances(account, transactions);
        return {
            ...balances,
            bank_balance: account.balance,
            account_id: accountId,
        };
    }

    /**
     * Create a system starting-balance transaction for a new account.
     */
    async createStartingBalanceTransaction(db, account, userId, startDate = null) {
        const initialBalance = Math.abs(Number(account.initial_balance) || 0);
        if (initialBalance === 0) return null;

        const signedAmount = signedStartingBalanceAmount(account.type, initialBalance);
        const date = startDate || new Date().toISOString().slice(0, 10);

        const result = await db.run(
            `
            INSERT INTO transactions (
              account_id, user_id, date, description, amount,
              payee, memo, is_cleared, is_system, is_reconciled, is_adjustment,
              created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, 1, 0, datetime('now'), datetime('now'))
        `,
            [
                account.id,
                userId,
                date,
                'Starting Balance',
                signedAmount,
                'Starting Balance',
                'Initial account balance',
            ]
        );

        return { id: result.lastID };
    }

    // Get transactions with running balance
    async getAccountTransactionsWithBalance(accountId, userId) {
        const db = await this.getDb();
        try {
            const account = await db.get(
                `SELECT * FROM accounts WHERE id = ? AND user_id = ?`,
                [accountId, userId]
            );
            if (!account) return [];

            const transactions = await db.all(
                `
                SELECT t.*, c.name as category_name
                FROM transactions t
                LEFT JOIN categories c ON t.category_id = c.id
                WHERE t.account_id = ? AND t.user_id = ?
                  AND (t.is_deleted IS NULL OR t.is_deleted = 0)
                ORDER BY t.date ASC, t.created_at ASC
            `,
                [accountId, userId]
            );

            return computeTransactionsWithRunningBalance(account, transactions);
        } finally {
            // Connection management handled similarly
        }
    }

    // Reconcile account — marks cleared tx reconciled and creates adjustment if needed
    async reconcileAccount(accountId, userId, statementBalance, transactionsToClear) {
        const db = await this.getDb();
        try {
            const account = await db.get(
                'SELECT * FROM accounts WHERE id = ? AND user_id = ?',
                [accountId, userId]
            );
            if (!account) {
                throw new Error('Account not found');
            }

            const balancesBefore = await this.getAccountBalanceDetails(accountId, userId);
            const previousBalance = balancesBefore?.working_balance ?? account.working_balance ?? 0;
            const difference = Number(statementBalance) - Number(previousBalance);

            const reconciliationId = uuidv4();
            let adjustmentTransactionId = null;

            await db.run('BEGIN TRANSACTION');
            try {
                if (Math.abs(difference) > 0.01) {
                    const adjResult = await db.run(
                        `
                        INSERT INTO transactions (
                          account_id, user_id, date, description, amount,
                          payee, memo, is_cleared, is_system, is_reconciled, is_adjustment,
                          created_at, updated_at
                        ) VALUES (?, ?, date('now'), ?, ?, ?, ?, 1, 0, 1, 1, datetime('now'), datetime('now'))
                    `,
                        [
                            accountId,
                            userId,
                            'Reconciliation Adjustment',
                            difference,
                            'Reconciliation Adjustment',
                            `Adjusted to match statement balance of ${statementBalance}`,
                        ]
                    );
                    adjustmentTransactionId = adjResult.lastID;
                }

                for (const transactionId of transactionsToClear || []) {
                    await db.run(
                        `
                        UPDATE transactions
                        SET is_cleared = 2, is_reconciled = 1, updated_at = datetime('now')
                        WHERE id = ? AND account_id = ?
                    `,
                        [transactionId, accountId]
                    );

                    await db.run(
                        `
                        INSERT INTO reconciliation_entries (id, reconciliation_id, transaction_id)
                        VALUES (?, ?, ?)
                    `,
                        [uuidv4(), reconciliationId, transactionId]
                    );
                }

                const balancesAfter = await this.getAccountBalanceDetails(accountId, userId);

                await db.run(
                    `
                    INSERT INTO reconciliations (
                        id, account_id, reconciliation_date,
                        statement_balance, calculated_balance,
                        difference, status
                    ) VALUES (?, ?, date('now'), ?, ?, ?, 'completed')
                `,
                    [
                        reconciliationId,
                        accountId,
                        statementBalance,
                        balancesAfter?.working_balance ?? previousBalance,
                        statementBalance - (balancesAfter?.working_balance ?? previousBalance),
                    ]
                );

                await db.run('COMMIT');
            } catch (err) {
                await db.run('ROLLBACK');
                throw err;
            }

            await this.updateAccountBalances(accountId);

            console.log(`✅ Reconciled account ${accountId} with ${(transactionsToClear || []).length} transactions`);
            return {
                success: true,
                reconciliationId,
                account_id: accountId,
                previous_balance: previousBalance,
                statement_balance: statementBalance,
                difference,
                adjustment_transaction_id: adjustmentTransactionId,
            };
        } finally {
            // Connection management handled similarly
        }
    }
}

module.exports = TransactionService;