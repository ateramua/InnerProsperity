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
const { enrichBudgetSnapshot } = require('../../shared/underfundedEngine.cjs');
const {
  buildForecastedNeedMap,
  applyForecastMapToCategories,
} = require('./categorySpendingForecast.cjs');

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * @param {Date | string | number} input
 * @returns {string} First calendar day of that month in local time, YYYY-MM-DD
 */
function toLocalMonthKey(input) {
  if (typeof input === 'string') {
    const trimmed = input.trim();
    const match = trimmed.match(/^(\d{4})-(\d{2})(?:-(\d{2}))?/);
    if (match) {
      const y = parseInt(match[1], 10);
      const m = parseInt(match[2], 10);
      if (Number.isFinite(y) && Number.isFinite(m) && m >= 1 && m <= 12) {
        return `${y}-${pad2(m)}-01`;
      }
    }
  }

  const d = input instanceof Date ? new Date(input.getTime()) : new Date(input);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

/**
 * Resolve current-month Assigned from monthly_budgets (authoritative) with category fallback.
 * @param {object} cat
 * @param {object | undefined} mb
 * @param {boolean} isCurrentCalendarMonth
 */
function resolveBudgetedForMonth(cat, mb, isCurrentCalendarMonth) {
  if (mb != null) {
    return Number(mb.budgeted_amount) || 0;
  }
  return isCurrentCalendarMonth ? Number(cat.assigned) || 0 : 0;
}

async function readMonthBudgeted(db, categoryId, monthKey) {
  const row = await db.get(
    'SELECT budgeted_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    [categoryId, toLocalMonthKey(monthKey)]
  );
  return row ? Number(row.budgeted_amount) || 0 : 0;
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

      const budgeted = resolveBudgetedForMonth(cat, mb, isCurrentCalendarMonth);

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

      if (isCurrentCalendarMonth) {
        await db.run(
          `UPDATE categories
           SET assigned = ?, available = ?, activity = ?, updated_at = datetime('now')
           WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
          [envelope.assigned, envelope.available, envelope.activity, cat.id, userId]
        );
      }

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

  const forecastMap = await buildForecastedNeedMap(db, userId, mapped, normalizedMonth);
  const withForecasts = applyForecastMapToCategories(mapped, forecastMap);

  return enrichBudgetSnapshot({
    monthKey: normalizedMonth,
    prevMonthKey,
    isCurrentCalendarMonth,
    categories: withForecasts,
  });
}

/**
 * Attach underfunded fields to category rows (no full envelope recompute).
 */
async function enrichCategoriesWithUnderfunded(db, userId, categories, monthKey) {
  const normalizedMonth = toLocalMonthKey(monthKey || new Date());
  const forecastMap = await buildForecastedNeedMap(db, userId, categories, normalizedMonth);
  const withForecasts = applyForecastMapToCategories(categories, forecastMap);
  return enrichBudgetSnapshot({
    monthKey: normalizedMonth,
    categories: withForecasts,
  }).categories;
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
 * Add a delta to the current month's Assigned and recalculate Available from the envelope formula.
 * This is the preferred path for Smart Assign / Auto Assign (YNAB-style).
 */
async function applyMonthBudgetDelta(db, userId, categoryId, monthKey, delta) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const nDelta = Number(delta) || 0;
  if (!Number.isFinite(nDelta) || nDelta === 0) {
    return applyMonthBudgetedAmount(
      db,
      userId,
      categoryId,
      normalizedMonth,
      await readMonthBudgeted(db, categoryId, normalizedMonth)
    );
  }
  const current = await readMonthBudgeted(db, categoryId, normalizedMonth);
  const nextAssigned = roundMoney(current + nDelta);
  return applyMonthBudgetedAmount(db, userId, categoryId, normalizedMonth, nextAssigned);
}

/**
 * Apply a new budgeted amount for one category/month and persist rollup fields.
 * @param {{ ignoreCarryover?: boolean }} [opts] - When true, Available = Assigned − Activity only.
 */
async function applyMonthBudgetedAmount(db, userId, categoryId, monthKey, budgetedAmount, opts = {}) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const prevMonthKey = addCalendarMonths(normalizedMonth, -1);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentCalendarMonth = normalizedMonth === todayKey;

  const prevRow = await db.get(
    'SELECT available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    [categoryId, prevMonthKey]
  );
  let previousAvailable = prevRow ? Number(prevRow.available_amount) || 0 : 0;
  if (opts.ignoreCarryover) {
    previousAvailable = 0;
  }

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

/**
 * Atomically apply assignment changes for multiple categories in one month.
 * @param {import('sqlite').Database} db
 * @param {string} userId
 * @param {string|Date} monthKey
 * @param {Array<{ categoryId: string, delta?: number, assigned?: number }>} assignments
 * @param {{ mode?: 'delta' | 'absolute' }} [opts]
 */
async function applyMonthBudgetBulk(db, userId, monthKey, assignments, opts = {}) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const mode = opts.mode === 'absolute' ? 'absolute' : 'delta';
  const rows = Array.isArray(assignments) ? assignments : [];
  if (!rows.length) {
    return { monthKey: normalizedMonth, mode, assignments: [] };
  }

  await db.exec('BEGIN');
  try {
    const results = [];
    for (const item of rows) {
      const categoryId = item?.categoryId;
      if (categoryId === undefined || categoryId === null || String(categoryId).trim() === '') {
        throw new Error('Category id is required for bulk assign');
      }
      let row;
      if (mode === 'absolute') {
        const assigned = Number(item.assigned) || 0;
        row = await applyMonthBudgetedAmount(
          db,
          userId,
          categoryId,
          normalizedMonth,
          assigned
        );
      } else {
        const delta = Number(item.delta) || 0;
        if (!Number.isFinite(delta) || delta === 0) {
          continue;
        }
        row = await applyMonthBudgetDelta(
          db,
          userId,
          categoryId,
          normalizedMonth,
          delta
        );
      }
      results.push({ categoryId, ...row });
    }
    if (!results.length) {
      throw new Error('No non-zero assignment deltas were provided');
    }
    await db.exec('COMMIT');
    return { monthKey: normalizedMonth, mode, assignments: results };
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }
}

/**
 * Reconstruct missing assignment records when Available was written without a matching Assigned.
 * Available must equal previous carryover + Assigned − Activity (envelope formula).
 */
async function repairImplicitAssignmentsForMonth(db, userId, monthKey) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const prevMonthKey = addCalendarMonths(normalizedMonth, -1);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentCalendarMonth = normalizedMonth === todayKey;

  const categories = await db.all(
    `SELECT c.*
     FROM categories c
     WHERE c.user_id = ?
       AND ${sqlCategoryNotArchived('c')}`,
    [userId]
  );

  const repairs = [];

  await db.exec('BEGIN');
  try {
    for (const cat of categories) {
      const mb = await db.get(
        `SELECT budgeted_amount, available_amount, activity_amount
         FROM monthly_budgets WHERE category_id = ? AND month = ?`,
        [cat.id, normalizedMonth]
      );
      const prevRow = await db.get(
        'SELECT available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
        [cat.id, prevMonthKey]
      );
      const previousAvailable = prevRow ? Number(prevRow.available_amount) || 0 : 0;
      const budgeted = mb ? Number(mb.budgeted_amount) || 0 : 0;
      const storedAvailable = mb ? Number(mb.available_amount) || 0 : 0;

      const envelope = await buildCategoryEnvelopeRow(db, userId, cat, {
        monthKey: normalizedMonth,
        previousAvailable,
        budgeted,
        isCurrentCalendarMonth,
      });
      const expectedAvailable = envelope.available;
      const orphan = roundMoney(storedAvailable - expectedAvailable);
      if (Math.abs(orphan) <= 0.01) {
        continue;
      }

      const correctedBudgeted = roundMoney(budgeted + orphan);
      if (correctedBudgeted < 0) {
        continue;
      }

      await applyMonthBudgetedAmount(
        db,
        userId,
        cat.id,
        normalizedMonth,
        correctedBudgeted
      );
      repairs.push({
        categoryId: cat.id,
        name: cat.name,
        previousBudgeted: budgeted,
        correctedBudgeted,
        orphanReleased: orphan,
      });
    }
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }

  return { monthKey: normalizedMonth, repairs };
}

/**
 * Repair implicit assignments then recompute month snapshots forward.
 */
async function repairAndRefreshBudgetMonths(db, userId, startMonthKey, forwardMonths = 6) {
  const start = toLocalMonthKey(startMonthKey);
  const repairResult = await repairImplicitAssignmentsForMonth(db, userId, start);
  await refreshBudgetMonthsForward(db, userId, start, forwardMonths);
  const snapshot = await getBudgetMonthSnapshot(db, userId, start);
  return { ...repairResult, snapshot };
}

/**
 * Convert untraceable Available balances into explicit Assigned records for one month.
 * Use when Available > 0 but Assigned = 0 with no legitimate prior-month assignment chain.
 * Clears prior-month envelope rows for affected categories, then sets:
 *   Assigned = Available + Activity, Available = Assigned − Activity (zero carryover).
 */
async function consolidateAvailableIntoMonthAssignments(db, userId, monthKey, opts = {}) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentCalendarMonth = normalizedMonth === todayKey;

  const categories = await db.all(
    `SELECT c.*
     FROM categories c
     WHERE c.user_id = ?
       AND ${sqlCategoryNotArchived('c')}`,
    [userId]
  );

  const conversions = [];

  await db.exec('BEGIN');
  try {
    for (const cat of categories) {
      const mb = await db.get(
        `SELECT budgeted_amount, available_amount, activity_amount
         FROM monthly_budgets WHERE category_id = ? AND month = ?`,
        [cat.id, normalizedMonth]
      );
      const budgeted = mb ? Number(mb.budgeted_amount) || 0 : 0;
      const available = mb != null
        ? Number(mb.available_amount) || 0
        : Number(cat.available) || 0;
      const activity = mb ? Number(mb.activity_amount) || 0 : Number(cat.activity) || 0;

      if (Math.abs(available) <= 0.005) {
        continue;
      }

      const targetAssigned = roundMoney(available + activity);
      if (Math.abs(budgeted - targetAssigned) <= 0.01 && budgeted > 0) {
        continue;
      }

      if (opts.clearPriorMonths !== false) {
        await db.run(
          `UPDATE monthly_budgets
           SET budgeted_amount = 0, available_amount = 0, activity_amount = 0,
               updated_at = datetime('now')
           WHERE category_id = ? AND month < ?`,
          [cat.id, normalizedMonth]
        );
      }

      const row = await applyMonthBudgetedAmount(
        db,
        userId,
        cat.id,
        normalizedMonth,
        targetAssigned,
        { ignoreCarryover: true }
      );

      conversions.push({
        categoryId: cat.id,
        name: cat.name,
        previousBudgeted: budgeted,
        assigned: row.assigned,
        available: row.available,
        activity: row.activity,
      });
    }
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }

  await refreshBudgetMonthsForward(db, userId, normalizedMonth, 12);
  if (isCurrentCalendarMonth) {
    await getBudgetMonthSnapshot(db, userId, normalizedMonth);
  }

  return { monthKey: normalizedMonth, conversions };
}

/**
 * Roll back envelope balances from a month forward (returns funds to Ready to Assign).
 */
async function resetEnvelopesFromMonth(db, userId, monthKey) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentCalendarMonth = normalizedMonth === todayKey;

  const categories = await db.all(
    `SELECT c.id
     FROM categories c
     WHERE c.user_id = ?
       AND ${sqlCategoryNotArchived('c')}`,
    [userId]
  );

  await db.exec('BEGIN');
  try {
    for (const cat of categories) {
      await db.run(
        `UPDATE monthly_budgets
         SET budgeted_amount = 0, available_amount = 0, activity_amount = 0,
             updated_at = datetime('now')
         WHERE category_id = ? AND month >= ?`,
        [cat.id, normalizedMonth]
      );
    }
    if (isCurrentCalendarMonth) {
      await db.run(
        `UPDATE categories
         SET assigned = 0, available = 0, activity = 0, updated_at = datetime('now')
         WHERE user_id = ?
           AND ${sqlCategoryNotArchived('categories')}`,
        [userId]
      );
    }
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }

  await getBudgetMonthSnapshot(db, userId, normalizedMonth);
  return { monthKey: normalizedMonth, categoriesReset: categories.length };
}

/**
 * Audit envelope integrity for a month.
 */
async function auditBudgetMonthIntegrity(db, userId, monthKey) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const prevMonthKey = addCalendarMonths(normalizedMonth, -1);

  const categories = await db.all(
    `SELECT c.id, c.name
     FROM categories c
     WHERE c.user_id = ?
       AND ${sqlCategoryNotArchived('c')}`,
    [userId]
  );

  const rows = [];
  let sumAssigned = 0;
  let sumAvailable = 0;
  let sumUntraceable = 0;

  for (const cat of categories) {
    const mb = await db.get(
      `SELECT budgeted_amount, available_amount, activity_amount
       FROM monthly_budgets WHERE category_id = ? AND month = ?`,
      [cat.id, normalizedMonth]
    );
    const prev = await db.get(
      'SELECT available_amount, budgeted_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
      [cat.id, prevMonthKey]
    );
    const assigned = mb ? Number(mb.budgeted_amount) || 0 : 0;
    const available = mb ? Number(mb.available_amount) || 0 : 0;
    const activity = mb ? Number(mb.activity_amount) || 0 : 0;
    const prevAvailable = prev ? Number(prev.available_amount) || 0 : 0;
    const prevBudgeted = prev ? Number(prev.budgeted_amount) || 0 : 0;
    const expectedAvailable = roundMoney(prevAvailable + assigned - activity);
    const orphan = roundMoney(available - expectedAvailable);
    const untraceable = assigned <= 0.005 && Math.abs(available) > 0.005 && Math.abs(activity) <= 0.005;

    sumAssigned += assigned;
    sumAvailable += available;
    if (untraceable) sumUntraceable += available;

    rows.push({
      categoryId: cat.id,
      name: cat.name,
      assigned,
      available,
      activity,
      prevAvailable,
      prevBudgeted,
      expectedAvailable,
      orphan,
      untraceable,
    });
  }

  return {
    monthKey: normalizedMonth,
    prevMonthKey,
    categories: rows,
    totals: {
      assigned: roundMoney(sumAssigned),
      available: roundMoney(sumAvailable),
      untraceableAvailable: roundMoney(sumUntraceable),
    },
  };
}

module.exports = {
  toLocalMonthKey,
  resolveBudgetedForMonth,
  readMonthBudgeted,
  addCalendarMonths,
  getActivityTotalsByCategoryForMonth,
  getBudgetMonthSnapshot,
  enrichCategoriesWithUnderfunded,
  enrichBudgetSnapshot,
  refreshBudgetMonthsForward,
  applyMonthBudgetedAmount,
  applyMonthBudgetDelta,
  applyMonthAssignedAndAvailable,
  applyMonthBudgetBulk,
  repairImplicitAssignmentsForMonth,
  repairAndRefreshBudgetMonths,
  consolidateAvailableIntoMonthAssignments,
  resetEnvelopesFromMonth,
  auditBudgetMonthIntegrity,
};
