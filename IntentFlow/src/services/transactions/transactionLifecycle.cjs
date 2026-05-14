/**
 * Central post-mutation hooks: ledger-derived account balances + forward
 * monthly budget recomputation so activity/available/RTA stay consistent.
 */

const { getDatabase } = require('../../db/database.cjs');
const { getDatabasePath } = require('../../db/database.config.js');
const monthlyBudgetService = require('../budget/monthlyBudgetService.cjs');
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

  const dbPath = getDatabasePath();
  if (!opts.skipLedgerSync) {
    const txSvc = new TransactionService(dbPath);
    for (const aid of accountIds) {
      await txSvc.updateAccountBalances(aid);
    }
  }

  if (!userId || !dates.length) return;

  const startMonth = earliestMonthKey(dates);
  if (!startMonth) return;

  const db = await getDatabase();
  await monthlyBudgetService.refreshBudgetMonthsForward(
    db,
    userId,
    startMonth,
    forwardMonths
  );
}

module.exports = {
  runPostTransactionEffects,
  earliestMonthKey,
};
