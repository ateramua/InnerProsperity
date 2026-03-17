// src/services/settingsService.cjs
// const { getDatabase } = require('../db/database.cjs');

// UUID generation with fallback
let uuid;
try {
  const { v4: uuidv4 } = require('uuid');
  uuid = uuidv4;
} catch (err) {
  console.error('⚠️ uuid package not installed. Using fallback ID generator - not recommended for production.');
  // Fallback: simple unique ID generator
  uuid = () => 'acc_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

class SettingsService {
  // Get all accounts with details
  async getAccountsWithDetails() {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          a.id,
          a.name,
          a.type,
          a.institution,
          a.onBudget,
          a.currency,
          a.sortOrder,
          COALESCE((SELECT SUM(amount) FROM transactions WHERE accountId = a.id), 0) as balance,
          COALESCE((SELECT SUM(amount) FROM transactions WHERE accountId = a.id AND cleared = 1), 0) as clearedBalance,
          COUNT(DISTINCT t.id) as transactionCount,
          MAX(t.date) as lastTransactionDate
        FROM accounts a
        LEFT JOIN transactions t ON a.id = t.accountId
        GROUP BY a.id
        ORDER BY a.type, a.sortOrder, a.name
      `, [], (err, rows) => {
        db.close();
        if (err) return reject(err);

        const accountsByType = {
          checking: [],
          savings: [],
          credit: [],
          cash: [],
          investment: [],
          other: []
        };

        rows.forEach(account => {
          const type = account.type || 'other';
          if (accountsByType[type]) {
            accountsByType[type].push(account);
          } else {
            accountsByType.other.push(account);
          }
        });

        resolve(accountsByType);
      });
    });
  }

  // Create a new account
  async createAccount(accountData) {
    const db = getDatabase();
    const id = uuid();

    return new Promise((resolve, reject) => {
      db.run(
        `INSERT INTO accounts (
          id, name, type, institution, onBudget, currency, notes, sortOrder, createdAt, updatedAt
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [
          id,
          accountData.name,
          accountData.type || 'checking',
          accountData.institution || null,
          accountData.onBudget ? 1 : 0,
          accountData.currency || 'USD',
          accountData.notes || null,
          accountData.sortOrder || 0
        ],
        function (err) {
          if (err) {
            db.close();
            return reject(err);
          }

          if (accountData.initialBalance && accountData.initialBalance !== 0) {
            const transactionId = uuid();
            db.run(
              `INSERT INTO transactions (
                id, accountId, date, amount, payee, cleared, memo, createdAt
              ) VALUES (?, ?, date('now'), ?, ?, 1, ?, datetime('now'))`,
              [transactionId, id, accountData.initialBalance, 'Starting Balance', 'Initial account balance'],
              (err) => {
                db.close();
                if (err) reject(err);
                else resolve({ id, ...accountData });
              }
            );
          } else {
            db.close();
            resolve({ id, ...accountData });
          }
        }
      );
    });
  }

  // Update an account
  async updateAccount(accountId, updates) {
    const db = getDatabase();
    const allowedFields = ['name', 'type', 'institution', 'onBudget', 'currency', 'notes', 'sortOrder'];
    const setClauses = [];
    const params = [];

    Object.entries(updates).forEach(([key, value]) => {
      if (value !== undefined && allowedFields.includes(key)) {
        setClauses.push(`${key} = ?`);
        params.push(value);
      }
    });

    if (setClauses.length === 0) {
      db.close();
      return resolve({ id: accountId, message: 'No valid fields to update' });
    }

    setClauses.push('updatedAt = datetime("now")');
    params.push(accountId);

    return new Promise((resolve, reject) => {
      db.run(
        `UPDATE accounts SET ${setClauses.join(', ')} WHERE id = ?`,
        params,
        function (err) {
          db.close();
          if (err) reject(err);
          else resolve({ id: accountId, ...updates });
        }
      );
    });
  }

  // Delete an account along with its transactions
  async deleteAccount(accountId) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        db.run('DELETE FROM transactions WHERE accountId = ?', [accountId], (err) => {
          if (err) {
            db.run('ROLLBACK');
            db.close();
            return reject(err);
          }

          db.run('DELETE FROM accounts WHERE id = ?', [accountId], function (err) {
            if (err) {
              db.run('ROLLBACK');
              db.close();
              return reject(err);
            }

            db.run('COMMIT', (err) => {
              db.close();
              if (err) reject(err);
              else resolve({ success: true, deletedAccountId: accountId });
            });
          });
        });
      });
    });
  }

  // Get account summary for dashboard
  async getAccountsSummary(userId) {
    console.log('🔵🔵🔵 accountService.getAccountsSummary CALLED for userId:', userId);
    console.log('🔵 This is the CORRECT accountService function');

    try {
      const db = await getDatabase();
      console.log('🔵 Database connection obtained');

      const accounts = await db.all(`
            SELECT * FROM accounts 
            WHERE user_id = ? 
            ORDER BY type, name
        `, [userId]);

      console.log(`🔵 Found ${accounts.length} accounts in database`);

      if (accounts.length > 0) {
        console.log('🔵 First account:', accounts[0]);
        return accounts; // Return the array directly
      } else {
        console.log('🔵 No accounts found');
        return [];
      }
    } catch (error) {
      console.error('🔴 Error in getAccountsSummary:', error);
      return [];
    }
  }

  // Get account by ID
  async getAccountById(accountId) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.get(`
        SELECT 
          a.*,
          COALESCE((SELECT SUM(amount) FROM transactions WHERE accountId = a.id), 0) as balance,
          COALESCE((SELECT SUM(amount) FROM transactions WHERE accountId = a.id AND cleared = 1), 0) as clearedBalance,
          COUNT(t.id) as transactionCount
        FROM accounts a
        LEFT JOIN transactions t ON a.id = t.accountId
        WHERE a.id = ?
        GROUP BY a.id
      `, [accountId], (err, account) => {
        db.close();
        if (err) reject(err);
        else resolve(account);
      });
    });
  }

  // Get account types
  async getAccountTypes() {
    return [
      { value: 'checking', label: 'Checking' },
      { value: 'savings', label: 'Savings' },
      { value: 'credit', label: 'Credit Card' },
      { value: 'cash', label: 'Cash' },
      { value: 'investment', label: 'Investment' },
      { value: 'other', label: 'Other' }
    ];
  }

  // Get currencies
  async getCurrencies() {
    return [
      { code: 'USD', symbol: '$', name: 'US Dollar' },
      { code: 'EUR', symbol: '€', name: 'Euro' },
      { code: 'GBP', symbol: '£', name: 'British Pound' },
      { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
      { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
      { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
      { code: 'CHF', symbol: 'Fr', name: 'Swiss Franc' },
      { code: 'CNY', symbol: '¥', name: 'Chinese Yuan' },
      { code: 'INR', symbol: '₹', name: 'Indian Rupee' }
    ];
  }

  // Get account statistics
  async getAccountStatistics() {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      db.all(`
        SELECT 
          a.type,
          COUNT(*) as count,
          COALESCE(SUM(
            CASE WHEN a.type = 'credit'
              THEN -(SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE accountId = a.id)
              ELSE (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE accountId = a.id)
            END
          ), 0) as totalBalance,
          COALESCE(AVG(
            (SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE accountId = a.id)
          ), 0) as avgBalance
        FROM accounts a
        GROUP BY a.type
        ORDER BY 
          CASE a.type
            WHEN 'checking' THEN 1
            WHEN 'savings' THEN 2
            WHEN 'cash' THEN 3
            WHEN 'credit' THEN 4
            WHEN 'investment' THEN 5
            ELSE 6
          END
      `, [], (err, rows) => {
        db.close();
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  // Add sortOrder column (migration helper)
  async addSortOrderColumn() {
    const db = getDatabase();
    return new Promise((resolve, reject) => {
      db.run(`ALTER TABLE accounts ADD COLUMN sortOrder INTEGER DEFAULT 0`, (err) => {
        db.close();
        if (err && !err.message.includes('duplicate column')) reject(err);
        else resolve({ success: true });
      });
    });
  }

  // Reorder accounts
  async reorderAccounts(accountIds) {
    const db = getDatabase();

    return new Promise((resolve, reject) => {
      // First ensure sortOrder column exists
      db.run(`ALTER TABLE accounts ADD COLUMN sortOrder INTEGER DEFAULT 0`, (err) => {
        if (err && !err.message.includes('duplicate column')) {
          db.close();
          return reject(err);
        }

        db.serialize(() => {
          db.run('BEGIN TRANSACTION');

          let completed = 0;
          let hasError = false;

          accountIds.forEach((id, index) => {
            db.run(
              'UPDATE accounts SET sortOrder = ?, updatedAt = datetime("now") WHERE id = ?',
              [index, id],
              (err) => {
                if (err && !hasError) {
                  hasError = true;
                  db.run('ROLLBACK');
                  db.close();
                  reject(err);
                } else {
                  completed++;
                  if (completed === accountIds.length && !hasError) {
                    db.run('COMMIT', (err) => {
                      db.close();
                      if (err) reject(err);
                      else resolve({ success: true });
                    });
                  }
                }
              }
            );
          });
        });
      });
    });
  }

  // Bulk create accounts
  async bulkCreateAccounts(accountsData) {
    const db = getDatabase();
    const results = [];

    return new Promise((resolve, reject) => {
      db.serialize(() => {
        db.run('BEGIN TRANSACTION');

        let completed = 0;
        let hasError = false;

        accountsData.forEach(accountData => {
          const id = uuid();
          db.run(
            `INSERT INTO accounts (
              id, name, type, institution, onBudget, currency, notes, sortOrder, createdAt, updatedAt
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
            [
              id,
              accountData.name,
              accountData.type || 'checking',
              accountData.institution || null,
              accountData.onBudget ? 1 : 0,
              accountData.currency || 'USD',
              accountData.notes || null,
              accountData.sortOrder || 0
            ],
            function (err) {
              if (err && !hasError) {
                hasError = true;
                db.run('ROLLBACK', () => {
                  db.close();
                  reject(err);
                });
              } else if (!hasError) {
                results.push({ id, ...accountData });
                completed++;

                if (completed === accountsData.length) {
                  db.run('COMMIT', (err) => {
                    db.close();
                    if (err) reject(err);
                    else resolve(results);
                  });
                }
              }
            }
          );
        });
      });
    });
  }
}

module.exports = new SettingsService();