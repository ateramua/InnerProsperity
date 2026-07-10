#!/usr/bin/env node
'use strict';

const assert = require('assert');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const {
  computeAccountBalances,
  validateAccountLedgerInvariant,
} = require('../src/utils/accountBalanceEngine.cjs');
const {
  CREDIT_OPENING_BALANCE_TYPE,
} = require('../src/shared/openingBalanceConstants.cjs');
const {
  createCreditOpeningBalanceTransaction,
  finalizeCreditAccountOpeningBalance,
  isOpeningBalanceCategoryBlocked,
  processPlaidCreditCardOpeningBalance,
  computeOpeningDebtMagnitude,
  findCreditOpeningBalanceTransaction,
} = require('../src/services/accounts/creditAccountOpeningBalanceService.cjs');
const {
  ensureCreditCardPaymentCategoryForAccount,
} = require('../src/services/accounts/creditCardPaymentCategoryService.cjs');
const { TransactionCategorizationService } = require('../src/services/transactions/transactionCategorizationService.cjs');
const migration040 = require('../src/db/migrations/040_credit_account_opening_balance.cjs');

async function setupDb() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY);
    INSERT INTO users (id) VALUES (1);
    CREATE TABLE category_groups (
      id TEXT PRIMARY KEY, user_id INTEGER, name TEXT, sort_order INTEGER DEFAULT 0,
      system_managed INTEGER DEFAULT 0, created_at TEXT, updated_at TEXT
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY, user_id INTEGER, name TEXT, group_id TEXT,
      assigned REAL DEFAULT 0, available REAL DEFAULT 0, target_type TEXT, target_amount REAL, target_date TEXT,
      is_credit_card_payment_category INTEGER DEFAULT 0, linked_account_id TEXT,
      priority INTEGER DEFAULT 2, archived INTEGER DEFAULT 0, archived_at TEXT,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE accounts (
      id TEXT PRIMARY KEY, user_id INTEGER, name TEXT, type TEXT,
      account_type_category TEXT, balance REAL DEFAULT 0, initial_balance REAL DEFAULT 0,
      cleared_balance REAL DEFAULT 0, working_balance REAL DEFAULT 0,
      is_active INTEGER DEFAULT 1, account_status TEXT DEFAULT 'active',
      merged_into_account_id TEXT, paired_category_id TEXT,
      source TEXT, onboarding_complete INTEGER DEFAULT 0,
      credit_opening_balance_transaction_id INTEGER,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT, account_id TEXT, user_id INTEGER,
      date TEXT, description TEXT, amount REAL, direction TEXT,
      payee TEXT, memo TEXT, category_id TEXT, is_cleared INTEGER DEFAULT 0,
      is_system INTEGER DEFAULT 0, is_reconciled INTEGER DEFAULT 0, is_adjustment INTEGER DEFAULT 0,
      is_deleted INTEGER DEFAULT 0, transaction_type TEXT, affects_rta INTEGER DEFAULT 0,
      mapping_status TEXT, is_transfer INTEGER DEFAULT 0, cc_payment_reserved REAL DEFAULT 0,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE monthly_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT, category_id TEXT, month TEXT,
      budgeted_amount REAL DEFAULT 0, available_amount REAL DEFAULT 0,
      activity_amount REAL DEFAULT 0, card_payments REAL DEFAULT 0,
      created_at TEXT, updated_at TEXT
    );
    CREATE TABLE opening_balance_audit (
      id TEXT PRIMARY KEY, user_id INTEGER, account_id TEXT, transaction_id INTEGER,
      event_type TEXT, previous_amount REAL, new_amount REAL, previous_date TEXT, new_date TEXT,
      source TEXT, payload_json TEXT, recorded_at TEXT
    );
    CREATE TABLE budget_assignment_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, category_id TEXT, month TEXT,
      previous_amount REAL, new_amount REAL, source TEXT, recorded_at TEXT
    );
    CREATE TABLE user_budget_pool (
      user_id INTEGER PRIMARY KEY, ready_to_assign REAL DEFAULT 0, updated_at TEXT
    );
    INSERT INTO user_budget_pool (user_id, ready_to_assign) VALUES (1, 0);
    CREATE TABLE transaction_splits (
      id INTEGER PRIMARY KEY AUTOINCREMENT, transaction_id INTEGER, category_id TEXT, amount REAL
    );
    CREATE TABLE transaction_category_audit (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, transaction_id INTEGER,
      previous_category_id TEXT, new_category_id TEXT, change_source TEXT, recorded_at TEXT
    );
    CREATE TABLE payees (
      id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER, name TEXT, normalized_key TEXT
    );
  `);
  await migration040(db);
  return db;
}

async function main() {
  const db = await setupDb();
  const userId = 1;
  const account = {
    id: 'cc-1',
    user_id: userId,
    name: 'Test Visa',
    type: 'credit',
    account_type_category: 'credit',
    initial_balance: 257.61,
    balance: -257.61,
    working_balance: -257.61,
    cleared_balance: -257.61,
    is_active: 1,
    account_status: 'active',
  };

  await db.run(
    `INSERT INTO accounts (id, user_id, name, type, account_type_category, initial_balance, balance, working_balance, cleared_balance, is_active, account_status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'active')`,
    [
      account.id,
      userId,
      account.name,
      account.type,
      account.account_type_category,
      account.initial_balance,
      account.balance,
      account.working_balance,
      account.cleared_balance,
    ]
  );

  await ensureCreditCardPaymentCategoryForAccount(db, account, { reason: 'test' });

  const created = await createCreditOpeningBalanceTransaction(db, {
    account,
    userId,
    startDate: '2026-06-06',
    syncPaymentCategory: false,
  });
  assert.ok(created?.id);

  const opening = await findCreditOpeningBalanceTransaction(db, account.id, userId);
  assert.strictEqual(opening.transaction_type, CREDIT_OPENING_BALANCE_TYPE);
  assert.strictEqual(opening.category_id, null);
  assert.strictEqual(opening.mapping_status, 'not_applicable');
  assert.strictEqual(Number(opening.amount), 257.61);
  assert.strictEqual(opening.direction, 'inflow');
  assert.strictEqual(isOpeningBalanceCategoryBlocked(opening), true);

  const txs = await db.all(
    `SELECT * FROM transactions WHERE account_id = ? AND IFNULL(is_deleted, 0) = 0`,
    [account.id]
  );
  const balances = computeAccountBalances(account, txs);
  assert.strictEqual(balances.working_balance, -257.61);

  const invariant = validateAccountLedgerInvariant(account, txs);
  assert.strictEqual(invariant.valid, true);

  const paymentCat = await db.get(
    `SELECT c.* FROM categories c
     JOIN accounts a ON a.paired_category_id = c.id
     WHERE a.id = ?`,
    [account.id]
  );
  assert.ok(paymentCat);
  const monthKey = '2026-06';
  await db.run(
    `INSERT INTO monthly_budgets (category_id, month, budgeted_amount, available_amount)
     VALUES (?, ?, 0, 0)`,
    [paymentCat.id, monthKey]
  );

  await createCreditOpeningBalanceTransaction(db, { account, userId, syncPaymentCategory: false });
  const auditRows = await db.all(`SELECT * FROM opening_balance_audit WHERE account_id = ?`, [
    account.id,
  ]);
  assert.ok(auditRows.length >= 1);

  const categorization = new TransactionCategorizationService();
  let blocked = false;
  try {
    await categorization.assignCategory(db, userId, opening.id, paymentCat.id, {
      source: 'user_action',
    });
  } catch (err) {
    blocked = err.code === 'OPENING_BALANCE_CATEGORY_BLOCKED';
  }
  assert.strictEqual(blocked, true);

  assert.strictEqual(computeOpeningDebtMagnitude(-257.61, -100), 157.61);

  await db.run(`DELETE FROM transactions WHERE account_id = ?`, [account.id]);
  await db.run(`UPDATE accounts SET credit_opening_balance_transaction_id = NULL WHERE id = ?`, [
    account.id,
  ]);
  await db.run(
    `INSERT INTO transactions (account_id, user_id, date, description, amount, direction, is_deleted)
     VALUES (?, ?, '2026-06-01', 'Purchase', 50, 'outflow', 0)`,
    [account.id, userId]
  );

  const plaidResult = await processPlaidCreditCardOpeningBalance(
    db,
    userId,
    [{ accountId: account.id, importedBalance: -257.61 }],
    {
      updateBalances: async () => {},
      syncPaymentCategory: false,
    }
  );
  assert.strictEqual(plaidResult.length, 1);
  assert.ok(plaidResult[0].openingMagnitude > 200);

  const opening2 = await findCreditOpeningBalanceTransaction(db, account.id, userId);
  const txs2 = await db.all(
    `SELECT * FROM transactions WHERE account_id = ? AND IFNULL(is_deleted, 0) = 0`,
    [account.id]
  );
  const bal2 = computeAccountBalances(
    { ...account, initial_balance: opening2.amount },
    txs2
  );
  assert.ok(Math.abs(bal2.working_balance + 257.61) < 0.02);

  console.log('✅ test-credit-account-opening-balance.cjs passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
