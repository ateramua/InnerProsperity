/**
 * Credit card opening balance — register anchor without historical import.
 * Mirrors IntentFlow/YNAB-style: system starting balance tx, no category, CC payment bucket sync.
 */

const { v4: uuidv4 } = require('uuid');
const {
  STARTING_BALANCE_PAYEE,
  STARTING_BALANCE_DESCRIPTION,
  STARTING_BALANCE_MEMO,
  CREDIT_OPENING_BALANCE_TYPE,
  OPENING_BALANCE_AUDIT_SOURCES,
} = require('../../shared/openingBalanceConstants.cjs');
const {
  buildStartingBalanceTransactionFields,
  sumTransactionImpacts,
  isStartingBalanceTransaction,
  validateAccountLedgerInvariant,
} = require('../../utils/accountBalanceEngine.cjs');
const {
  ensureCreditCardPaymentCategoryForAccount,
  isEligibleBudgetCreditCardAccount,
} = require('./creditCardPaymentCategoryService.cjs');
const { applyCreditCardPaymentReserveDelta } = require('../transactions/creditCardReserveUtils.cjs');

function roundMoney(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function isCreditOpeningBalanceTransaction(tx) {
  if (!tx || tx.is_deleted === 1 || tx.is_deleted === true) return false;
  if (String(tx.transaction_type || '') === CREDIT_OPENING_BALANCE_TYPE) return true;
  return isStartingBalanceTransaction(tx);
}

function isOpeningBalanceCategoryBlocked(tx) {
  return isCreditOpeningBalanceTransaction(tx);
}

async function findCreditOpeningBalanceTransaction(db, accountId, userId) {
  return db.get(
    `SELECT * FROM transactions
     WHERE account_id = ? AND user_id = ?
       AND IFNULL(is_deleted, 0) = 0
       AND (
         transaction_type = ?
         OR (
           IFNULL(is_system, 0) = 1
           AND (LOWER(payee) = 'starting balance' OR LOWER(description) = 'starting balance')
         )
       )
     ORDER BY date ASC, created_at ASC
     LIMIT 1`,
    [accountId, userId, CREDIT_OPENING_BALANCE_TYPE]
  );
}

async function logOpeningBalanceAudit(db, {
  userId,
  accountId,
  transactionId = null,
  eventType,
  previousAmount = null,
  newAmount = null,
  previousDate = null,
  newDate = null,
  source = null,
  payload = null,
}) {
  await db.run(
    `INSERT INTO opening_balance_audit (
      id, user_id, account_id, transaction_id, event_type,
      previous_amount, new_amount, previous_date, new_date, source, payload_json, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
    [
      uuidv4(),
      userId,
      accountId,
      transactionId,
      eventType,
      previousAmount,
      newAmount,
      previousDate,
      newDate,
      source,
      payload ? JSON.stringify(payload) : null,
    ]
  );
}

async function syncPaymentCategoryForOpeningDebt(
  db,
  { userId, account, debtAmount, date, previousDebtAmount = 0 }
) {
  if (!isEligibleBudgetCreditCardAccount(account)) return;
  const nextDebt = roundMoney(Math.max(0, Number(debtAmount) || 0));
  const prevDebt = roundMoney(Math.max(0, Number(previousDebtAmount) || 0));
  const delta = roundMoney(nextDebt - prevDebt);
  if (Math.abs(delta) < 0.005) return;

  await ensureCreditCardPaymentCategoryForAccount(db, account, {
    reason: 'credit_opening_balance',
  });
  await applyCreditCardPaymentReserveDelta(db, {
    userId,
    accountId: account.id,
    date: date || new Date().toISOString().slice(0, 10),
    delta,
    userIntentAssignment: true,
  });
}

/**
 * Create system credit opening balance transaction (no category, no RTA).
 */
async function createCreditOpeningBalanceTransaction(
  db,
  {
    account,
    userId,
    startDate = null,
    source = OPENING_BALANCE_AUDIT_SOURCES.MANUAL_ACCOUNT_CREATE,
    syncPaymentCategory = true,
  }
) {
  const debtMagnitude = roundMoney(Math.abs(Number(account.initial_balance) || 0));
  if (debtMagnitude < 0.005) return null;

  const existing = await findCreditOpeningBalanceTransaction(db, account.id, userId);
  if (existing) return { id: existing.id, skipped: true };

  const { amount, direction } = buildStartingBalanceTransactionFields(account.type, debtMagnitude);
  const date = startDate || new Date().toISOString().slice(0, 10);

  const result = await db.run(
    `INSERT INTO transactions (
      account_id, user_id, date, description, amount, direction,
      payee, memo, category_id, is_cleared, is_system, is_reconciled, is_adjustment,
      transaction_type, affects_rta, mapping_status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 1, 1, 1, 0, ?, 0, 'not_applicable', datetime('now'), datetime('now'))`,
    [
      account.id,
      userId,
      date,
      STARTING_BALANCE_DESCRIPTION,
      amount,
      direction,
      STARTING_BALANCE_PAYEE,
      STARTING_BALANCE_MEMO,
      CREDIT_OPENING_BALANCE_TYPE,
    ]
  );

  const transactionId = result.lastID;

  await db.run(
    `UPDATE accounts
     SET credit_opening_balance_transaction_id = ?,
         updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [transactionId, account.id, userId]
  );

  await logOpeningBalanceAudit(db, {
    userId,
    accountId: account.id,
    transactionId,
    eventType: 'created',
    newAmount: debtMagnitude,
    newDate: date,
    source,
  });

  if (syncPaymentCategory) {
    await syncPaymentCategoryForOpeningDebt(db, {
      userId,
      account,
      debtAmount: debtMagnitude,
      date,
      previousDebtAmount: 0,
    });
  }

  return { id: transactionId };
}

/**
 * Finalize manual credit account: opening balance tx + balance recompute.
 */
async function finalizeCreditAccountOpeningBalance(
  db,
  { accountId, userId, startDate = null, source = OPENING_BALANCE_AUDIT_SOURCES.MANUAL_ACCOUNT_CREATE, updateBalances }
) {
  const account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [
    accountId,
    userId,
  ]);
  if (!account) return null;

  const initialBalance = roundMoney(Math.abs(Number(account.initial_balance) || 0));
  if (initialBalance < 0.005) return account;

  const existing = await findCreditOpeningBalanceTransaction(db, accountId, userId);
  if (existing) return account;

  await createCreditOpeningBalanceTransaction(db, {
    account,
    userId,
    startDate,
    source,
  });

  if (typeof updateBalances === 'function') {
    await updateBalances(accountId);
  }

  return db.get('SELECT * FROM accounts WHERE id = ?', [accountId]);
}

/**
 * Compute opening debt magnitude so register matches target balance after existing txs.
 * targetBalance and txImpactSum are signed (credit: negative = debt).
 */
function computeOpeningDebtMagnitude(targetBalance, txImpactSum) {
  const target = roundMoney(Number(targetBalance) || 0);
  const txSum = roundMoney(Number(txImpactSum) || 0);
  return roundMoney(Math.max(0, txSum - target));
}

async function sumNonOpeningTransactionImpacts(db, accountId, userId, accountType) {
  const rows = await db.all(
    `SELECT * FROM transactions
     WHERE account_id = ? AND user_id = ?
       AND IFNULL(is_deleted, 0) = 0
       AND IFNULL(transaction_type, '') != ?
       AND NOT (
         IFNULL(is_system, 0) = 1
         AND (LOWER(payee) = 'starting balance' OR LOWER(description) = 'starting balance')
       )`,
    [accountId, userId, CREDIT_OPENING_BALANCE_TYPE]
  );
  return roundMoney(sumTransactionImpacts(rows, accountType));
}

/**
 * Plaid credit card link: anchor register to bank balance without double-counting synced txs.
 */
async function processPlaidCreditCardOpeningBalance(
  db,
  userId,
  candidates,
  { updateBalances, syncPaymentCategory = true } = {}
) {
  const results = [];
  for (const candidate of candidates || []) {
    if (candidate.skip) continue;
    const accountId = candidate.accountId;
    const account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [
      accountId,
      userId,
    ]);
    if (!account || String(account.type || '').toLowerCase() !== 'credit') continue;

    const existing = await findCreditOpeningBalanceTransaction(db, accountId, userId);
    if (existing) {
      await db.run(
        `UPDATE accounts SET onboarding_complete = 1, updated_at = datetime('now') WHERE id = ?`,
        [accountId]
      );
      results.push({ accountId, skipped: true, reason: 'existing_opening_balance' });
      continue;
    }

    const targetBalance = roundMoney(Number(candidate.importedBalance ?? account.balance) || 0);
    const txImpactSum = await sumNonOpeningTransactionImpacts(db, accountId, userId, account.type);
    const openingMagnitude = computeOpeningDebtMagnitude(targetBalance, txImpactSum);

    if (openingMagnitude < 0.005) {
      await db.run(
        `UPDATE accounts SET onboarding_complete = 1, updated_at = datetime('now') WHERE id = ?`,
        [accountId]
      );
      results.push({ accountId, skipped: true, reason: 'zero_opening_debt' });
      continue;
    }

    await db.run(
      `UPDATE accounts SET initial_balance = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
      [openingMagnitude, accountId, userId]
    );

    const refreshed = await db.get('SELECT * FROM accounts WHERE id = ?', [accountId]);
    const created = await createCreditOpeningBalanceTransaction(db, {
      account: refreshed,
      userId,
      startDate: candidate.startDate || new Date().toISOString().slice(0, 10),
      source: OPENING_BALANCE_AUDIT_SOURCES.PLAID_LINK,
      syncPaymentCategory,
    });

    if (typeof updateBalances === 'function') {
      await updateBalances(accountId);
    }

    await db.run(
      `UPDATE accounts SET onboarding_complete = 1, updated_at = datetime('now') WHERE id = ?`,
      [accountId]
    );

    results.push({
      accountId,
      transactionId: created?.id,
      openingMagnitude,
      targetBalance,
      txImpactSum,
    });
  }
  return results;
}

/**
 * After historical import, detect register drift vs bank balance (double-count guard).
 */
async function reconcileAfterHistoricalImport(db, userId, accountId) {
  const account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [
    accountId,
    userId,
  ]);
  if (!account || String(account.type || '').toLowerCase() !== 'credit') {
    return { ok: true, skipped: true };
  }

  const txs = await db.all(
    `SELECT * FROM transactions
     WHERE account_id = ? AND user_id = ? AND IFNULL(is_deleted, 0) = 0`,
    [accountId, userId]
  );

  const invariant = validateAccountLedgerInvariant(account, txs);
  const bankBalance = roundMoney(Number(account.balance) || 0);
  const drift = roundMoney(invariant.working_balance - bankBalance);

  if (Math.abs(drift) > 0.02 && String(account.source || '') === 'plaid') {
    await logOpeningBalanceAudit(db, {
      userId,
      accountId,
      eventType: 'reconcile_drift_detected',
      source: OPENING_BALANCE_AUDIT_SOURCES.HISTORICAL_IMPORT_RECONCILE,
      payload: {
        working_balance: invariant.working_balance,
        bank_balance: bankBalance,
        drift,
      },
    });
    return { ok: false, drift, working_balance: invariant.working_balance, bank_balance: bankBalance };
  }

  return { ok: true, drift };
}

/**
 * User-initiated edit of credit opening balance (amount/date) with audit + payment bucket sync.
 */
async function updateCreditOpeningBalanceTransaction(
  db,
  {
    userId,
    accountId,
    transactionId,
    newAmount = null,
    newDate = null,
    source = OPENING_BALANCE_AUDIT_SOURCES.USER_EDIT,
    updateBalances,
  }
) {
  const tx = await db.get(
    `SELECT t.*, a.type AS account_type, a.initial_balance
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE t.id = ? AND t.user_id = ? AND t.account_id = ?`,
    [transactionId, userId, accountId]
  );
  if (!tx || !isCreditOpeningBalanceTransaction(tx)) {
    const err = new Error('Not a credit opening balance transaction');
    err.code = 'OPENING_BALANCE_NOT_FOUND';
    throw err;
  }

  const account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [
    accountId,
    userId,
  ]);
  if (!account) throw new Error('Account not found');

  const prevMagnitude = roundMoney(Math.abs(Number(tx.amount) || 0));
  const nextMagnitude =
    newAmount != null ? roundMoney(Math.abs(Number(newAmount) || 0)) : prevMagnitude;
  const nextDate = newDate || tx.date;
  const { amount, direction } = buildStartingBalanceTransactionFields(account.type, nextMagnitude);

  await db.run(
    `UPDATE transactions
     SET amount = ?, direction = ?, date = ?, category_id = NULL, mapping_status = 'not_applicable',
         updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [amount, direction, nextDate, transactionId, userId]
  );

  await db.run(
    `UPDATE accounts SET initial_balance = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?`,
    [nextMagnitude, accountId, userId]
  );

  await logOpeningBalanceAudit(db, {
    userId,
    accountId,
    transactionId,
    eventType: 'updated',
    previousAmount: prevMagnitude,
    newAmount: nextMagnitude,
    previousDate: tx.date,
    newDate: nextDate,
    source,
  });

  const refreshedAccount = await db.get('SELECT * FROM accounts WHERE id = ?', [accountId]);
  await syncPaymentCategoryForOpeningDebt(db, {
    userId,
    account: refreshedAccount,
    debtAmount: nextMagnitude,
    date: nextDate,
    previousDebtAmount: prevMagnitude,
  });

  if (typeof updateBalances === 'function') {
    await updateBalances(accountId);
  }

  return db.get('SELECT * FROM transactions WHERE id = ?', [transactionId]);
}

module.exports = {
  isCreditOpeningBalanceTransaction,
  isOpeningBalanceCategoryBlocked,
  findCreditOpeningBalanceTransaction,
  createCreditOpeningBalanceTransaction,
  finalizeCreditAccountOpeningBalance,
  processPlaidCreditCardOpeningBalance,
  reconcileAfterHistoricalImport,
  updateCreditOpeningBalanceTransaction,
  syncPaymentCategoryForOpeningDebt,
  computeOpeningDebtMagnitude,
  logOpeningBalanceAudit,
};
