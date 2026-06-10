#!/usr/bin/env node
/**
 * Budget CSV import — category-to-group mapping tests.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

const importSvc = require('../src/services/budget/budgetTableImportExport.cjs');
const mbs = require('../src/services/budget/monthlyBudgetService.cjs');

async function makeDb() {
  const dbPath = path.join(os.tmpdir(), `budget-import-test-${Date.now()}.db`);
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec(`
    CREATE TABLE users (id TEXT PRIMARY KEY);
    CREATE TABLE category_groups (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT,
      sort_order INTEGER DEFAULT 0,
      system_managed INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE categories (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      name TEXT,
      group_id TEXT,
      assigned REAL DEFAULT 0,
      activity REAL DEFAULT 0,
      available REAL DEFAULT 0,
      target_type TEXT DEFAULT 'monthly',
      target_amount REAL DEFAULT 0,
      target_date TEXT,
      archived INTEGER DEFAULT 0,
      is_credit_card_payment_category INTEGER DEFAULT 0,
      created_at TEXT,
      updated_at TEXT
    );
    CREATE TABLE monthly_budgets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category_id TEXT,
      month TEXT,
      budgeted_amount REAL DEFAULT 0,
      activity_amount REAL DEFAULT 0,
      available_amount REAL DEFAULT 0
    );
  `);
  await db.run(`INSERT INTO users VALUES ('u1')`);
  await db.run(
    `INSERT INTO category_groups (user_id, name, sort_order) VALUES ('u1', 'Credit Card Payments', 0)`
  );
  await db.run(`INSERT INTO category_groups (user_id, name, sort_order) VALUES ('u1', 'Food', 1)`);
  await db.run(
    `INSERT INTO categories (id, user_id, name, group_id, assigned, target_amount, target_type)
     VALUES ('cat-dining', 'u1', 'Dining Out', NULL, 0, 0, 'monthly')`
  );
  return { db, dbPath };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function run() {
  const { db, dbPath } = await makeDb();
  const userId = 'u1';
  const mKey = '2026-06-01';
  const csvPath = path.join(os.homedir(), 'Downloads/ProsperityMapImport.csv');
  const csv = fs.readFileSync(csvPath, 'utf8');
  const parsed = importSvc.parseImportContent(csv, 'csv', 'ProsperityMapImport.csv');
  const snapshot = {
    monthKey: mKey,
    categories: [
      {
        id: 'cat-dining',
        name: 'Dining Out',
        group_id: null,
        group_name: null,
        assigned: 0,
        target_amount: 0,
        target_type: 'monthly',
      },
    ],
  };
  const preview = importSvc.previewImport(snapshot, parsed.rows, mKey, mbs.toLocalMonthKey.bind(mbs));
  const dining = preview.items.find((i) => i.normalized?.category === 'Dining Out');
  assert(dining?.status === 'update', `Dining Out should match by name (got ${dining?.status})`);
  assert(dining?.changes?.includes('group'), 'Dining Out should need group remap');

  await importSvc.applyImport(
    db,
    userId,
    mKey,
    preview.items.filter((i) => i.normalized?.category === 'Dining Out'),
    {
      createMissing: true,
      updateAssigned: true,
      updateGoals: true,
    },
    {
      monthlyBudgetService: {
        toLocalMonthKey: mbs.toLocalMonthKey.bind(mbs),
        applyMonthBudgetedAmount: async () => {},
        getBudgetMonthSnapshot: async () => ({ categories: [] }),
      },
      notifyBudgetStateChanged: null,
    }
  );

  const row = await db.get(
    `SELECT c.name, c.group_id, cg.name AS group_name
     FROM categories c
     LEFT JOIN category_groups cg ON CAST(cg.id AS TEXT) = CAST(COALESCE(c.group_id, '') AS TEXT)
     WHERE c.id = 'cat-dining'`
  );
  assert(row?.group_name === 'Food', `Dining Out should be under Food (got ${row?.group_name})`);

  const dupes = await db.all(
    `SELECT COUNT(*) AS n FROM categories WHERE user_id = 'u1' AND LOWER(name) = 'dining out'`
  );
  assert(Number(dupes[0]?.n) === 1, 'Should not create duplicate Dining Out');

  await db.close();
  fs.unlinkSync(dbPath);
  console.log('✅ test-budget-table-import passed');
}

run().catch((err) => {
  console.error('❌ test-budget-table-import failed:', err.message);
  process.exit(1);
});
