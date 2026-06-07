'use strict';

const TransactionService = require('../transactions/transactionService.cjs');
const { runPostTransactionEffects } = require('../transactions/transactionLifecycle.cjs');
const {
  transactionCategorizationService,
} = require('../transactions/transactionCategorizationService.cjs');
const { applyCreditCardPaymentReserveDelta } = require('../transactions/creditCardReserveUtils.cjs');

/**
 * Post a scheduled transaction row into the live transactions ledger.
 * @param {import('sqlite').Database} db
 * @param {string} dbPath
 */
async function postScheduledTransaction(db, dbPath, userId, scheduledId) {
  const row = await db.get(
    `SELECT * FROM scheduled_transactions
     WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
    [scheduledId, userId]
  );
  if (!row) throw new Error('Scheduled transaction not found');

  const txSvc = new TransactionService(dbPath);
  const txType = String(row.transaction_type || 'outflow').trim().toLowerCase();
  const mag = Math.abs(Number(row.amount) || 0);
  const signedAmount = txType === 'inflow' ? mag : -mag;
  const direction = txType === 'inflow' ? 'inflow' : 'outflow';
  const date = row.date || new Date().toISOString().slice(0, 10);

  const created = await txSvc.createTransaction({
    accountId: row.account_id,
    userId,
    date,
    description: row.payee || 'Scheduled transaction',
    amount: signedAmount,
    categoryId: null,
    payee: row.payee || 'Scheduled',
    memo: row.memo || 'Posted from scheduled transaction',
    isCleared: 1,
  });

  if (created?.id) {
    await db.run(
      `UPDATE transactions SET direction = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
      [direction, created.id, userId]
    );
  }

  let creditReserveDelta = 0;
  if (created?.id && transactionCategorizationService?.processImportedTransaction) {
    const processed = await transactionCategorizationService.processImportedTransaction(
      db,
      userId,
      created.id,
      {
        merchantName: row.payee,
        description: row.payee || 'Scheduled transaction',
        importSource: 'scheduled',
        plaidCategoryId: row.category_id || null,
        isTransfer: false,
      }
    );
    creditReserveDelta = processed.creditReserveDelta || 0;
  }

  if (creditReserveDelta !== 0) {
    await applyCreditCardPaymentReserveDelta(db, {
      userId,
      accountId: row.account_id,
      date,
      delta: creditReserveDelta,
      userIntentAssignment: true,
    });
  }

  await db.run(
    `UPDATE scheduled_transactions
     SET status = 'posted', updated_at = datetime('now')
     WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
    [scheduledId, userId]
  );

  const poolTx = created?.id
    ? await db.get('SELECT * FROM transactions WHERE id = ? AND user_id = ?', [
        created.id,
        userId,
      ])
    : null;

  await runPostTransactionEffects(userId, {
    accountIds: [row.account_id],
    dates: [date],
    skipLedgerSync: true,
    db,
    poolTransaction: poolTx,
  });

  return { scheduledId, transaction: created };
}

module.exports = {
  postScheduledTransaction,
};
