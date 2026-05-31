/**
 * Unit tests for account balance engine (YNAB-style logic).
 */
const assert = require('assert');
const {
  calculateTransactionImpact,
  computeAccountBalances,
  computeTransactionsWithRunningBalance,
  signedStartingBalanceAmount,
} = require('../src/utils/accountBalanceEngine.cjs');

function tx(amount, opts = {}) {
  return { amount, is_deleted: 0, is_cleared: opts.cleared ? 1 : 0, ...opts };
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

// Credit card: spending -50, payment +30 → working -20 (debt)
{
  const account = { type: 'credit', initial_balance: 0 };
  const txs = [tx(-50), tx(30, { cleared: true })];
  const bal = computeAccountBalances(account, txs);
  assert.strictEqual(bal.working_balance, -20);
}

// Initial balance without system tx: initial 1000 + tx 50 = 1050
{
  const account = { type: 'checking', initial_balance: 1000 };
  const txs = [tx(50)];
  const bal = computeAccountBalances(account, txs);
  assert.strictEqual(bal.working_balance, 1050);
}

// System starting balance tx: no double-count with initial_balance field
{
  const account = { type: 'checking', initial_balance: 1000 };
  const txs = [tx(1000, { is_system: 1, cleared: true }), tx(-25)];
  const bal = computeAccountBalances(account, txs);
  assert.strictEqual(bal.working_balance, 975);
}

// Running balance
{
  const account = { type: 'checking', initial_balance: 0 };
  const txs = [tx(100), tx(-40), tx(10)];
  const withBal = computeTransactionsWithRunningBalance(account, txs);
  assert.strictEqual(withBal[2].running_balance, 100);
  assert.strictEqual(withBal[1].running_balance, 60);
  assert.strictEqual(withBal[0].running_balance, 70);
}

// Direction-based transactions
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

// Credit starting balance signed amount
assert.strictEqual(signedStartingBalanceAmount('credit', 500), -500);
assert.strictEqual(signedStartingBalanceAmount('checking', 500), 500);

console.log('✅ account balance engine tests passed (6 scenarios)');
