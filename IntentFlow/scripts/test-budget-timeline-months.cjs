#!/usr/bin/env node
const assert = require('assert');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const { listBudgetTimelineMonths } = require('../src/services/budget/monthlyBudgetService.cjs');

async function run() {
  const db = await open({ filename: ':memory:', driver: sqlite3.Database });

  await db.exec(`
    CREATE TABLE categories (id TEXT PRIMARY KEY, user_id INTEGER, name TEXT, is_archived INTEGER DEFAULT 0);
    CREATE TABLE monthly_budgets (
      category_id TEXT, month TEXT,
      budgeted_amount REAL, activity_amount REAL, available_amount REAL
    );
  `);

  const userId = 1;
  await db.run(`INSERT INTO categories VALUES ('c1', ?, 'Food', 0)`, [userId]);
  await db.run(`INSERT INTO categories VALUES ('c2', ?, 'Rent', 0)`, [userId]);

  await db.run(
    `INSERT INTO monthly_budgets VALUES ('c1', '2025-11-01', 100, 50, 50)`
  );
  await db.run(
    `INSERT INTO monthly_budgets VALUES ('c2', '2026-08-01', 200, 0, 200)`
  );

  const timeline = await listBudgetTimelineMonths(db, userId);
  assert.ok(timeline.months.length >= 10, 'should span Nov 2025 through Aug 2026 minimum');

  const keys = timeline.months.map((m) => m.monthKey);
  assert.ok(keys.includes('2025-11-01'));
  assert.ok(keys.includes('2026-08-01'));
  assert.strictEqual(keys[0], timeline.minMonthKey);
  assert.strictEqual(keys[keys.length - 1], timeline.maxMonthKey);

  const nov = timeline.months.find((m) => m.monthKey === '2025-11-01');
  assert.strictEqual(nov.hasBudgetData, true);

  const gap = timeline.months.find((m) => m.monthKey === '2026-01-01');
  assert.strictEqual(gap.hasBudgetData, false);

  await db.close();
  console.log('✅ budget timeline months tests passed');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
