/**
 * Persisted Ready to Assign pool — unallocated funds only.
 * Spending does not mutate this balance; transfers to tracking/off-budget accounts do.
 */

const { roundMoney } = require('../../shared/readyToAssignEngine.cjs');
const {
  isIncomeTransaction,
  isReadyToAssignSentinel,
} = require('../../shared/readyToAssignCategory.cjs');
const { isOnBudgetCashAccount } = require('../../utils/cashAccountUtils.cjs');

function isTransferTransaction(tx) {
  if (!tx) return false;
  if (tx.is_transfer === 1 || tx.is_transfer === true) return true;
  const payee = String(tx.payee || tx.description || '').trim();
  return payee.startsWith('Transfer:');
}

function categoryLooksLikeIncome(name, groupName) {
  const label = String(name || '').toLowerCase();
  const group = String(groupName || '').toLowerCase();
  return label.includes('income') || group.includes('income') || group === 'inflow';
}

async function isIncomeTypeCategory(db, categoryId) {
  if (categoryId == null || categoryId === '' || isReadyToAssignSentinel(categoryId)) {
    return true;
  }
  try {
    const cat = await db.get(
      `SELECT c.name, g.name AS group_name
       FROM categories c
       LEFT JOIN category_groups g ON CAST(g.id AS TEXT) = CAST(c.group_id AS TEXT)
       WHERE c.id = ?`,
      [categoryId]
    );
    if (!cat) return false;
    return categoryLooksLikeIncome(cat.name, cat.group_name);
  } catch (err) {
    const message = String(err?.message || err);
    if (!/no such (column|table)/i.test(message)) {
      throw err;
    }
    return readIncomeTypeCategoryFallback(db, categoryId);
  }
}

async function readIncomeTypeCategoryFallback(db, categoryId) {
  try {
    const cat = await db.get('SELECT name FROM categories WHERE id = ?', [categoryId]);
    if (!cat) return false;
    return categoryLooksLikeIncome(cat.name, null);
  } catch (err) {
    const message = String(err?.message || err);
    if (!/no such column/i.test(message)) {
      throw err;
    }
    const legacy = await db.get('SELECT type FROM categories WHERE id = ?', [categoryId]);
    if (!legacy) return false;
    return String(legacy.type || '').toLowerCase() === 'income';
  }
}

function isReconciliationOrManualAdjustment(tx) {
  if (!tx) return false;
  return tx.is_adjustment === 1 || tx.is_adjustment === true || tx.is_adjustment === '1';
}

/**
 * Income credited to Ready to Assign (positive inflow on on-budget cash).
 * @param {object} tx
 * @param {object|null} account
 */
function isReadyToAssignInflow(tx, account) {
  if (!tx || !account || !isOnBudgetCashAccount(account)) return false;
  if (isTransferTransaction(tx)) return false;
  if (!isIncomeTransaction(tx)) return false;
  const categoryId = tx.category_id ?? tx.categoryId;
  if (categoryId != null && categoryId !== '' && !isReadyToAssignSentinel(categoryId)) {
    return false;
  }
  return true;
}

/**
 * Whether a transaction should mutate the persisted RTA pool (income, adjustments).
 */
async function shouldMutatePoolForTransaction(db, tx, account) {
  if (!tx || !account || !isOnBudgetCashAccount(account)) return false;
  if (isTransferTransaction(tx)) return false;

  if (isReconciliationOrManualAdjustment(tx)) {
    return Math.abs(Number(tx.amount) || 0) >= 0.005;
  }

  if (!isIncomeTransaction(tx)) return false;
  const categoryId = tx.category_id ?? tx.categoryId;
  return isIncomeTypeCategory(db, categoryId);
}

function inflowAmount(tx) {
  const amount = roundMoney(Math.abs(Number(tx.amount) || 0));
  return amount > 0 ? amount : 0;
}

async function ensurePoolRow(db, userId) {
  await db.run(
    `INSERT INTO user_budget_pool (user_id, ready_to_assign_balance, updated_at)
     VALUES (?, 0, datetime('now'))
     ON CONFLICT(user_id) DO NOTHING`,
    [userId]
  );
}

async function getPoolBalance(db, userId) {
  if (!userId) return 0;
  const rtaLedgerService = require('./rtaLedgerService.cjs');
  if (await rtaLedgerService.isLedgerAuthorityEnabled(db, userId)) {
    return rtaLedgerService.computeDerivedRta(db, userId);
  }
  await ensurePoolRow(db, userId);
  const row = await db.get(
    'SELECT ready_to_assign_balance FROM user_budget_pool WHERE user_id = ?',
    [userId]
  );
  return roundMoney(Number(row?.ready_to_assign_balance) || 0);
}

async function setPoolBalance(db, userId, balance, opts = {}) {
  if (!userId) return 0;
  const rtaLedgerService = require('./rtaLedgerService.cjs');
  if (await rtaLedgerService.isLedgerAuthorityEnabled(db, userId)) {
    rtaLedgerService.assertAdministrativeSetAllowed({
      allowAdministrative: opts.allowAdministrative,
      source: opts.source,
    });
  }
  const next = roundMoney(balance);
  await ensurePoolRow(db, userId);
  await db.run(
    `UPDATE user_budget_pool
     SET ready_to_assign_balance = ?, updated_at = datetime('now')
     WHERE user_id = ?`,
    [next, userId]
  );
  return next;
}

async function adjustPoolBalance(db, userId, delta) {
  const current = await getPoolBalance(db, userId);
  return setPoolBalance(db, userId, current + roundMoney(delta));
}

/**
 * Assignment changes move funds between the RTA pool and category envelopes.
 * @param {number} previousAssigned
 * @param {number} newAssigned
 */
async function applyAssignmentPoolDelta(db, userId, previousAssigned, newAssigned, opts = {}) {
  if (!userId || opts.skipPoolAdjustment) return await getPoolBalance(db, userId);
  const delta = roundMoney(Number(newAssigned) - Number(previousAssigned));
  if (Math.abs(delta) < 0.005) return await getPoolBalance(db, userId);

  const rtaLedgerService = require('./rtaLedgerService.cjs');
  if (await rtaLedgerService.isLedgerAuthorityEnabled(db, userId)) {
    const sync = await rtaLedgerService.syncPoolFromLedger(db, userId, {
      source: opts.source || 'assignment_write',
    });
    return sync.readyToAssign;
  }
  return adjustPoolBalance(db, userId, -delta);
}

async function loadTransactionAccount(db, accountId) {
  if (!accountId) return null;
  return db.get('SELECT * FROM accounts WHERE id = ?', [accountId]);
}

/** Tracking / loan / off-budget destinations (excludes on-budget cash and credit cards). */
function isTrackingOffBudgetAccount(account) {
  if (!account || isOnBudgetCashAccount(account)) return false;
  const destType = String(account.type || '').toLowerCase();
  if (destType.includes('credit')) return false;
  const category = String(account.account_type_category || '').toLowerCase();
  if (category === 'tracking' || category === 'loan') return true;
  if (account.on_budget === 0 || account.on_budget === '0' || account.on_budget === false) {
    return true;
  }
  if (destType === 'investment' || destType === 'other') return true;
  return false;
}

function isBudgetToTrackingTransfer(sourceAccount, destinationAccount) {
  return isOnBudgetCashAccount(sourceAccount) && isTrackingOffBudgetAccount(destinationAccount);
}

/**
 * Budget → tracking transfers remove funds from the RTA pool.
 * @param {{ sourceAccountId: string, destinationAccountId: string, amount: number }} pair
 * @param {'apply'|'reverse'} mode
 */
function buildTransferPairFromTransaction(tx) {
  if (!tx || !(tx.is_transfer === 1 || tx.is_transfer === true)) return null;
  const amount = roundMoney(Math.abs(Number(tx.amount) || 0));
  if (amount <= 0) return null;
  const counterpartyId = tx.counterparty_account_id ?? tx.counterpartyAccountId;
  if (!counterpartyId) return null;
  const isOutflow = Number(tx.amount) < 0;
  return {
    sourceAccountId: isOutflow ? tx.account_id ?? tx.accountId : counterpartyId,
    destinationAccountId: isOutflow ? counterpartyId : tx.account_id ?? tx.accountId,
    amount,
  };
}

async function syncPoolForTransferPair(db, userId, pair, mode = 'apply') {
  if (!userId || !pair) return getPoolBalance(db, userId);
  const source = await loadTransactionAccount(db, pair.sourceAccountId);
  const destination = await loadTransactionAccount(db, pair.destinationAccountId);
  if (!isBudgetToTrackingTransfer(source, destination)) {
    return getPoolBalance(db, userId);
  }
  const transferAmount = roundMoney(Math.abs(Number(pair.amount) || 0));
  if (transferAmount <= 0) return getPoolBalance(db, userId);
  const delta = mode === 'reverse' ? transferAmount : -transferAmount;
  return adjustPoolBalance(db, userId, delta);
}

/**
 * Apply or reverse RTA pool credit for an income transaction.
 * @param {'apply'|'reverse'} mode
 */
async function syncPoolForTransaction(db, userId, tx, mode = 'apply') {
  if (!userId || !tx) return 0;
  const account = await loadTransactionAccount(db, tx.account_id ?? tx.accountId);
  if (!(await shouldMutatePoolForTransaction(db, tx, account))) {
    return await getPoolBalance(db, userId);
  }

  let signed;
  if (isReconciliationOrManualAdjustment(tx)) {
    const amount = roundMoney(Number(tx.amount) || 0);
    if (Math.abs(amount) < 0.005) return await getPoolBalance(db, userId);
    signed = mode === 'reverse' ? -amount : amount;
  } else {
    const amount = inflowAmount(tx);
    if (amount <= 0) return await getPoolBalance(db, userId);
    signed = mode === 'reverse' ? -amount : amount;
  }
  return adjustPoolBalance(db, userId, signed);
}

/**
 * One-time migration helper: seed pool from legacy cash − assigned formula.
 */
async function backfillPoolFromLegacy(db, userId, totalCash, totalAssigned) {
  const legacy = roundMoney(Number(totalCash) - Number(totalAssigned));
  const rtaLedgerService = require('./rtaLedgerService.cjs');
  return setPoolBalance(db, userId, legacy, { allowAdministrative: true, source: 'legacy_backfill' });
}

async function ensurePoolBackfilled(db, userId, totalCash, totalAssigned) {
  await ensurePoolRow(db, userId);
  const row = await db.get(
    `SELECT ready_to_assign_balance, pool_backfilled
     FROM user_budget_pool WHERE user_id = ?`,
    [userId]
  );
  if (!row || !row.pool_backfilled) {
    const legacy = roundMoney(Number(totalCash) - Number(totalAssigned));
    await db.run(
      `UPDATE user_budget_pool
       SET ready_to_assign_balance = ?, pool_backfilled = 1, updated_at = datetime('now')
       WHERE user_id = ?`,
      [legacy, userId]
    );
    return legacy;
  }
  return roundMoney(Number(row.ready_to_assign_balance) || 0);
}

module.exports = {
  isReadyToAssignInflow,
  categoryLooksLikeIncome,
  isIncomeTypeCategory,
  shouldMutatePoolForTransaction,
  isReconciliationOrManualAdjustment,
  isTrackingOffBudgetAccount,
  isBudgetToTrackingTransfer,
  ensurePoolRow,
  ensurePoolRow,
  getPoolBalance,
  setPoolBalance,
  adjustPoolBalance,
  applyAssignmentPoolDelta,
  syncPoolForTransaction,
  syncPoolForTransferPair,
  buildTransferPairFromTransaction,
  backfillPoolFromLegacy,
  ensurePoolBackfilled,
};
