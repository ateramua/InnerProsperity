// src/services/payeeService.cjs
const { getDatabase } = require('../db/database.cjs');
const { getDatabasePath } = require('../db/database.config.js');
const TransactionService = require('./transactions/transactionService.cjs');

class PayeeService {
  /**
   * Get all payees for the transaction form dropdown
   * @param {string} userId - Current user ID
   * @param {string} currentAccountId - Current account ID (to exclude from transfers)
   * @returns {Object} { transferPayees, regularPayees }
   */
  async getPayeesForForm(userId, currentAccountId) {
    // Get all user accounts for transfer payees
    const accounts = await this.getUserAccounts(userId);
    
    // Section 1: Transfer payees (dynamically from accounts)
    const transferPayees = accounts
      .filter(account => account.id !== currentAccountId)
      .map(account => ({
        id: `transfer_${account.id}`,
        name: `Transfer: ${account.name}`,
        is_transfer_payee: true,
        transfer_account_id: account.id,
        account_type: account.type
      }));
    
    // Section 2: Regular payees (from payees table)
    const regularPayees = await this.getRegularPayees(userId);
    
    return {
      transferPayees,
      regularPayees
    };
  }

  /**
   * Get all user accounts
   */
  async getUserAccounts(userId) {
    const database = await getDatabase();
    const query = `
      SELECT id, name, type 
      FROM accounts 
      WHERE user_id = ? 
      ORDER BY type, name
    `;
    return await database.all(query, [userId]);
  }

  /**
   * Get regular payees (non-transfer) for a user
   */
  async getRegularPayees(userId, limit = 50) {
    const database = await getDatabase();
    const query = `
      SELECT id, name, is_transfer_payee, usage_count, last_used_date
      FROM payees 
      WHERE user_id = ? AND is_transfer_payee = 0
      ORDER BY last_used_date DESC
      LIMIT ?
    `;
    return await database.all(query, [userId, limit]);
  }

  /**
   * Create or update a regular payee from a transaction
   * @param {string} payeeName - The payee name from transaction
   * @param {string} userId - Current user ID
   * @returns {string} Payee ID
   */
  async createOrUpdatePayee(payeeName, userId) {
    const database = await getDatabase();
    
    // Check if payee already exists
    const existing = await database.get(
      `SELECT id, usage_count FROM payees 
       WHERE user_id = ? AND name = ? AND is_transfer_payee = 0`,
      [userId, payeeName]
    );
    
    if (existing) {
      // Update existing payee
      await database.run(
        `UPDATE payees 
         SET last_used_date = unixepoch(), 
             usage_count = usage_count + 1 
         WHERE id = ?`,
        [existing.id]
      );
      return existing.id;
    } else {
      // Create new payee
      const result = await database.run(
        `INSERT INTO payees (id, name, user_id, is_transfer_payee, last_used_date, usage_count, created_at)
         VALUES (lower(hex(randomblob(16))), ?, ?, 0, unixepoch(), 1, unixepoch())`,
        [payeeName, userId]
      );
      return result.lastID;
    }
  }

  /**
   * Get a transfer payee for the destination account
   * (Used when creating the reverse transaction)
   */
  async getTransferPayeeByAccountId(accountId, userId) {
    const database = await getDatabase();
    const account = await database.get(
      `SELECT id, name FROM accounts WHERE id = ? AND user_id = ?`,
      [accountId, userId]
    );
    
    if (account) {
      return {
        id: `transfer_${account.id}`,
        name: `Transfer: ${account.name}`,
        is_transfer_payee: true,
        transfer_account_id: account.id
      };
    }
    return null;
  }

  /**
   * Get reverse payee name for a transfer
   * @param {string} sourceAccountName - Name of the source account
   * @returns {string}
   */
  getReversePayeeName(sourceAccountName) {
    return `Transfer: ${sourceAccountName}`;
  }

  /**
   * Create a linked transfer transaction (two-sided)
   * This handles the complete two-sided transaction creation
   */
  async createLinkedTransfer(transferData) {
    const {
      sourceAccountId,
      destinationAccountId,
      amount,
      date,
      sourcePayeeName,
      memo,
      cleared,
      userId
    } = transferData;

    const database = await getDatabase();
    const transferGroupId = require('crypto').randomUUID();
    
    // Get account details
    const sourceAccount = await database.get('SELECT * FROM accounts WHERE id = ?', [sourceAccountId]);
    const destinationAccount = await database.get('SELECT * FROM accounts WHERE id = ?', [destinationAccountId]);
    
    if (!sourceAccount || !destinationAccount) {
      throw new Error('Account not found');
    }

    // Source transaction (outflow from source account)
    const sourceAmount = -Math.abs(amount);
    const sourceBalanceChange = sourceAmount;

    // Destination transaction (inflow to destination account)
    const destinationAmount = Math.abs(amount);
    const destinationBalanceChange = destinationAmount;

    // Start a database transaction
    await database.run('BEGIN TRANSACTION');

    try {
      // 1. Create source transaction
      const sourceResult = await database.run(`
        INSERT INTO transactions 
        (account_id, amount, date, payee, category_id, memo, cleared, 
         is_transfer, transfer_group_id, counterparty_account_id, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      `, [
        sourceAccountId, sourceAmount, date, sourcePayeeName, null, memo, cleared ? 1 : 0,
        1, transferGroupId, destinationAccountId, userId
      ]);

      // 2. Create destination transaction (reverse)
      const reversePayeeName = this.getReversePayeeName(sourceAccount.name);
      const destinationResult = await database.run(`
        INSERT INTO transactions 
        (account_id, amount, date, payee, category_id, memo, cleared, 
         is_transfer, transfer_group_id, counterparty_account_id, user_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, unixepoch())
      `, [
        destinationAccountId, destinationAmount, date, reversePayeeName, null, 
        `Transfer from ${sourceAccount.name}`, cleared ? 1 : 0,
        1, transferGroupId, sourceAccountId, userId
      ]);

      // 3. Link transactions together
      await database.run(`
        UPDATE transactions SET linked_transaction_id = ? WHERE id = ?
      `, [destinationResult.lastID, sourceResult.lastID]);

      await database.run(`
        UPDATE transactions SET linked_transaction_id = ? WHERE id = ?
      `, [sourceResult.lastID, destinationResult.lastID]);

      await database.run('COMMIT');

      const txSvc = new TransactionService(getDatabasePath());
      await txSvc.updateAccountBalances(sourceAccountId);
      await txSvc.updateAccountBalances(destinationAccountId);

      const dbAfter = await getDatabase();
      const srcRow = await dbAfter.get(
        'SELECT balance, working_balance FROM accounts WHERE id = ?',
        [sourceAccountId]
      );
      const dstRow = await dbAfter.get(
        'SELECT balance, working_balance FROM accounts WHERE id = ?',
        [destinationAccountId]
      );
      const sourceNewBalance = Number(srcRow?.balance) || 0;
      const destinationNewBalance = Number(dstRow?.balance) || 0;

      return {
        success: true,
        data: {
          sourceTransactionId: sourceResult.lastID,
          destinationTransactionId: destinationResult.lastID,
          transferGroupId,
          sourceNewBalance,
          destinationNewBalance
        }
      };
    } catch (error) {
      await database.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * Update a linked transfer transaction (both sides)
   */
  async updateLinkedTransfer(transactionId, userId, updates) {
    const database = await getDatabase();
    
    // Get the original transaction
    const transaction = await database.get(
      'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
      [transactionId, userId]
    );
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }
    
    if (transaction.is_transfer !== 1 || !transaction.linked_transaction_id) {
      throw new Error('Not a linked transfer transaction');
    }
    
    const linkedTransaction = await database.get(
      'SELECT * FROM transactions WHERE id = ?',
      [transaction.linked_transaction_id]
    );
    
    if (!linkedTransaction) {
      throw new Error('Linked transaction not found');
    }
    
    await database.run('BEGIN TRANSACTION');
    
    try {
      const oldAmount = transaction.amount;
      const newAmount = updates.amount !== undefined ? updates.amount : oldAmount;
      
      // Update source transaction
      const sourceUpdateFields = [];
      const sourceUpdateValues = [];
      
      if (updates.date !== undefined) {
        sourceUpdateFields.push('date = ?');
        sourceUpdateValues.push(updates.date);
      }
      if (updates.payee !== undefined) {
        sourceUpdateFields.push('payee = ?');
        sourceUpdateValues.push(updates.payee);
      }
      if (updates.memo !== undefined) {
        sourceUpdateFields.push('memo = ?');
        sourceUpdateValues.push(updates.memo);
      }
      if (updates.amount !== undefined) {
        sourceUpdateFields.push('amount = ?');
        sourceUpdateValues.push(newAmount);
      }
      
      sourceUpdateFields.push('updated_at = unixepoch()');
      sourceUpdateValues.push(transactionId);
      
      if (sourceUpdateFields.length > 1) {
        await database.run(
          `UPDATE transactions SET ${sourceUpdateFields.join(', ')} WHERE id = ?`,
          sourceUpdateValues
        );
      }
      
      // Update destination transaction (opposite amount)
      const oppositeAmount = -newAmount;
      const destUpdateFields = [];
      const destUpdateValues = [];
      
      if (updates.date !== undefined) {
        destUpdateFields.push('date = ?');
        destUpdateValues.push(updates.date);
      }
      if (updates.memo !== undefined) {
        destUpdateFields.push('memo = ?');
        destUpdateValues.push(updates.memo);
      }
      if (updates.amount !== undefined) {
        destUpdateFields.push('amount = ?');
        destUpdateValues.push(oppositeAmount);
      }
      
      destUpdateFields.push('updated_at = unixepoch()');
      destUpdateValues.push(linkedTransaction.id);
      
      if (destUpdateFields.length > 1) {
        await database.run(
          `UPDATE transactions SET ${destUpdateFields.join(', ')} WHERE id = ?`,
          destUpdateValues
        );
      }
      
      await database.run('COMMIT');

      const txSvc = new TransactionService(getDatabasePath());
      await txSvc.updateAccountBalances(transaction.account_id);
      await txSvc.updateAccountBalances(linkedTransaction.account_id);
      
      return { success: true, data: { id: transactionId, linkedId: linkedTransaction.id } };
    } catch (error) {
      await database.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * Delete a linked transfer transaction (both sides)
   */
  async deleteLinkedTransfer(transactionId, userId) {
    const database = await getDatabase();
    
    // Get the transaction
    const transaction = await database.get(
      'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
      [transactionId, userId]
    );
    
    if (!transaction) {
      throw new Error('Transaction not found');
    }

    const sourceAccountId = transaction.account_id;
    let linkedId = transaction.linked_transaction_id;
    let peerAccountId = null;

    if (linkedId) {
      const peer = await database.get('SELECT account_id FROM transactions WHERE id = ?', [linkedId]);
      if (peer) peerAccountId = peer.account_id;
    } else {
      const linked = await database.get(
        'SELECT id, account_id FROM transactions WHERE linked_transaction_id = ? AND user_id = ?',
        [transactionId, userId]
      );
      if (linked) {
        linkedId = linked.id;
        peerAccountId = linked.account_id;
      }
    }
    
    await database.run('BEGIN TRANSACTION');
    
    try {
      // Delete both transactions
      if (linkedId) {
        await database.run('DELETE FROM transactions WHERE id = ?', [linkedId]);
      }
      await database.run('DELETE FROM transactions WHERE id = ?', [transactionId]);
      
      await database.run('COMMIT');

      const txSvc = new TransactionService(getDatabasePath());
      await txSvc.updateAccountBalances(sourceAccountId);
      if (peerAccountId) await txSvc.updateAccountBalances(peerAccountId);
      
      return { success: true, data: { deletedIds: [transactionId, linkedId].filter(Boolean) } };
    } catch (error) {
      await database.run('ROLLBACK');
      throw error;
    }
  }
}

module.exports = new PayeeService();