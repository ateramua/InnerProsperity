const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

class AccountService {
    /**
     * @param {Function} dbProvider - async function that returns a database connection (from main process)
     * @param {string} dbPath - fallback path (only used if no provider given)
     */
    constructor(dbProvider = null, dbPath = null) {
        this.dbProvider = dbProvider;
        this.dbPath = dbPath || path.join(__dirname, '..', '..', 'db', 'data', 'app.db');
    }

    async getDb() {
        // If a provider is given (e.g., from main process), use it
        if (this.dbProvider) {
            return await this.dbProvider();
        }
        // Fallback: open a direct connection (used in dev or standalone)
        return open({
            filename: this.dbPath,
            driver: sqlite3.Database
        });
    }

    // ==================== BASIC CRUD OPERATIONS ====================

    async createAccount(accountData) {
        const db = await this.getDb();
        try {
            const id = uuidv4();
            const {
                userId,
                user_id,  // Accept both formats
                name,
                type,
                accountTypeCategory,
                account_type_category,  // Accept both formats
                balance = 0,
                currency = 'USD',
                institution = '',
                creditLimit = null,
                interestRate = null,
                dueDate = null,
                minimumPayment = null,
                account_number = null,
                account_holder_name = null,
                notes = null
            } = accountData;

            // Use either userId or user_id
            const finalUserId = userId || user_id;
            if (!finalUserId) {
                throw new Error('userId is required');
            }

            // Use either accountTypeCategory or account_type_category
            const finalAccountTypeCategory = accountTypeCategory || account_type_category || 'budget';

            await db.run(`
                INSERT INTO accounts (
                    id, user_id, name, type, account_type_category,
                    balance, cleared_balance, working_balance,
                    currency, institution,
                    credit_limit, interest_rate, due_date, minimum_payment,
                    account_number, account_holder_name, notes,
                    is_active, created_at, updated_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
            `, [
                id, finalUserId, name, type, finalAccountTypeCategory,
                balance, balance, balance,
                currency, institution,
                creditLimit, interestRate, dueDate, minimumPayment,
                account_number, account_holder_name, notes
            ]);

            return this.getAccountById(id, finalUserId);
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    // Legacy method for backward compatibility
    async getAccounts() {
        console.log('🟡🟡🟡 accountService.getAccounts CALLED (legacy)');
        try {
            // This might need a default user ID
            const userId = 2; // Default to demo user
            return await this.getAllAccounts(userId);
        } catch (error) {
            console.error('🔴 Error in getAccounts:', error);
            return [];
        }
    }

    async getAllAccounts(userId) {
        const db = await this.getDb();
        try {
            const accounts = await db.all(`
                SELECT * FROM accounts 
                WHERE user_id = ? AND is_active = 1
                ORDER BY type, name
            `, [userId]);
            return accounts;
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    async getAccountById(id, userId) {
        const db = await this.getDb();
        try {
            const account = await db.get(`
                SELECT * FROM accounts 
                WHERE id = ? AND user_id = ?
            `, [id, userId]);
            return account;
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    async updateAccount(id, userId, updates) {
        const db = await this.getDb();
        try {
            // Complete list of allowed fields for update
            const allowedUpdates = [
                'name', 'type', 'account_type_category', 'institution',
                'account_number', 'account_holder_name', 'notes',
                'routing_number', 'credit_limit', 'limit',
                'interest_rate', 'apr', 'due_date', 'dueDate',
                'minimum_payment', 'minimumPayment', 'is_active',
                'balance', 'original_balance', 'term_months', 'term',
                'payment_amount', 'paymentAmount', 'payment_frequency',
                'next_payment_date', 'nextPaymentDate'
            ];

            const setClauses = [];
            const values = [];

            for (const [key, value] of Object.entries(updates)) {
                if (allowedUpdates.includes(key)) {
                    // Map alternative field names to database column names
                    let columnName = key;
                    if (key === 'limit') columnName = 'credit_limit';
                    if (key === 'apr') columnName = 'interest_rate';
                    if (key === 'dueDate') columnName = 'due_date';
                    if (key === 'minimumPayment') columnName = 'minimum_payment';
                    if (key === 'term') columnName = 'term_months';
                    if (key === 'paymentAmount') columnName = 'payment_amount';
                    if (key === 'nextPaymentDate') columnName = 'next_payment_date';
                    
                    setClauses.push(`${columnName} = ?`);
                    values.push(value);
                }
            }

            // If balance is updated, also update cleared_balance and working_balance
            if (updates.balance !== undefined) {
                setClauses.push('cleared_balance = ?');
                setClauses.push('working_balance = ?');
                values.push(updates.balance, updates.balance);
            }

            if (setClauses.length === 0) {
                console.log('❌ No valid fields to update');
                return null;
            }

            setClauses.push('updated_at = datetime("now")');
            values.push(id, userId);

            const sql = `UPDATE accounts SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`;
            console.log('🔍 updateAccount SQL:', sql);
            console.log('🔍 updateAccount values:', values);

            const result = await db.run(sql, values);
            console.log('🔍 Update result:', result);

            if (result.changes === 0) {
                console.log('⚠️ No rows were updated. Account may not exist or user_id mismatch.');
                return null;
            }

            return this.getAccountById(id, userId);
        } catch (error) {
            console.error('❌ Error in updateAccount:', error);
            throw error;
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    async deleteAccount(id, userId) {
        const db = await this.getDb();
        try {
            // Soft delete by setting is_active = 0
            await db.run(`
                UPDATE accounts 
                SET is_active = 0, updated_at = datetime('now')
                WHERE id = ? AND user_id = ?
            `, [id, userId]);
            return true;
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    // ==================== BALANCE OPERATIONS ====================

    async getAccountBalances(accountId, userId) {
        const db = await this.getDb();
        try {
            const account = await db.get(`
                SELECT 
                    balance,
                    cleared_balance,
                    working_balance
                FROM accounts 
                WHERE id = ? AND user_id = ?
            `, [accountId, userId]);
            return account;
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    async updateBalances(accountId) {
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

            return this.getAccountBalances(accountId);
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    // ==================== SUMMARY OPERATIONS ====================
    async getAccountsSummary(userId) {
        console.log('🔵🔵🔵 accountService.getAccountsSummary CALLED for userId:', userId);
        const db = await this.getDb();
        try {
            const accounts = await db.all(`SELECT * FROM accounts WHERE user_id = ?`, [userId]);
            console.log(`🔵 Found ${accounts.length} accounts`);

            // 🔍 Debug: log first account's interest_rate
            if (accounts.length > 0) {
                console.log('🔍 First account interest_rate:', accounts[0].interest_rate);
            }

            const formattedAccounts = accounts.map(account => ({
                id: account.id,
                name: account.name,
                type: account.type,
                balance: account.balance || 0,
                institution: account.institution || '',
                account_type_category: account.account_type_category || 'budget',
                cleared_balance: account.cleared_balance || account.balance || 0,
                working_balance: account.working_balance || account.balance || 0,
                currency: account.currency || 'USD',
                is_active: account.is_active !== 0,
                // Credit card specific fields
                interest_rate: account.interest_rate,
                credit_limit: account.credit_limit,
                due_date: account.due_date,
                minimum_payment: account.minimum_payment,
                // Account number fields
                account_number: account.account_number,
                account_holder_name: account.account_holder_name,
                notes: account.notes
            }));

            return formattedAccounts;
        } catch (error) {
            console.error('🔴 Error in getAccountsSummary:', error);
            return [];
        }
    }

    async getTotalsByType(userId) {
        const db = await this.getDb();
        try {
            const totals = await db.all(`
                SELECT 
                    account_type_category,
                    COUNT(*) as account_count,
                    SUM(working_balance) as total_balance,
                    SUM(CASE WHEN working_balance > 0 THEN working_balance ELSE 0 END) as total_assets,
                    SUM(CASE WHEN working_balance < 0 THEN working_balance ELSE 0 END) as total_liabilities
                FROM accounts 
                WHERE user_id = ? AND is_active = 1
                GROUP BY account_type_category
            `, [userId]);

            // Calculate grand total
            const grandTotal = totals.reduce((sum, cat) => sum + (cat.total_balance || 0), 0);

            return {
                byCategory: totals,
                grandTotal,
                netWorth: grandTotal
            };
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    // ==================== RECONCILIATION OPERATIONS ====================

    async startReconciliation(accountId, userId, statementBalance, statementDate) {
        const db = await this.getDb();
        try {
            const id = uuidv4();
            const account = await this.getAccountById(accountId, userId);

            await db.run(`
                INSERT INTO reconciliations (
                    id, account_id, reconciliation_date, 
                    statement_balance, calculated_balance,
                    difference, status
                ) VALUES (?, ?, ?, ?, ?, ?, 'pending')
            `, [
                id, accountId, statementDate,
                statementBalance, account.working_balance,
                statementBalance - account.working_balance
            ]);

            return this.getReconciliation(id);
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    async getReconciliation(id) {
        const db = await this.getDb();
        try {
            return await db.get(`SELECT * FROM reconciliations WHERE id = ?`, [id]);
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    // ==================== CREDIT CARD SPECIFIC ====================

    async getCreditCardDetails(accountId, userId) {
        const db = await this.getDb();
        try {
            const account = await db.get(`
                SELECT 
                    id, name, working_balance as current_balance,
                    credit_limit, interest_rate, due_date, minimum_payment,
                    account_number, account_holder_name, notes
                FROM accounts 
                WHERE id = ? AND user_id = ? AND type = 'credit'
            `, [accountId, userId]);

            if (!account) return null;

            // Calculate available credit
            account.available_credit = (account.credit_limit || 0) - Math.abs(account.current_balance || 0);

            // Get upcoming payments
            const upcomingPayments = await db.all(`
                SELECT * FROM credit_card_payments 
                WHERE credit_card_account_id = ? 
                AND is_paid = 0
                ORDER BY payment_date
            `, [accountId]);

            account.upcoming_payments = upcomingPayments;

            return account;
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }
}

// Export the class so main process can instantiate it with dbProvider
module.exports = AccountService;