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

    async getAllAccounts(userId) {
        console.log('🟢🟢🟢 accountService.getAllAccounts CALLED for userId:', userId);
        const db = await this.getDb();
        try {
            const accounts = await db.all(`
                SELECT * FROM accounts 
                WHERE user_id = ? 
                ORDER BY type, name
            `, [userId]);

            console.log(`🟢 Found ${accounts.length} accounts`);
            
            // Format accounts consistently
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
                is_active: account.is_active !== 0
            }));
            
            return formattedAccounts;
        } catch (error) {
            console.error('🔴 Error in getAllAccounts:', error);
            return [];
        }
        // No db.close() – connection is managed by the provider or left open (caller may close)
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

    async getAccountById(id, userId) {
        const db = await this.getDb();
        try {
            const account = await db.get(`
                SELECT * FROM accounts 
                WHERE id = ? AND user_id = ?
            `, [id, userId]);
            return account;
        } finally {
            // If we opened a direct connection (fallback), close it
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    async createAccount(accountData) {
        const db = await this.getDb();
        try {
            const id = uuidv4();
            const {
                userId,
                name,
                type,
                accountTypeCategory = 'budget',
                balance = 0,
                currency = 'USD',
                institution = '',
                creditLimit = null,
                interestRate = null,
                dueDate = null,
                minimumPayment = null
            } = accountData;

            await db.run(`
            INSERT INTO accounts (
                id, user_id, name, type, account_type_category,
                balance, cleared_balance, working_balance,
                currency, institution,
                credit_limit, interest_rate, due_date, minimum_payment,
                is_active, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
        `, [
                id, userId, name, type, accountTypeCategory,
                balance, balance, balance,
                currency, institution,
                creditLimit, interestRate, dueDate, minimumPayment
            ]);

            return this.getAccountById(id, userId);
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
        }
    }

    async updateAccount(id, userId, updates) {
        const db = await this.getDb();
        try {
            const allowedUpdates = [
                'name', 'type', 'account_type_category', 'institution',
                'account_number', 'routing_number', 'credit_limit',
                'interest_rate', 'due_date', 'minimum_payment', 'is_active'
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

            await db.run(`
                UPDATE accounts 
                SET ${setClauses.join(', ')}
                WHERE id = ? AND user_id = ?
            `, values);

            return this.getAccountById(id, userId);
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
            
            // Format accounts for the frontend
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
                is_active: account.is_active !== 0
            }));
            
            return formattedAccounts;
        } catch (error) {
            console.error('🔴 Error in getAccountsSummary:', error);
            return [];
        } finally {
            if (!this.dbProvider && db && typeof db.close === 'function') {
                await db.close();
            }
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
                    credit_limit, interest_rate, due_date, minimum_payment
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