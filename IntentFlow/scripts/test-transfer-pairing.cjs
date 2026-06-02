#!/usr/bin/env node
const assert = require('assert');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { v4: uuidv4 } = require('uuid');
const { pairTransfersForUser } = require('../src/services/transactions/plaidTransferPairing.cjs');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE accounts (id TEXT PRIMARY KEY, user_id INTEGER, name TEXT, type TEXT);
    CREATE TABLE transactions (
      id TEXT PRIMARY KEY, user_id INTEGER, account_id TEXT, date TEXT, amount REAL,
      payee TEXT, description TEXT, is_transfer INTEGER DEFAULT 0,
      linked_transaction_id TEXT, transfer_group_id TEXT, counterparty_account_id TEXT,
      is_deleted INTEGER, is_split_parent INTEGER, plaid_transaction_id TEXT,
      category_id TEXT, suggested_category_id TEXT, mapping_status TEXT,
      created_at TEXT, updated_at TEXT, memo TEXT
    );
  `);

  const userId = 1;
  const checking = uuidv4();
  const savings = uuidv4();
  await db.run(`INSERT INTO accounts VALUES (?, ?, 'Checking', 'checking')`, [checking, userId]);
  await db.run(`INSERT INTO accounts VALUES (?, ?, 'Savings', 'savings')`, [savings, userId]);

  const outId = uuidv4();
  const inId = uuidv4();
  await db.run(
    `INSERT INTO transactions (id, user_id, account_id, date, amount, payee, is_transfer)
     VALUES (?, ?, ?, '2026-05-15', -500, 'Online transfer', 0)`,
    [outId, userId, checking]
  );
  await db.run(
    `INSERT INTO transactions (id, user_id, account_id, date, amount, payee, is_transfer)
     VALUES (?, ?, ?, '2026-05-15', 500, 'Transfer deposit', 0)`,
    [inId, userId, savings]
  );

  const result = await pairTransfersForUser(db, userId, { lookbackDays: 30, minScore: 3 });
  assert.strictEqual(result.pairsLinked, 1);

  const out = await db.get('SELECT is_transfer, linked_transaction_id FROM transactions WHERE id = ?', [
    outId,
  ]);
  const inn = await db.get('SELECT is_transfer, linked_transaction_id FROM transactions WHERE id = ?', [
    inId,
  ]);
  assert.strictEqual(out.is_transfer, 1);
  assert.strictEqual(inn.is_transfer, 1);
  assert.strictEqual(String(out.linked_transaction_id), String(inId));

  await db.close();
  console.log('✅ transfer pairing tests passed');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
