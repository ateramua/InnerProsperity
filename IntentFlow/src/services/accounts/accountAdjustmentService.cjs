'use strict';

const TransactionService = require('../transactions/transactionService.cjs');
const { runPostTransactionEffects } = require('../transactions/transactionLifecycle.cjs');

/**
 * Standalone balance adjustment (same ledger shape as reconcile adjustment).
 * @param {import('sqlite').Database} db
 * @param {string} dbPath
 */
async function applyManualBalanceAdjustment(db, dbPath, { accountId, userId, delta, memo }) {
  const amount = Number(delta) || 0;
  if (!accountId || !userId) {
    throw new Error('Account and user are required');
  }
  if (Math.abs(amount) < 0.005) {
    throw new Error('Adjustment amount must be non-zero');
  }

  const account = await db.get(
    'SELECT id FROM accounts WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?',
    [accountId, userId]
  );
  if (!account) throw new Error('Account not found');

  const txSvc = new TransactionService(async () => db);
  const balancesBefore = await txSvc.getAccountBalanceDetails(accountId, userId);
  const date = new Date().toISOString().slice(0, 10);

  const result = await db.run(
    `INSERT INTO transactions (
       account_id, user_id, date, description, amount,
       payee, memo, is_cleared, is_system, is_reconciled, is_adjustment,
       created_at, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 1, 1, datetime('now'), datetime('now'))`,
    [
      accountId,
      userId,
      date,
      'Manual Balance Adjustment',
      amount,
      'Manual Balance Adjustment',
      memo || `Manual adjustment of ${amount}`,
    ]
  );

  await txSvc.updateAccountBalances(accountId);
  const balancesAfter = await txSvc.getAccountBalanceDetails(accountId, userId);

  const poolTx = await db.get('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [
    result.lastID,
    userId,
  ]);
  await runPostTransactionEffects(userId, {
    accountIds: [accountId],
    dates: [date],
    skipLedgerSync: true,
    db,
    poolTransaction: poolTx,
  });

  return {
    transactionId: result.lastID,
    previousBalance: balancesBefore?.working_balance ?? 0,
    newBalance: balancesAfter?.working_balance ?? 0,
    delta: amount,
  };
}

module.exports = {
  applyManualBalanceAdjustment,
};
