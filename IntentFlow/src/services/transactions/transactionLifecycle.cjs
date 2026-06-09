/**
 * Central post-mutation hooks: ledger-derived account balances + forward
 * monthly budget recomputation so activity/available/RTA stay consistent.
 */

const { getDatabase } = require('../../db/database.cjs');
const { getDatabasePath } = require('../../db/database.config.js');
const monthlyBudgetService = require('../budget/monthlyBudgetService.cjs');
const readyToAssignPoolService = require('../budget/readyToAssignPoolService.cjs');
const budgetIntegrityService = require('../budget/budgetIntegrityService.cjs');
const TransactionService = require('./transactionService.cjs');

function uniqueStrings(arr) {
  return [...new Set((arr || []).filter(Boolean))];
}

function earliestMonthKey(dates) {
  let min = null;
  for (const d of dates) {
    if (!d) continue;
    const mk = monthlyBudgetService.toLocalMonthKey(d);
    if (min == null || mk < min) min = mk;
  }
  return min;
}

/**
 * @param {string} userId
 * @param {{ accountIds?: string[], dates?: string[], previousDates?: string[], forwardMonths?: number, skipLedgerSync?: boolean }} opts
 */
async function runPostTransactionEffects(userId, opts = {}) {
  const accountIds = uniqueStrings(opts.accountIds);
  const dates = uniqueStrings([...(opts.dates || []), ...(opts.previousDates || [])]);
  const forwardMonths = opts.forwardMonths;

  if (!opts.skipLedgerSync) {
    const txSvc = new TransactionService(() => getDatabase());
    for (const aid of accountIds) {
      await txSvc.updateAccountBalances(aid);
    }
  }

  if (!userId || !dates.length) return;

  const startMonth = earliestMonthKey(dates);
  if (!startMonth) return;

  const db = opts.db || (await getDatabase());

  if (opts.poolReverseTransaction) {
    await readyToAssignPoolService.syncPoolForTransaction(
      db,
      userId,
      opts.poolReverseTransaction,
      'reverse'
    );
  }
  if (opts.poolTransaction) {
    await readyToAssignPoolService.syncPoolForTransaction(
      db,
      userId,
      opts.poolTransaction,
      'apply'
    );
  }
  if (opts.poolReverseTransferPair) {
    await readyToAssignPoolService.syncPoolForTransferPair(
      db,
      userId,
      opts.poolReverseTransferPair,
      'reverse'
    );
  }
  if (opts.poolTransferPair) {
    await readyToAssignPoolService.syncPoolForTransferPair(
      db,
      userId,
      opts.poolTransferPair,
      'apply'
    );
  }

  await monthlyBudgetService.refreshBudgetMonthsForward(
    db,
    userId,
    startMonth,
    forwardMonths
  );

  if (process.env.INTENTFLOW_ASSERT_BUDGET_IDENTITY === '1') {
    try {
      const state = await budgetIntegrityService.evaluateBudgetIdentity(db, userId, {
        monthKey: startMonth,
      });
      if (!state.invariantValid) {
        console.warn(
          `budget identity drift: cash ${state.onBudgetCash} != RTA ${state.readyToAssign} + categories ${state.categoryTotal} (delta ${state.budgetInvariantDelta})`
        );
      }
    } catch (integrityErr) {
      console.warn('budget identity check:', integrityErr?.message || integrityErr);
    }
  }

  return { startMonth, userId };
}

module.exports = {
  runPostTransactionEffects,
  earliestMonthKey,
};
