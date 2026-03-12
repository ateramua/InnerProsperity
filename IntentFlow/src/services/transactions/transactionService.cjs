// src/services/transactions/transactionService.cjs
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class TransactionService {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(__dirname, '..', '..', 'db', 'data', 'app.db');
    }

    async getDb() {
        return open({
            filename: this.dbPath,
            driver: sqlite3.Database
        });
    }

    // Get transactions for a specific account
    async getAccountTransactions(accountId, userId, filters = {}) {
        const db = await this.getDb();
        try {
            let query = `
                SELECT t.*, c.name as category_name 
                FROM transactions t
                LEFT JOIN categories c ON t.category_id = c.id
                WHERE t.account_id = ? AND t.user_id = ?
            `;
            const params = [accountId, userId];

            // Add date filters if provided
            if (filters.startDate) {
                query += ` AND t.date >= ?`;
                params.push(filters.startDate);
            }
            if (filters.endDate) {
                query += ` AND t.date <= ?`;
                params.push(filters.endDate);
            }

            // Filter by cleared status
            if (filters.cleared !== undefined) {
                query += ` AND t.is_cleared = ?`;
                params.push(filters.cleared);
            }

            // Filter by category
            if (filters.categoryId) {
                query += ` AND t.category_id = ?`;
                params.push(filters.categoryId);
            }

            query += ` ORDER BY t.date DESC, t.created_at DESC`;

            const transactions = await db.all(query, params);
            return transactions || [];
        } finally {
            await db.close();
        }
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
            await db.close();
        }
    }

    // Create a transaction
async createTransaction(transactionData) {
    const db = await this.getDb();
    try {
        const id = uuidv4();
        const {
            accountId, userId, date, description, amount,
            categoryId = null, payee = null, memo = null,
            checkNumber = null, isCleared = 0,
            isTransfer = 0, transferAccountId = null,
            importId = null
        } = transactionData;

        console.log('📝 Creating transaction with data:', {
            id, accountId, userId, date, description, amount,
            categoryId, payee, memo, checkNumber, isCleared,
            isTransfer, transferAccountId, importId
        });

        await db.run(`
            INSERT INTO transactions (
                id, account_id, user_id, date, description, amount,
                category_id, payee, memo, check_number, is_cleared,
                is_transfer, transfer_account_id, import_id,
                created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
        `, [
            id, accountId, userId, date, description, amount,
            categoryId, payee, memo, checkNumber, isCleared,
            isTransfer, transferAccountId, importId
        ]);

        // Update account balances
        await this.updateAccountBalances(accountId);

        return this.getTransactionById(id, userId);
    } finally {
        await db.close();
    }
}

    // Update a transaction
    async updateTransaction(id, userId, updates) {
        const db = await this.getDb();
        try {
            const allowedUpdates = [
                'date', 'description', 'amount', 'category_id',
                'payee', 'memo', 'check_number', 'is_cleared'
            ];

            const setClauses = [];
            const values = [];

            for (const [key, value] of Object.entries(updates)) {
                if (allowedUpdates.includes(key)) {
                    setClauses.push(`${key} = ?`);
                    values.push(value);
                }
            }

            if (setClauses.length === 0) return null;

            setClauses.push('updated_at = datetime("now")');
            values.push(id, userId);

            // Get the account_id before update to update balances later
            const oldTransaction = await this.getTransactionById(id, userId);

            await db.run(`
                UPDATE transactions 
                SET ${setClauses.join(', ')}
                WHERE id = ? AND user_id = ?
            `, values);

            // Update account balances
            if (oldTransaction) {
                await this.updateAccountBalances(oldTransaction.account_id);
            }

            return this.getTransactionById(id, userId);
        } finally {
            await db.close();
        }
    }

    // Delete a transaction
    async deleteTransaction(id, userId) {
        const db = await this.getDb();
        try {
            const transaction = await this.getTransactionById(id, userId);
            if (!transaction) return false;

            await db.run(`
                DELETE FROM transactions 
                WHERE id = ? AND user_id = ?
            `, [id, userId]);

            // Update account balances
            await this.updateAccountBalances(transaction.account_id);

            return true;
        } finally {
            await db.close();
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
            await db.close();
        }
    }

    // Update account balances based on transactions
    async updateAccountBalances(accountId) {
        const db = await this.getDb();
        try {
            // Calculate working balance (sum of all transactions)
            await db.run(`
                UPDATE accounts 
                SET working_balance = (
                    SELECT COALESCE(SUM(amount), 0) 
                    FROM transactions 
                    WHERE account_id = ?
                )
                WHERE id = ?
            `, [accountId, accountId]);

            // Calculate cleared balance (sum of cleared transactions)
            await db.run(`
                UPDATE accounts 
                SET cleared_balance = (
                    SELECT COALESCE(SUM(amount), 0) 
                    FROM transactions 
                    WHERE account_id = ? AND is_cleared IN (1, 2)
                )
                WHERE id = ?
            `, [accountId, accountId]);

            console.log(`✅ Updated balances for account ${accountId}`);
        } finally {
            await db.close();
        }
    }
    // Add to TransactionService class

    async getAccountTransactionsWithBalance(accountId, userId) {
        const db = await this.getDb();
        try {
            const transactions = await db.all(`
            SELECT t.*, c.name as category_name 
            FROM transactions t
            LEFT JOIN categories c ON t.category_id = c.id
            WHERE t.account_id = ? AND t.user_id = ?
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
            await db.close();
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
            await db.close();
        }
    }
}

module.exports = TransactionService;