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
  computeGlobalBudgetSummary,
  computeReadyToAssign,
} = require('../../shared/readyToAssignEngine.cjs');
const { recordBudgetAssignmentAudit } = require('./budgetAssignmentAuditService.cjs');
const {
  buildForecastedNeedMap,
  applyForecastMapToCategories,
} = require('./categorySpendingForecast.cjs');
const { withBudgetDbLock } = require('./budgetDbLock.cjs');

function pad2(n) {
  return String(n).padStart(2, '0');
}

function isNestedTransactionError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('transaction') && (msg.includes('within') || msg.includes('nested'));
}

function isNoSuchSavepointError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('no such savepoint');
}

/** @param {import('sqlite').Database} db */
async function isDbInTransaction(db) {
  try {
    const row = await db.get('PRAGMA transaction_state');
    if (row && row.transaction_state != null) {
      return Number(row.transaction_state) === 1;
    }
  } catch (_) {
    /* PRAGMA unavailable on older SQLite builds */
  }
  return false;
}

/**
 * @param {import('sqlite').Database} db
 * @param {() => Promise<T>} fn
 * @template T
 */
async function withBudgetSavepoint(db, fn) {
  const sp = `budget_sp_${crypto.randomUUID().replace(/-/g, '_')}`;
  await db.exec(`SAVEPOINT ${sp}`);
  try {
    const result = await fn();
    try {
      await db.exec(`RELEASE SAVEPOINT ${sp}`);
    } catch (releaseErr) {
      if (!isNoSuchSavepointError(releaseErr)) {
        throw releaseErr;
      }
    }
    return result;
  } catch (e) {
    try {
      await db.exec(`ROLLBACK TO SAVEPOINT ${sp}`);
    } catch (rollbackErr) {
      if (!isNoSuchSavepointError(rollbackErr)) {
        throw rollbackErr;
      }
    }
    throw e;
  }
}

/**
 * BEGIN/COMMIT (or SAVEPOINT when nested). Caller must hold budget DB lock via withBudgetTransaction.
 * @param {import('sqlite').Database} db
 * @param {() => Promise<T>} fn
 * @template T
 */
async function runBudgetTransaction(db, fn) {
  if (await isDbInTransaction(db)) {
    return withBudgetSavepoint(db, fn);
  }
  try {
    await db.exec('BEGIN');
  } catch (e) {
    if (isNestedTransactionError(e)) {
      return withBudgetSavepoint(db, fn);
    }
    throw e;
  }
  try {
    const result = await fn();
    await db.exec('COMMIT');
    return result;
  } catch (e) {
    try {
      await db.exec('ROLLBACK');
    } catch (_) {
      /* connection may already be idle */
    }
    throw e;
  }
}

/**
 * Serialized transaction wrapper for budget persistence.
 * @param {import('sqlite').Database} db
 * @param {() => Promise<T>} fn
 * @template T
 */
async function withBudgetTransaction(db, fn) {
  return runBudgetTransaction(db, fn);
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
  const fromCat = isCurrentCalendarMonth ? Number(cat?.assigned) || 0 : 0;
  if (mb == null) {
    return fromCat;
  }
  const fromMb = Number(mb.budgeted_amount) || 0;
  // Heal drift: legacy rows sometimes have categories.assigned ahead of monthly_budgets.
  if (isCurrentCalendarMonth && fromCat > fromMb + 0.005) {
    return fromCat;
  }
  return fromMb;
}

async function readMonthBudgeted(db, userId, categoryId, monthKey) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentCalendarMonth = normalizedMonth === todayKey;
  const mb = await db.get(
    'SELECT budgeted_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    [categoryId, normalizedMonth]
  );
  const cat = await db.get(
    'SELECT assigned FROM categories WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?',
    [categoryId, userId]
  );
  return resolveBudgetedForMonth(
    { assigned: cat?.assigned },
    mb,
    isCurrentCalendarMonth
  );
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

  const mapped = await withBudgetTransaction(db, async () => {
    const rows = [];
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
        available_amount: envelope.available,
      });

      if (isCurrentCalendarMonth) {
        await db.run(
          `UPDATE categories
           SET assigned = ?, available = ?, activity = ?, updated_at = datetime('now')
           WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
          [envelope.assigned, envelope.available, envelope.activity, cat.id, userId]
        );
      }

      rows.push({
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
    return rows;
  });

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
 * Rows where legacy repair treated orphan Available as Assigned (budgeted ≈ available,
 * no activity, no prior-month carryover). Those inflate global RTA while the month UI shows
 * envelope Assigned = 0 after a fresh snapshot.
 */
async function findPhantomImplicitAssignmentRows(db, userId) {
  const rows = await db.all(
    `SELECT mb.category_id, mb.month, mb.budgeted_amount, mb.available_amount, mb.activity_amount
     FROM monthly_budgets mb
     INNER JOIN categories c ON CAST(c.id AS TEXT) = CAST(mb.category_id AS TEXT)
     WHERE c.user_id = ?
       AND ${sqlCategoryNotArchived('c')}
       AND ABS(COALESCE(mb.budgeted_amount, 0)) > 0.005`,
    [userId]
  );

  const phantoms = [];
  for (const row of rows || []) {
    const prevMonthKey = addCalendarMonths(row.month, -1);
    const prev = await db.get(
      'SELECT available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
      [row.category_id, prevMonthKey]
    );
    const prevAvailable = prev ? Number(prev.available_amount) || 0 : 0;
    const budgeted = Number(row.budgeted_amount) || 0;
    const available = Number(row.available_amount) || 0;
    const activity = Number(row.activity_amount) || 0;

    const matchesPhantom =
      Math.abs(available - budgeted) <= 0.02 &&
      Math.abs(activity) <= 0.02 &&
      Math.abs(prevAvailable) <= 0.02;

    if (!matchesPhantom) {
      continue;
    }

    // Legitimate Fund Underfunded / manual assigns also set budgeted ≈ available with no activity.
    const hasUserAssignment = await db.get(
      `SELECT 1 AS ok FROM budget_assignment_audit
       WHERE user_id = ?
         AND CAST(category_id AS TEXT) = CAST(? AS TEXT)
         AND month = ?
         AND source NOT IN ('heal_phantom_assign', 'implicit_repair')
         AND ABS(COALESCE(amount_changed, 0)) > 0.005
       LIMIT 1`,
      [userId, row.category_id, row.month]
    );
    if (hasUserAssignment) {
      continue;
    }

    phantoms.push({
      categoryId: row.category_id,
      month: row.month,
      budgeted: roundMoney(budgeted),
    });
  }
  return phantoms;
}

/**
 * Clear phantom budgeted rows and refresh envelopes forward so funds return to global RTA.
 */
async function releasePhantomImplicitAssignments(db, userId) {
  return withBudgetDbLock(async () => {
    const phantoms = await findPhantomImplicitAssignmentRows(db, userId);
    if (!phantoms.length) {
      return { released: 0, rows: [] };
    }

    const months = new Set();
    await runBudgetTransaction(db, async () => {
      for (const p of phantoms) {
        await applyMonthBudgetedAmount(db, userId, p.categoryId, p.month, 0, {
          auditSource: 'heal_phantom_assign',
        });
        months.add(p.month);
      }
    });

    const start = [...months].sort()[0];
    if (start) {
      await refreshBudgetMonthsForward(db, userId, start, 36);
    }

    const released = roundMoney(phantoms.reduce((s, p) => s + p.budgeted, 0));
    return { released, rows: phantoms };
  });
}

/**
 * Sum assigned amounts across all budget months (active categories only).
 * Reads persisted monthly_budgets (fast) instead of recomputing every month snapshot.
 */
async function getGlobalAssignmentTotals(db, userId) {
  const todayKey = toLocalMonthKey(new Date());

  const mbRows = await db.all(
    `SELECT mb.month,
            mb.category_id,
            c.name AS category_name,
            COALESCE(mb.budgeted_amount, 0) AS mb_budgeted,
            COALESCE(c.assigned, 0) AS category_assigned
     FROM monthly_budgets mb
     INNER JOIN categories c ON CAST(c.id AS TEXT) = CAST(mb.category_id AS TEXT)
     WHERE c.user_id = ?
       AND ${sqlCategoryNotArchived('c')}`,
    [userId]
  );

  const assignmentRows = [];
  const seenCurrentMonth = new Set();

  for (const row of mbRows || []) {
    const month = toLocalMonthKey(row.month);
    let amount = Number(row.mb_budgeted) || 0;
    if (month === todayKey) {
      amount = Math.max(amount, Number(row.category_assigned) || 0);
      seenCurrentMonth.add(String(row.category_id));
    }
    amount = roundMoney(amount);
    if (amount > 0.005) {
      assignmentRows.push({
        month,
        category_id: row.category_id,
        category_name: row.category_name,
        budgeted_amount: amount,
      });
    }
  }

  const orphanCurrent = await db.all(
    `SELECT c.id AS category_id,
            c.name AS category_name,
            COALESCE(c.assigned, 0) AS category_assigned
     FROM categories c
     WHERE c.user_id = ?
       AND ${sqlCategoryNotArchived('c')}
       AND ABS(COALESCE(c.assigned, 0)) > 0.005
       AND NOT EXISTS (
         SELECT 1 FROM monthly_budgets mb
         WHERE CAST(mb.category_id AS TEXT) = CAST(c.id AS TEXT)
           AND mb.month = ?
       )`,
    [userId, todayKey]
  );

  for (const row of orphanCurrent || []) {
    const categoryId = row.category_id;
    if (seenCurrentMonth.has(String(categoryId))) continue;
    assignmentRows.push({
      month: todayKey,
      category_id: categoryId,
      category_name: row.category_name,
      budgeted_amount: roundMoney(Number(row.category_assigned) || 0),
    });
  }

  return { rows: assignmentRows, currentMonthKey: todayKey };
}

async function getGlobalBudgetSummary(db, userId, totalCash, opts = {}) {
  let { rows, currentMonthKey } = await getGlobalAssignmentTotals(db, userId);
  let summary = computeGlobalBudgetSummary(rows, currentMonthKey, totalCash);

  if (opts.autoHealPhantomAssignments === true && summary.readyToAssign < -0.005 && summary.totalAssigned > 0.005) {
    const heal = await releasePhantomImplicitAssignments(db, userId);
    if (heal.released > 0.005) {
      ({ rows, currentMonthKey } = await getGlobalAssignmentTotals(db, userId));
      summary = computeGlobalBudgetSummary(rows, currentMonthKey, totalCash);
    }
  }

  return summary;
}

/**
 * @param {import('sqlite').Database} db
 * @param {string} userId
 * @param {number} positiveDelta
 * @param {number} totalCash
 */
async function assertSufficientReadyToAssign(db, userId, positiveDelta, totalCash) {
  const nDelta = Number(positiveDelta) || 0;
  if (nDelta <= 0) return;
  const summary = await getGlobalBudgetSummary(db, userId, totalCash);
  if (nDelta > summary.readyToAssign + 0.005) {
    const err = new Error('Insufficient Ready to Assign funds.');
    err.code = 'INSUFFICIENT_RTA';
    err.readyToAssign = summary.readyToAssign;
    throw err;
  }
}

/**
 * Add a delta to the current month's Assigned and recalculate Available from the envelope formula.
 * This is the preferred path for Smart Assign / Auto Assign (YNAB-style).
 */
async function applyMonthBudgetDelta(db, userId, categoryId, monthKey, delta, opts = {}) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const nDelta = Number(delta) || 0;
  if (
    Number.isFinite(nDelta) &&
    nDelta > 0 &&
    Number.isFinite(opts.totalCash) &&
    !opts.skipRtaCheck
  ) {
    await assertSufficientReadyToAssign(db, userId, nDelta, opts.totalCash);
  }
  if (!Number.isFinite(nDelta) || nDelta === 0) {
    return applyMonthBudgetedAmount(
      db,
      userId,
      categoryId,
      normalizedMonth,
      await readMonthBudgeted(db, userId, categoryId, normalizedMonth)
    );
  }
  const current = await readMonthBudgeted(db, userId, categoryId, normalizedMonth);
  const nextAssigned = roundMoney(current + nDelta);
  return applyMonthBudgetedAmount(db, userId, categoryId, normalizedMonth, nextAssigned, {
    ...opts,
    auditSource: opts.auditSource || 'delta_assign',
  });
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
  const previousAssigned = await readMonthBudgeted(db, userId, categoryId, normalizedMonth);

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

  if (!opts.skipAudit) {
    await recordBudgetAssignmentAudit(db, {
      userId,
      categoryId,
      monthKey: normalizedMonth,
      previousAssigned,
      newAssigned: envelope.assigned,
      source: opts.auditSource || 'assign',
      metadata: opts.auditMetadata,
    });
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

  return withBudgetDbLock(async () => {
  if (Number.isFinite(opts.totalCash) && mode === 'delta') {
    const positiveDeltaSum = rows.reduce((sum, item) => {
      const d = Number(item?.delta) || 0;
      return d > 0 ? sum + d : sum;
    }, 0);
    if (positiveDeltaSum > 0) {
      await assertSufficientReadyToAssign(db, userId, positiveDeltaSum, opts.totalCash);
    }
  }

  return runBudgetTransaction(db, async () => {
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
          assigned,
          {
            auditSource: opts.auditSource || 'bulk_assign',
            auditMetadata: opts.auditMetadata,
          }
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
          delta,
          {
            totalCash: opts.totalCash,
            skipRtaCheck: true,
            auditSource: opts.auditSource || 'bulk_assign',
            auditMetadata: opts.auditMetadata,
          }
        );
      }
      results.push({ categoryId, ...row });
    }
    if (!results.length) {
      throw new Error('No non-zero assignment deltas were provided');
    }
    return { monthKey: normalizedMonth, mode, assignments: results };
  });
  });
}

/**
 * Apply bulk month assignments then refresh forward envelopes so UI + RTA stay aligned.
 */
async function applyMonthBudgetBulkAndRefresh(db, userId, monthKey, assignments, opts = {}) {
  const result = await applyMonthBudgetBulk(db, userId, monthKey, assignments, opts);
  const forwardMonths = Number(opts.forwardMonths) || 36;
  await refreshBudgetMonthsForward(db, userId, result.monthKey, forwardMonths);
  return result;
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

      // Orphan Available without Assigned is valid (carryover / categorized spend).
      // Realign the cache instead of inflating budgeted_amount (which breaks global RTA).
      if (budgeted <= 0.005 && orphan > 0) {
        await upsertMonthlyRow(db, {
          category_id: cat.id,
          month: normalizedMonth,
          budgeted_amount: 0,
          activity_amount: envelope.activity,
          available_amount: expectedAvailable,
        });
        repairs.push({
          categoryId: cat.id,
          name: cat.name,
          type: 'realign_available',
          previousBudgeted: budgeted,
          previousAvailable: storedAvailable,
          correctedAvailable: expectedAvailable,
          orphanReleased: orphan,
        });
        continue;
      }

      const correctedBudgeted = roundMoney(budgeted + orphan);
      if (correctedBudgeted < 0) {
        continue;
      }

      await applyMonthBudgetedAmount(db, userId, cat.id, normalizedMonth, correctedBudgeted, {
        auditSource: 'implicit_repair',
      });
      repairs.push({
        categoryId: cat.id,
        name: cat.name,
        type: 'adjust_budgeted',
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
 * Zero Assigned for every active category in one month only; returns funds to global RTA.
 * Recalculates envelopes (keeps activity / prior-month carryover).
 */
async function unassignAllForMonth(db, userId, monthKey, opts = {}) {
  const normalizedMonth = toLocalMonthKey(monthKey);

  const categories = await db.all(
    `SELECT c.id, c.name
     FROM categories c
     WHERE c.user_id = ?
       AND ${sqlCategoryNotArchived('c')}`,
    [userId]
  );

  let totalReleased = 0;
  const breakdown = [];

  await db.exec('BEGIN');
  try {
    for (const cat of categories) {
      const previousAssigned = await readMonthBudgeted(db, userId, cat.id, normalizedMonth);
      if (previousAssigned <= 0.005) {
        continue;
      }

      await applyMonthBudgetedAmount(db, userId, cat.id, normalizedMonth, 0, {
        auditSource: opts.auditSource || 'unassign_month',
        auditMetadata: opts.auditMetadata || null,
      });

      totalReleased += previousAssigned;
      breakdown.push({
        categoryId: cat.id,
        categoryName: cat.name,
        released: roundMoney(previousAssigned),
      });
    }
    await db.exec('COMMIT');
  } catch (e) {
    await db.exec('ROLLBACK');
    throw e;
  }

  await refreshBudgetMonthsForward(db, userId, normalizedMonth, 12);
  await getBudgetMonthSnapshot(db, userId, normalizedMonth);

  return {
    monthKey: normalizedMonth,
    totalReleased: roundMoney(totalReleased),
    categoriesUpdated: breakdown.length,
    breakdown,
  };
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
  applyMonthBudgetBulkAndRefresh,
  repairImplicitAssignmentsForMonth,
  repairAndRefreshBudgetMonths,
  consolidateAvailableIntoMonthAssignments,
  resetEnvelopesFromMonth,
  unassignAllForMonth,
  auditBudgetMonthIntegrity,
  getGlobalAssignmentTotals,
  getGlobalBudgetSummary,
  findPhantomImplicitAssignmentRows,
  releasePhantomImplicitAssignments,
  assertSufficientReadyToAssign,
  computeReadyToAssign,
};
