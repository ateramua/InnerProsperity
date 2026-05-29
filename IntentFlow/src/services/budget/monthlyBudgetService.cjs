/**
 * Month-scoped budget rows (monthly_budgets) + transaction-derived activity.
 * Available is derived via categoryAvailableEngine (envelope budgeting).
 */

const crypto = require('crypto');
const { sqlCategoryNotArchived } = require('../../shared/categoryArchiveFlags.cjs');
const {
  roundMoney,
  buildCategoryEnvelopeRow,
} = require('../../shared/categoryAvailableEngine.cjs');

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * @param {Date | string | number} input
 * @returns {string} First calendar day of that month in local time, YYYY-MM-DD
 */
function toLocalMonthKey(input) {
  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

function addCalendarMonths(monthKey, delta) {
  const [y, m] = monthKey.split('-').map((x) => parseInt(x, 10));
  const d = new Date(y, m - 1 + delta, 1, 12, 0, 0, 0);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

/** @deprecated Use per-category totals from categoryAvailableEngine; kept for callers expecting a map. */
async function getActivityTotalsByCategoryForMonth(db, userId, monthKey) {
  const ym = monthKey.slice(0, 7);
  const rows = await db.all(
    `
    SELECT
      t.category_id AS category_id,
      COALESCE(SUM(CASE WHEN IFNULL(t.is_transfer, 0) = 1 THEN 0 ELSE -t.amount END), 0) AS activity
    FROM transactions t
    WHERE t.user_id = ?
      AND t.category_id IS NOT NULL
      AND strftime('%Y-%m', t.date) = ?
    GROUP BY t.category_id
  `,
    [userId, ym]
  );
  const map = Object.create(null);
  for (const r of rows || []) {
    if (r.category_id) map[r.category_id] = Number(r.activity) || 0;
  }
  return map;
}

async function getMonthlyRowMap(db, monthKey, categoryIds) {
  if (!categoryIds.length) return new Map();
  const placeholders = categoryIds.map(() => '?').join(',');
  const rows = await db.all(
    `SELECT category_id, budgeted_amount, activity_amount, available_amount
     FROM monthly_budgets
     WHERE month = ? AND category_id IN (${placeholders})`,
    [monthKey, ...categoryIds]
  );
  const map = new Map();
  for (const r of rows || []) {
    map.set(r.category_id, r);
  }
  return map;
}

async function upsertMonthlyRow(db, row) {
  const id = row.id || crypto.randomUUID();
  await db.run(
    `
    INSERT INTO monthly_budgets (
      id, category_id, month, budgeted_amount, activity_amount, available_amount,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(category_id, month) DO UPDATE SET
      budgeted_amount = excluded.budgeted_amount,
      activity_amount = excluded.activity_amount,
      available_amount = excluded.available_amount,
      updated_at = datetime('now')
  `,
    [
      id,
      row.category_id,
      row.month,
      Number(row.budgeted_amount) || 0,
      Number(row.activity_amount) || 0,
      Number(row.available_amount) || 0
    ]
  );
}

/**
 * Full snapshot for UI + persisted cache rows on monthly_budgets.
 */
async function getBudgetMonthSnapshot(db, userId, monthKey) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const prevMonthKey = addCalendarMonths(normalizedMonth, -1);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentCalendarMonth = normalizedMonth === todayKey;

  const categories = await db.all(
    `SELECT c.*, cg.name as group_name
     FROM categories c
     LEFT JOIN category_groups cg
       ON CAST(cg.id AS TEXT) = CAST(COALESCE(c.group_id, '') AS TEXT)
      AND cg.user_id = c.user_id
     WHERE c.user_id = ?
       AND ${sqlCategoryNotArchived('c')}
     ORDER BY cg.sort_order ASC, c.name ASC`,
    [userId]
  );

  const categoryIds = categories.map((c) => c.id);
  const [rowThisMonth, rowPrevMonth] = await Promise.all([
    getMonthlyRowMap(db, normalizedMonth, categoryIds),
    getMonthlyRowMap(db, prevMonthKey, categoryIds)
  ]);

  const mapped = [];

  await db.exec('BEGIN');
  try {
    for (const cat of categories) {
      const mb = rowThisMonth.get(cat.id);
      const prevRow = rowPrevMonth.get(cat.id);
      const previousAvailable = prevRow ? Number(prevRow.available_amount) || 0 : 0;

      let budgeted;
      if (isCurrentCalendarMonth) {
        budgeted = Number(cat.assigned) || 0;
      } else {
        budgeted = mb != null ? Number(mb.budgeted_amount) || 0 : 0;
      }

      const envelope = await buildCategoryEnvelopeRow(db, userId, cat, {
        monthKey: normalizedMonth,
        previousAvailable,
        budgeted,
        isCurrentCalendarMonth,
      });

      await upsertMonthlyRow(db, {
        category_id: cat.id,
        month: normalizedMonth,
        budgeted_amount: envelope.assigned,
        activity_amount: envelope.activity,
        available_amount: envelope.available
      });

      mapped.push({
        ...cat,
        assigned: envelope.assigned,
        activity: envelope.activity,
        available: envelope.available,
        previous_available: envelope.previous_available,
        spending: envelope.spending,
        inflows: envelope.inflows,
        adjustments: envelope.adjustments,
        card_payments: envelope.card_payments,
        overspent: envelope.overspent,
        overspending_type: envelope.overspending_type,
      });
    }
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }

  return {
    monthKey: normalizedMonth,
    prevMonthKey,
    isCurrentCalendarMonth,
    categories: mapped
  };
}

/**
 * Recompute and persist monthly_budgets (and category rollups for current month)
 * from `startMonthKey` forward. Each month depends on the previous month's
 * persisted available_amount, so this must run in calendar order after any
 * transaction change that affects activity in or after startMonthKey.
 *
 * @param {import('sqlite').Database} db
 * @param {string} userId
 * @param {string|Date} startMonthKey - any day in the first affected month
 * @param {number} [forwardMonths=36]
 */
async function refreshBudgetMonthsForward(db, userId, startMonthKey, forwardMonths = 36) {
  let key = toLocalMonthKey(startMonthKey);
  const n = Math.max(1, Math.min(Number(forwardMonths) || 36, 120));
  for (let i = 0; i < n; i++) {
    await getBudgetMonthSnapshot(db, userId, key);
    key = addCalendarMonths(key, 1);
  }
}

/**
 * Apply a new budgeted amount for one category/month and persist rollup fields.
 */
async function applyMonthBudgetedAmount(db, userId, categoryId, monthKey, budgetedAmount) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const prevMonthKey = addCalendarMonths(normalizedMonth, -1);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentCalendarMonth = normalizedMonth === todayKey;

  const prevRow = await db.get(
    'SELECT available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    [categoryId, prevMonthKey]
  );
  const previousAvailable = prevRow ? Number(prevRow.available_amount) || 0 : 0;

  const cat = await db.get(
    'SELECT * FROM categories WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?',
    [categoryId, userId]
  );
  if (!cat) {
    throw new Error('Category not found');
  }

  const assigned = Number(budgetedAmount) || 0;
  const envelope = await buildCategoryEnvelopeRow(db, userId, cat, {
    monthKey: normalizedMonth,
    previousAvailable,
    budgeted: assigned,
    isCurrentCalendarMonth,
  });

  await upsertMonthlyRow(db, {
    category_id: categoryId,
    month: normalizedMonth,
    budgeted_amount: envelope.assigned,
    activity_amount: envelope.activity,
    available_amount: envelope.available
  });

  if (isCurrentCalendarMonth) {
    await db.run(
      'UPDATE categories SET assigned = ?, available = ?, activity = ?, updated_at = datetime("now") WHERE id = ? AND user_id = ?',
      [envelope.assigned, envelope.available, envelope.activity, categoryId, userId]
    );
  }

  return {
    assigned: envelope.assigned,
    activity: envelope.activity,
    available: envelope.available,
    previous_available: envelope.previous_available,
    monthKey: normalizedMonth,
    overspent: envelope.overspent,
    overspending_type: envelope.overspending_type,
  };
}

/**
 * Apply client-provided assigned + available (e.g. credit card envelope moves) for a month.
 */
async function applyMonthAssignedAndAvailable(db, userId, categoryId, monthKey, assigned, available, opts = {}) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentCalendarMonth = normalizedMonth === todayKey;

  const prevMonthKey = addCalendarMonths(normalizedMonth, -1);
  const prevRow = await db.get(
    'SELECT available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    [categoryId, prevMonthKey]
  );
  const previousAvailable = prevRow ? Number(prevRow.available_amount) || 0 : 0;

  const cat = await db.get(
    'SELECT * FROM categories WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?',
    [categoryId, userId]
  );
  if (!cat) {
    throw new Error('Category not found');
  }

  const a = Number(assigned) || 0;
  const envelope = await buildCategoryEnvelopeRow(db, userId, cat, {
    monthKey: normalizedMonth,
    previousAvailable,
    budgeted: a,
    isCurrentCalendarMonth,
  });

  let useAvailable = envelope.available;
  let useActivity = envelope.activity;
  if (opts.allowManualAvailableOverride && Number.isFinite(Number(available))) {
    useAvailable = roundMoney(available);
    if (cat.is_credit_card_payment_category === 1) {
      useActivity = useAvailable;
    }
  }

  await upsertMonthlyRow(db, {
    category_id: categoryId,
    month: normalizedMonth,
    budgeted_amount: a,
    activity_amount: useActivity,
    available_amount: useAvailable
  });

  if (isCurrentCalendarMonth) {
    await db.run(
      'UPDATE categories SET assigned = ?, available = ?, activity = ?, updated_at = datetime("now") WHERE id = ? AND user_id = ?',
      [a, useAvailable, useActivity, categoryId, userId]
    );
  }

  return {
    assigned: a,
    activity: useActivity,
    available: useAvailable,
    monthKey: normalizedMonth,
    previous_available: previousAvailable,
  };
}

module.exports = {
  toLocalMonthKey,
  addCalendarMonths,
  getActivityTotalsByCategoryForMonth,
  getBudgetMonthSnapshot,
  refreshBudgetMonthsForward,
  applyMonthBudgetedAmount,
  applyMonthAssignedAndAvailable
};
