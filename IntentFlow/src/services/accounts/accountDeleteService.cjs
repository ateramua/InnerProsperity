/**
 * Permanent account removal with safe reference cleanup.
 */

async function ensureDismissalsTable(db) {
  await db.exec(`
    CREATE TABLE IF NOT EXISTS plaid_account_dismissals (
      plaid_account_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      dismissed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (plaid_account_id, user_id)
    );
  `);
}

async function tableExists(db, name) {
  const row = await db.get(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`,
    [name]
  );
  return Boolean(row);
}

async function permanentlyDeleteLiabilityAccount(
  db,
  accountId,
  userId,
  { expectedType, paymentCategoryColumn, notFoundError, deleteFailedError }
) {
  const account = await db.get(
    `SELECT * FROM accounts
     WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
    [accountId, userId]
  );
  if (!account) {
    return { success: false, error: notFoundError };
  }
  if (String(account.type || '').toLowerCase() !== expectedType) {
    return {
      success: false,
      error: `Only ${expectedType} accounts can be permanently deleted here`,
    };
  }

  await ensureDismissalsTable(db);

  const plaidLinks = await db.all(
    `SELECT plaid_account_id FROM plaid_accounts
     WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT)`,
    [accountId]
  );

  await db.exec('BEGIN');
  try {
    const txRows = await db.all(
      `SELECT id FROM transactions
       WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
      [accountId, userId]
    );
    const txIds = txRows.map((r) => r.id);

    if (txIds.length > 0) {
      const ph = txIds.map(() => '?').join(',');
      await db.run(
        `UPDATE transactions SET linked_transaction_id = NULL, transfer_group_id = NULL
         WHERE linked_transaction_id IN (${ph}) AND id NOT IN (${ph})`,
        [...txIds, ...txIds]
      );
      if (await tableExists(db, 'reconciliation_entries')) {
        await db.run(
          `DELETE FROM reconciliation_entries WHERE transaction_id IN (${ph})`,
          txIds
        );
      }
      if (await tableExists(db, 'credit_card_payments')) {
        await db.run(
          `DELETE FROM credit_card_payments WHERE transaction_id IN (${ph}) OR CAST(credit_card_account_id AS TEXT) = CAST(? AS TEXT)`,
          [...txIds, accountId]
        );
      }
      if (await tableExists(db, 'goal_contributions')) {
        await db.run(
          `DELETE FROM goal_contributions WHERE transaction_id IN (${ph})`,
          txIds
        );
      }
      await db.run(`DELETE FROM transactions WHERE id IN (${ph})`, txIds);
    } else if (await tableExists(db, 'credit_card_payments')) {
      await db.run(
        `DELETE FROM credit_card_payments WHERE CAST(credit_card_account_id AS TEXT) = CAST(? AS TEXT)`,
        [accountId]
      );
    }

    await db.run(
      `UPDATE transactions SET transfer_account_id = NULL
       WHERE CAST(transfer_account_id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
      [accountId, userId]
    );
    await db.run(
      `UPDATE transactions SET counterparty_account_id = NULL
       WHERE CAST(counterparty_account_id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
      [accountId, userId]
    );

    if (await tableExists(db, 'reconciliations')) {
      await db.run(
        `DELETE FROM reconciliations WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT)`,
        [accountId]
      );
    }
    if (await tableExists(db, 'scheduled_transactions')) {
      await db.run(
        `DELETE FROM scheduled_transactions WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT)`,
        [accountId]
      );
    }
    if (await tableExists(db, 'account_balance_history')) {
      await db.run(
        `DELETE FROM account_balance_history WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT)`,
        [accountId]
      );
    }
    if (await tableExists(db, 'goals')) {
      await db.run(
        `UPDATE goals SET account_id = NULL
         WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
        [accountId, userId]
      );
    }
    if (await tableExists(db, 'investments')) {
      await db.run(
        `DELETE FROM investments WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT)`,
        [accountId]
      );
    }

    await db.run(
      `UPDATE accounts SET linked_savings_account = NULL
       WHERE CAST(linked_savings_account AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
      [accountId, userId]
    );

    const categoryIds = new Set();
    if (account.paired_category_id) categoryIds.add(account.paired_category_id);
    const linkedCats = await db.all(
      `SELECT id FROM categories
       WHERE user_id = ?
         AND (
           CAST(linked_account_id AS TEXT) = CAST(? AS TEXT)
           OR (${paymentCategoryColumn} = 1 AND CAST(linked_account_id AS TEXT) = CAST(? AS TEXT))
         )`,
      [userId, accountId, accountId]
    );
    for (const row of linkedCats) categoryIds.add(row.id);

    for (const catId of categoryIds) {
      await db.run(
        `UPDATE transactions SET category_id = NULL WHERE category_id = ? AND user_id = ?`,
        [catId, userId]
      );
      await db.run(
        `DELETE FROM categories WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
        [catId, userId]
      );
    }

    for (const link of plaidLinks) {
      await db.run(
        `INSERT OR REPLACE INTO plaid_account_dismissals (plaid_account_id, user_id, dismissed_at)
         VALUES (?, ?, datetime('now'))`,
        [link.plaid_account_id, userId]
      );
    }
    await db.run(
      `DELETE FROM plaid_accounts WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT)`,
      [accountId]
    );

    const result = await db.run(
      `DELETE FROM accounts WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
      [accountId, userId]
    );

    if ((result?.changes ?? 0) === 0) {
      await db.exec('ROLLBACK');
      return { success: false, error: deleteFailedError };
    }

    await db.exec('COMMIT');
    return { success: true, deletedAccountId: accountId };
  } catch (err) {
    await db.exec('ROLLBACK');
    throw err;
  }
}

async function permanentlyDeleteCreditAccount(db, accountId, userId) {
  return permanentlyDeleteLiabilityAccount(db, accountId, userId, {
    expectedType: 'credit',
    paymentCategoryColumn: 'is_credit_card_payment_category',
    notFoundError: 'Credit card account not found',
    deleteFailedError: 'Failed to remove credit card from database',
  });
}

async function permanentlyDeleteLoanAccount(db, accountId, userId) {
  return permanentlyDeleteLiabilityAccount(db, accountId, userId, {
    expectedType: 'loan',
    paymentCategoryColumn: 'is_loan_payment_category',
    notFoundError: 'Loan account not found',
    deleteFailedError: 'Failed to remove loan from database',
  });
}

module.exports = {
  permanentlyDeleteCreditAccount,
  permanentlyDeleteLoanAccount,
  ensureDismissalsTable,
};
