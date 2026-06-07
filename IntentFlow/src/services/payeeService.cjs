// src/services/payeeService.cjs
const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../db/database.cjs');
const { getDatabasePath } = require('../db/database.config.js');
const TransactionService = require('./transactions/transactionService.cjs');
const {
  isAccountRoutingPayeeLabel,
  formatTransferPayeeName,
  buildAccountPayeeOptions,
} = require('../shared/transferPayeeUtils.cjs');

class PayeeService {
  /**
   * Get all payees for the transaction form dropdown
   * @param {string} userId - Current user ID
   * @param {string} currentAccountId - Current account ID (to exclude from transfers)
   * @returns {Object} { paymentPayees, transferPayees, regularPayees }
   */
  async getPayeesForForm(userId, currentAccountId) {
    // Get all user accounts for transfer payees
    const accounts = await this.getUserAccounts(userId);
    
    const { paymentPayees, transferPayees } = buildAccountPayeeOptions(accounts, currentAccountId);

    // Section 2: Regular payees (from payees table)
    const regularPayees = await this.getRegularPayees(userId);
    
    return {
      paymentPayees,
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
        name: formatTransferPayeeName(account.name),
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
    return formatTransferPayeeName(sourceAccountName);
  }

  async getTransactionRow(database, transactionId, userId) {
    return database.get(
      `SELECT t.*, a.name AS account_name
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE t.id = ? AND t.user_id = ?`,
      [transactionId, userId]
    );
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
   * Update a linked transfer transaction (both sides). Supports destination change (FR-6).
   */
  async updateLinkedTransfer(transactionId, userId, updates) {
    const database = await getDatabase();

    const transaction = await database.get(
      'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
      [transactionId, userId]
    );

    if (!transaction) throw new Error('Transaction not found');
    if (transaction.is_transfer !== 1) {
      throw new Error('Not a linked transfer transaction');
    }

    const payee = updates.payee ?? updates.description;
    if (updates.convertToRegular || (payee && !isAccountRoutingPayeeLabel(payee))) {
      return this.unlinkTransferToRegular(transactionId, userId, updates);
    }

    let linkedTransaction = null;
    if (transaction.linked_transaction_id) {
      linkedTransaction = await database.get(
        'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
        [transaction.linked_transaction_id, userId]
      );
    }
    if (!linkedTransaction) {
      const reverse = await database.get(
        'SELECT * FROM transactions WHERE linked_transaction_id = ? AND user_id = ?',
        [transactionId, userId]
      );
      linkedTransaction = reverse;
    }
    if (!linkedTransaction) {
      throw new Error('Linked transaction not found');
    }

    const destId =
      updates.destinationAccountId ??
      updates.transferAccountId ??
      null;

    if (destId && String(destId) !== String(linkedTransaction.account_id)) {
      return this.changeTransferDestination(
        transaction,
        linkedTransaction,
        destId,
        userId,
        updates
      );
    }

    await database.run('BEGIN TRANSACTION');

    try {
      const sourceAccount = await database.get(
        'SELECT id, name FROM accounts WHERE id = ? AND user_id = ?',
        [transaction.account_id, userId]
      );
      const destAccount = await database.get(
        'SELECT id, name FROM accounts WHERE id = ? AND user_id = ?',
        [linkedTransaction.account_id, userId]
      );

      const oldAmount = Number(transaction.amount);
      const newAmount =
        updates.amount !== undefined ? Number(updates.amount) : oldAmount;
      const oppositeAmount = -newAmount;

      const isOutflow = oldAmount < 0;
      const thisPayee =
        updates.payee !== undefined
          ? updates.payee
          : isOutflow
            ? formatTransferPayeeName(destAccount?.name)
            : formatTransferPayeeName(destAccount?.name);
      const linkedPayee = formatTransferPayeeName(sourceAccount?.name);

      const primaryFields = [];
      const primaryValues = [];
      if (updates.date !== undefined) {
        primaryFields.push('date = ?');
        primaryValues.push(updates.date);
      }
      if (updates.payee !== undefined || updates.description !== undefined) {
        primaryFields.push('payee = ?');
        primaryValues.push(thisPayee);
      }
      if (updates.memo !== undefined) {
        primaryFields.push('memo = ?');
        primaryValues.push(updates.memo);
      }
      if (updates.amount !== undefined) {
        primaryFields.push('amount = ?');
        primaryValues.push(newAmount);
      }
      primaryFields.push(
        'category_id = NULL',
        "mapping_status = 'transfer'",
        'updated_at = unixepoch()'
      );
      primaryValues.push(transactionId);
      await database.run(
        `UPDATE transactions SET ${primaryFields.join(', ')} WHERE id = ?`,
        primaryValues
      );

      const linkedFields = [];
      const linkedValues = [];
      if (updates.date !== undefined) {
        linkedFields.push('date = ?');
        linkedValues.push(updates.date);
      }
      linkedFields.push('payee = ?');
      linkedValues.push(linkedPayee);
      if (updates.memo !== undefined) {
        linkedFields.push('memo = ?');
        linkedValues.push(
          updates.memo || `Transfer from ${sourceAccount?.name || 'account'}`
        );
      }
      if (updates.amount !== undefined) {
        linkedFields.push('amount = ?');
        linkedValues.push(oppositeAmount);
      }
      linkedFields.push(
        'category_id = NULL',
        "mapping_status = 'transfer'",
        'updated_at = unixepoch()'
      );
      linkedValues.push(linkedTransaction.id);
      await database.run(
        `UPDATE transactions SET ${linkedFields.join(', ')} WHERE id = ?`,
        linkedValues
      );

      await database.run('COMMIT');

      const txSvc = new TransactionService(getDatabasePath());
      await txSvc.updateAccountBalances(transaction.account_id);
      await txSvc.updateAccountBalances(linkedTransaction.account_id);

      const row = await this.getTransactionRow(database, transactionId, userId);
      return { success: true, data: row };
    } catch (error) {
      await database.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * Move transfer to a different destination account; updates both payees (FR-6).
   */
  async changeTransferDestination(transaction, linkedTransaction, newDestAccountId, userId, updates = {}) {
    if (String(newDestAccountId) === String(transaction.account_id)) {
      throw new Error('Cannot transfer to the same account');
    }

    const database = await getDatabase();
    const sourceAccount = await database.get(
      'SELECT id, name FROM accounts WHERE id = ? AND user_id = ?',
      [transaction.account_id, userId]
    );
    const newDest = await database.get(
      'SELECT id, name FROM accounts WHERE id = ? AND user_id = ?',
      [newDestAccountId, userId]
    );
    if (!sourceAccount || !newDest) throw new Error('Account not found');

    const oldDestAccountId = linkedTransaction.account_id;
    const isOutflow = Number(transaction.amount) < 0;
    const thisPayee = formatTransferPayeeName(newDest.name);
    const linkedPayee = formatTransferPayeeName(sourceAccount.name);

    await database.run('BEGIN TRANSACTION');
    try {
      await database.run(
        `UPDATE transactions SET
          account_id = ?, payee = ?, counterparty_account_id = ?,
          category_id = NULL, mapping_status = 'transfer', updated_at = unixepoch()
         WHERE id = ? AND user_id = ?`,
        [newDestAccountId, linkedPayee, transaction.account_id, linkedTransaction.id, userId]
      );

      const primaryFields = [
        'payee = ?',
        'counterparty_account_id = ?',
        "mapping_status = 'transfer'",
        'category_id = NULL',
        'updated_at = unixepoch()',
      ];
      const primaryValues = [thisPayee, newDestAccountId];

      if (updates.date !== undefined) {
        primaryFields.unshift('date = ?');
        primaryValues.unshift(updates.date);
      }
      if (updates.memo !== undefined) {
        primaryFields.splice(-1, 0, 'memo = ?');
        primaryValues.splice(primaryValues.length - 1, 0, updates.memo);
      }

      primaryValues.push(transaction.id, userId);
      await database.run(
        `UPDATE transactions SET ${primaryFields.join(', ')} WHERE id = ? AND user_id = ?`,
        primaryValues
      );

      if (!transaction.linked_transaction_id) {
        await database.run(
          'UPDATE transactions SET linked_transaction_id = ? WHERE id = ?',
          [linkedTransaction.id, transaction.id]
        );
        await database.run(
          'UPDATE transactions SET linked_transaction_id = ? WHERE id = ?',
          [transaction.id, linkedTransaction.id]
        );
      }

      await database.run('COMMIT');

      const txSvc = new TransactionService(getDatabasePath());
      await txSvc.updateAccountBalances(transaction.account_id);
      await txSvc.updateAccountBalances(oldDestAccountId);
      await txSvc.updateAccountBalances(newDestAccountId);

      const row = await this.getTransactionRow(database, transaction.id, userId);
      return { success: true, data: row };
    } catch (error) {
      await database.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * Remove transfer link; keep this row as a regular transaction (FR-6).
   */
  async unlinkTransferToRegular(transactionId, userId, updates = {}) {
    const database = await getDatabase();
    const transaction = await database.get(
      'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
      [transactionId, userId]
    );
    if (!transaction) throw new Error('Transaction not found');
    if (transaction.is_transfer !== 1) {
      throw new Error('Not a transfer transaction');
    }

    const payee =
      updates.payee ?? updates.description ?? transaction.payee ?? 'Transaction';
    let linkedId = transaction.linked_transaction_id;
    let peerAccountId = null;
    if (linkedId) {
      const peer = await database.get(
        'SELECT id, account_id FROM transactions WHERE id = ?',
        [linkedId]
      );
      if (peer) peerAccountId = peer.account_id;
    }

    await database.run('BEGIN TRANSACTION');
    try {
      if (linkedId) {
        await database.run('DELETE FROM transactions WHERE id = ? AND user_id = ?', [
          linkedId,
          userId,
        ]);
      }

      await database.run(
        `UPDATE transactions SET
          payee = ?, category_id = category_id,
          is_transfer = 0, linked_transaction_id = NULL,
          transfer_group_id = NULL, counterparty_account_id = NULL,
          mapping_status = CASE WHEN category_id IS NOT NULL THEN 'categorized' ELSE 'uncategorized' END,
          suggested_category_id = NULL, suggested_category_source = NULL,
          updated_at = unixepoch()
         WHERE id = ? AND user_id = ?`,
        [payee, transactionId, userId]
      );

      if (updates.date !== undefined) {
        await database.run('UPDATE transactions SET date = ? WHERE id = ?', [
          updates.date,
          transactionId,
        ]);
      }
      if (updates.memo !== undefined) {
        await database.run('UPDATE transactions SET memo = ? WHERE id = ?', [
          updates.memo,
          transactionId,
        ]);
      }
      if (updates.amount !== undefined) {
        await database.run('UPDATE transactions SET amount = ? WHERE id = ?', [
          updates.amount,
          transactionId,
        ]);
      }

      await database.run('COMMIT');

      const txSvc = new TransactionService(getDatabasePath());
      await txSvc.updateAccountBalances(transaction.account_id);
      if (peerAccountId) await txSvc.updateAccountBalances(peerAccountId);

      const row = await this.getTransactionRow(database, transactionId, userId);
      return { success: true, data: row };
    } catch (error) {
      await database.run('ROLLBACK');
      throw error;
    }
  }

  /**
   * Convert an existing transaction into a linked transfer (FR-3, FR-4).
   */
  async convertTransactionToTransfer(transactionId, userId, destinationAccountId, updates = {}) {
    const database = await getDatabase();
    const tx = await database.get(
      'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
      [transactionId, userId]
    );
    if (!tx) throw new Error('Transaction not found');
    if (tx.is_transfer === 1) throw new Error('Already a transfer');
    if (tx.linked_transaction_id) {
      throw new Error('Transaction is already linked');
    }
    if (String(tx.account_id) === String(destinationAccountId)) {
      throw new Error('Cannot transfer to the same account');
    }

    const sourceAccount = await database.get(
      'SELECT id, name FROM accounts WHERE id = ? AND user_id = ?',
      [tx.account_id, userId]
    );
    const destAccount = await database.get(
      'SELECT id, name FROM accounts WHERE id = ? AND user_id = ?',
      [destinationAccountId, userId]
    );
    if (!sourceAccount || !destAccount) throw new Error('Account not found');

    const absAmount = Math.abs(Number(tx.amount));
    if (!Number.isFinite(absAmount) || absAmount === 0) {
      throw new Error('Invalid transfer amount');
    }

    const isOutflow = Number(tx.amount) < 0;
    const transferGroupId = uuidv4();
    const cleared = tx.cleared ?? tx.is_cleared ?? 0;
    const date = updates.date ?? tx.date;
    const memo = updates.memo ?? tx.memo;

    await database.run('BEGIN TRANSACTION');
    try {
      if (isOutflow) {
        const sourcePayee = updates.payee || formatTransferPayeeName(destAccount.name);
        await database.run(
          `UPDATE transactions SET
            payee = ?, amount = ?, date = ?, memo = ?,
            category_id = NULL, is_transfer = 1, mapping_status = 'transfer',
            transfer_group_id = ?, counterparty_account_id = ?,
            suggested_category_id = NULL, suggested_category_source = NULL,
            updated_at = unixepoch()
           WHERE id = ?`,
          [
            sourcePayee,
            -absAmount,
            date,
            memo,
            transferGroupId,
            destinationAccountId,
            transactionId,
          ]
        );

        const destResult = await database.run(
          `INSERT INTO transactions
           (account_id, amount, date, payee, category_id, memo, cleared,
            is_transfer, transfer_group_id, counterparty_account_id, user_id, mapping_status, created_at)
           VALUES (?, ?, ?, ?, NULL, ?, ?, 1, ?, ?, ?, 'transfer', unixepoch())`,
          [
            destinationAccountId,
            absAmount,
            date,
            formatTransferPayeeName(sourceAccount.name),
            memo || `Transfer from ${sourceAccount.name}`,
            cleared ? 1 : 0,
            transferGroupId,
            tx.account_id,
            userId,
          ]
        );

        await database.run(
          'UPDATE transactions SET linked_transaction_id = ? WHERE id = ?',
          [destResult.lastID, transactionId]
        );
        await database.run(
          'UPDATE transactions SET linked_transaction_id = ? WHERE id = ?',
          [transactionId, destResult.lastID]
        );
      } else {
        const destPayee = updates.payee || formatTransferPayeeName(destAccount.name);
        await database.run(
          `UPDATE transactions SET
            payee = ?, amount = ?, date = ?, memo = ?,
            category_id = NULL, is_transfer = 1, mapping_status = 'transfer',
            transfer_group_id = ?, counterparty_account_id = ?,
            suggested_category_id = NULL, suggested_category_source = NULL,
            updated_at = unixepoch()
           WHERE id = ?`,
          [
            destPayee,
            absAmount,
            date,
            memo,
            transferGroupId,
            destinationAccountId,
            transactionId,
          ]
        );

        const sourceResult = await database.run(
          `INSERT INTO transactions
           (account_id, amount, date, payee, category_id, memo, cleared,
            is_transfer, transfer_group_id, counterparty_account_id, user_id, mapping_status, created_at)
           VALUES (?, ?, ?, ?, NULL, ?, ?, 1, ?, ?, ?, 'transfer', unixepoch())`,
          [
            destinationAccountId,
            -absAmount,
            date,
            formatTransferPayeeName(sourceAccount.name),
            memo || `Transfer from ${destAccount.name}`,
            cleared ? 1 : 0,
            transferGroupId,
            tx.account_id,
            userId,
          ]
        );

        await database.run(
          'UPDATE transactions SET linked_transaction_id = ? WHERE id = ?',
          [sourceResult.lastID, transactionId]
        );
        await database.run(
          'UPDATE transactions SET linked_transaction_id = ? WHERE id = ?',
          [transactionId, sourceResult.lastID]
        );
      }

      await database.run('COMMIT');

      const txSvc = new TransactionService(getDatabasePath());
      await txSvc.updateAccountBalances(tx.account_id);
      await txSvc.updateAccountBalances(destinationAccountId);

      const row = await this.getTransactionRow(database, transactionId, userId);
      return { success: true, data: row };
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