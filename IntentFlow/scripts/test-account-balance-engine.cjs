/**
 * Unit tests for account balance engine (YNAB-style credit card ledger).
 */
const assert = require('assert');
const {
  calculateTransactionImpact,
  computeAccountBalances,
  computeTransactionsWithRunningBalance,
  buildStartingBalanceTransactionFields,
  signedStartingBalanceAmount,
  hasSystemStartingTransaction,
  isStartingBalanceTransaction,
  validateAccountLedgerInvariant,
  resolveTransactionDisplayColumns,
  transactionShowsDualLedgerColumns,
  assertExclusiveLedgerColumns,
} = require('../src/utils/accountBalanceEngine.cjs');
function tx(amount, opts = {}) {
  return { amount, is_deleted: 0, is_cleared: opts.cleared ? 1 : 0, ...opts };
}

function startingBalanceTx(amount, accountType = 'credit') {
  const fields = buildStartingBalanceTransactionFields(accountType, amount);
  return {
    amount: fields.amount,
    direction: fields.direction,
    payee: 'Starting Balance',
    description: 'Starting Balance',
    is_system: 1,
    is_deleted: 0,
    is_cleared: 1,
  };
}

// Checking: inflow +100, outflow -50 → working 50
{
  const account = { type: 'checking', initial_balance: 0 };
  const txs = [tx(100, { cleared: true }), tx(-50)];
  const bal = computeAccountBalances(account, txs);
  assert.strictEqual(bal.working_balance, 50);
  assert.strictEqual(bal.cleared_balance, 100);
  assert.strictEqual(bal.uncleared_balance, -50);
}

// Credit card legacy: spending -50, payment +30 → working -20 (debt)
{
  const account = { type: 'credit', initial_balance: 0 };
  const txs = [tx(-50), tx(30, { cleared: true })];
  const bal = computeAccountBalances(account, txs);
  assert.strictEqual(bal.working_balance, -20);
}

// Credit card direction-based: opening inflow 500 → balance -500
{
  const account = { type: 'credit', initial_balance: 500 };
  const open = startingBalanceTx(500);
  const bal = computeAccountBalances(account, [open]);
  assert.strictEqual(bal.working_balance, -500);
  assert.strictEqual(open.direction, 'inflow');
  assert.strictEqual(open.amount, 500);
}

// No duplicate starting balance when system tx exists
{
  const account = { type: 'credit', initial_balance: 500 };
  const txs = [startingBalanceTx(500), tx(-100, { direction: 'outflow', amount: 100 })];
  assert.strictEqual(hasSystemStartingTransaction(txs), true);
  const bal = computeAccountBalances(account, txs);
  assert.strictEqual(bal.working_balance, -600);
}

// Spending increases debt: -500 → spend 100 → -600
{
  const account = { type: 'credit', initial_balance: 500 };
  const txs = [
    startingBalanceTx(500),
    { amount: 100, direction: 'outflow', is_deleted: 0, is_cleared: 1 },
  ];
  const bal = computeAccountBalances(account, txs);
  assert.strictEqual(bal.working_balance, -600);
}

// Payment reduces debt: -600 → payment 100 → -500
{
  const account = { type: 'credit', initial_balance: 500 };
  const txs = [
    startingBalanceTx(500),
    { amount: 100, direction: 'outflow', is_deleted: 0, is_cleared: 1 },
    { amount: 100, direction: 'inflow', is_deleted: 0, is_cleared: 1, is_transfer: 1 },
  ];
  const bal = computeAccountBalances(account, txs);
  assert.strictEqual(bal.working_balance, -500);
}

// Initial balance without system tx: checking 1000 + tx 50 = 1050
{
  const account = { type: 'checking', initial_balance: 1000 };
  const txs = [tx(50)];
  const bal = computeAccountBalances(account, txs);
  assert.strictEqual(bal.working_balance, 1050);
}

// System starting balance tx: no double-count with initial_balance field
{
  const account = { type: 'checking', initial_balance: 1000 };
  const txs = [startingBalanceTx(1000, 'checking'), tx(-25)];
  const bal = computeAccountBalances(account, txs);
  assert.strictEqual(bal.working_balance, 975);
}

// Running balance on credit card register
{
  const account = { type: 'credit', initial_balance: 500 };
  const txs = [
    startingBalanceTx(500),
    { amount: 100, direction: 'outflow', is_deleted: 0, is_cleared: 1, date: '2026-01-02' },
    { amount: 100, direction: 'inflow', is_deleted: 0, is_cleared: 1, date: '2026-01-03', is_transfer: 1 },
  ];
  const withBal = computeTransactionsWithRunningBalance(account, txs);
  assert.strictEqual(withBal[0].running_balance, -500);
  assert.strictEqual(withBal[1].running_balance, -600);
  assert.strictEqual(withBal[2].running_balance, -500);
}

// Direction-based checking transactions
{
  const account = { type: 'checking', initial_balance: 0 };
  const txs = [
    { amount: 75, direction: 'inflow', is_deleted: 0, is_cleared: 1 },
    { amount: 25, direction: 'outflow', is_deleted: 0, is_cleared: 0 },
  ];
  assert.strictEqual(calculateTransactionImpact(txs[0], 'checking'), 75);
  assert.strictEqual(calculateTransactionImpact(txs[1], 'checking'), -25);
  const bal = computeAccountBalances(account, txs);
  assert.strictEqual(bal.working_balance, 50);
}

// buildStartingBalanceTransactionFields
{
  const credit = buildStartingBalanceTransactionFields('credit', 500);
  assert.strictEqual(credit.amount, 500);
  assert.strictEqual(credit.direction, 'inflow');
  assert.strictEqual(credit.signedAmount, -500);
  const checking = buildStartingBalanceTransactionFields('checking', 500);
  assert.strictEqual(checking.signedAmount, 500);
}

assert.strictEqual(signedStartingBalanceAmount('credit', 500), -500);
assert.strictEqual(signedStartingBalanceAmount('checking', 500), 500);
assert.strictEqual(isStartingBalanceTransaction(startingBalanceTx(100)), true);

// Credit card overpayment
{
  const account = { type: 'credit', initial_balance: 0 };
  const txs = [tx(-200), tx(230, { cleared: true })];
  const bal = computeAccountBalances(account, txs);
  assert.strictEqual(bal.working_balance, 30);
}

// Ledger invariant I3
{
  const account = { type: 'credit', initial_balance: 500 };
  const txs = [
    startingBalanceTx(500),
    { amount: 50, direction: 'outflow', is_deleted: 0, is_cleared: 1 },
  ];
  const check = validateAccountLedgerInvariant(account, txs);
  assert.strictEqual(check.valid, true);
  assert.strictEqual(check.working_balance, -550);
}

// Exclusive inflow/outflow register columns (YNAB rule)
{
  const outflowOnly = resolveTransactionDisplayColumns({
    amount: 100,
    direction: 'outflow',
    is_deleted: 0,
  });
  assert.strictEqual(outflowOnly.inflow, 0);
  assert.strictEqual(outflowOnly.outflow, 100);
  assert.strictEqual(
    transactionShowsDualLedgerColumns({ amount: 100, direction: 'outflow', is_deleted: 0 }),
    false
  );
}
{
  const inflowOnly = resolveTransactionDisplayColumns({
    amount: 100,
    direction: 'inflow',
    is_deleted: 0,
  });
  assert.strictEqual(inflowOnly.inflow, 100);
  assert.strictEqual(inflowOnly.outflow, 0);
}
{
  // Legacy signed outflow
  const legacy = resolveTransactionDisplayColumns({ amount: -50, is_deleted: 0 });
  assert.strictEqual(legacy.inflow, 0);
  assert.strictEqual(legacy.outflow, 50);
}
assert.throws(
  () => assertExclusiveLedgerColumns({ amount: -100, direction: 'outflow' }),
  (err) => err.code === 'DUAL_COLUMN_LEDGER_VIOLATION'
);

console.log('✅ account balance engine tests passed (credit card ledger scenarios)');
