/*
 * Month-scoped budget rows (monthly_budgets) + transaction-derived activity.
 * Available is derived via categoryAvailableEngine (envelope budgeting).
 */

const crypto = require('crypto');
const { sqlCategoryNotArchived } = require('../../shared/categoryArchiveFlags.cjs');
const {
  roundMoney,
  buildCategoryEnvelopeRow,
} = require('../../shared/categoryAvailableEngine.cjs');
const {
  enrichBudgetSnapshot,
  computeFundUnderfundedPlan,
} = require('../../shared/underfundedEngine.cjs');
const {
  computeGlobalBudgetSummary,
  computeReadyToAssign,
} = require('../../shared/readyToAssignEngine.cjs');
const readyToAssignPoolService = require('./readyToAssignPoolService.cjs');
const { runBudgetTransaction, withBudgetTransaction } = require('../../db/transactionRunner.cjs');
const { recordBudgetAssignmentAudit } = require('./budgetAssignmentAuditService.cjs');
const {
  assertAssignedMutationAllowed,
  requireUserIntentMaintenanceOperation,
} = require('./budgetAssignmentGuard.cjs');
const {
  buildForecastedNeedMap,
  applyForecastMapToCategories,
} = require('./categorySpendingForecast.cjs');
const { withBudgetDbLock } = require('./budgetDbLock.cjs');
const { resolveCategoryCarryover } = require('./categoryCarryover.cjs');

function normalizeCategoryId(id) {
  return id == null ? '' : String(id).trim();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function toLocalMonthKey(input) {
  if (typeof input === 'string') {
    const m = input.match(/^(\d{4})-(\d{2})/);
    if (m) return `${m[1]}-${pad2(m[2])}-01`;
  }
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-01`;
  }
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

function addCalendarMonths(monthKey, delta) {
  const [y, m] = monthKey.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-01`;
}

async function readReadyToAssignBalance(db, userId) {
  return readyToAssignPoolService.getPoolBalance(db, userId);
}

async function buildReadyToAssignMutationMeta(db, userId, before) {
  const after = await readReadyToAssignBalance(db, userId);
  return {
    readyToAssign: after,
    readyToAssignBefore: roundMoney(before),
    readyToAssignDelta: roundMoney(after - before),
  };
}

/**
 * FIX #1:
 * Unassign must use the same assigned resolution as applyMonthBudgetedAmount
 * (readMonthBudgeted / resolveBudgetedForMonth). A monthly_budgets row with
 * budgeted_amount=0 must not hide a higher categories.assigned from manual funding.
 */
async function readMonthAssignedForUnassign(db, userId, categoryId, monthKey) {
  return readMonthBudgeted(db, userId, categoryId, monthKey);
}

async function upsertMonthlyRow(db, row) {
  const month = toLocalMonthKey(row.month);
  await db.run(
    `
    INSERT INTO monthly_budgets (
      id, category_id, month, budgeted_amount, activity_amount, available_amount,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
    ON CONFLICT(category_id, month) DO UPDATE SET
      budgeted_amount=excluded.budgeted_amount,
      activity_amount=excluded.activity_amount,
      available_amount=excluded.available_amount,
      updated_at=datetime('now')
    `,
    [
      row.id || crypto.randomUUID(),
      row.category_id,
      month,
      Number(row.budgeted_amount) || 0,
      Number(row.activity_amount) || 0,
      Number(row.available_amount) || 0,
    ]
  );
}

/**
 * FIX #2:
 * CENTRAL RTA CORRECTNESS RULE:
 * Every assignment mutation MUST pass through this function.
 */
async function applyMonthBudgetedAmount(db, userId, categoryId, monthKey, budgetedAmount, opts = {}) {
  const mk = toLocalMonthKey(monthKey);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentCalendarMonth = mk === todayKey;

  const previous = await readMonthBudgeted(db, userId, categoryId, mk);
  const next = roundMoney(Number(budgetedAmount) || 0);

  assertAssignedMutationAllowed(previous, next, {
    auditSource: opts.auditSource || 'assign',
  });

  const cat = await db.get(
    `SELECT * FROM categories WHERE CAST(id AS TEXT)=CAST(? AS TEXT) AND user_id=?`,
    [categoryId, userId]
  );
  if (!cat) throw new Error('Category not found');

  const prevRow = await db.get(
    `SELECT available_amount FROM monthly_budgets
     WHERE CAST(category_id AS TEXT) = CAST(? AS TEXT) AND month = ?`,
    [categoryId, addCalendarMonths(mk, -1)]
  );

  const previousAvailable = resolveCategoryCarryover(cat, Number(prevRow?.available_amount) || 0);

  const envelope = await buildCategoryEnvelopeRow(db, userId, cat, {
    monthKey: mk,
    previousAvailable,
    budgeted: next,
    isCurrentCalendarMonth,
  });

  await upsertMonthlyRow(db, {
    category_id: categoryId,
    month: mk,
    budgeted_amount: envelope.assigned,
    activity_amount: envelope.activity,
    available_amount: envelope.available,
  });

  if (isCurrentCalendarMonth) {
    await db.run(
      `UPDATE categories
       SET assigned=?, available=?, activity=?, updated_at=datetime('now')
       WHERE CAST(id AS TEXT)=CAST(? AS TEXT) AND user_id=?`,
      [envelope.assigned, envelope.available, envelope.activity, categoryId, userId]
    );
  }

  /**
   * FIX #3 (CRITICAL):
   * ALWAYS update RTA, even for automation-created rows.
   */
  await readyToAssignPoolService.applyAssignmentPoolDelta(
    db,
    userId,
    previous,
    envelope.assigned,
    { skipPoolAdjustment: false }
  );

  await recordBudgetAssignmentAudit(db, {
    userId,
    categoryId,
    monthKey: mk,
    previousAssigned: previous,
    newAssigned: envelope.assigned,
    source: opts.auditSource || 'assign',
  });

  return envelope;
}

/**
 * FIX #4:
 * Unassign always flows through applyMonthBudgetedAmount → RTA always correct.
 */
async function unassignCategoryForMonth(db, userId, categoryId, monthKey, opts = {}) {
  const mk = toLocalMonthKey(monthKey);
  const beforeRTA = await readReadyToAssignBalance(db, userId);

  const snapshot = await getBudgetMonthSnapshot(db, userId, mk);
  const snapCat = (snapshot.categories || []).find(
    (c) => normalizeCategoryId(c.id) === normalizeCategoryId(categoryId),
  );
  const fromSnapshot = roundMoney(Number(snapCat?.assigned) || 0);
  const fromBudget = await readMonthAssignedForUnassign(db, userId, categoryId, mk);
  const prevAssigned = roundMoney(Math.max(fromSnapshot, fromBudget));

  if (prevAssigned <= 0.005) {
    return {
      categoryId,
      monthKey: mk,
      previousAssigned: 0,
      released: 0,
      readyToAssign: beforeRTA,
      readyToAssignBefore: beforeRTA,
      readyToAssignDelta: 0,
      verified: true,
      verification: { verified: true, errors: [] },
      snapshot,
    };
  }

  await runBudgetTransaction(db, async () => {
    await applyMonthBudgetedAmount(db, userId, categoryId, mk, 0, {
      auditSource: opts.auditSource || 'unassign_category',
    });
  });

  await refreshCategoryEnvelopesForward(db, userId, mk, [categoryId], 1);
  const finalSnapshot = await getBudgetMonthSnapshot(db, userId, mk);
  const finalCat = (finalSnapshot.categories || []).find(
    (c) => normalizeCategoryId(c.id) === normalizeCategoryId(categoryId),
  );
  const rtaMeta = await buildReadyToAssignMutationMeta(db, userId, beforeRTA);
  const verification = await verifyUnassignCategoryResult(db, userId, categoryId, mk, {
    expectedReleased: prevAssigned,
    rtaBefore: rtaMeta.readyToAssignBefore,
    rtaAfter: rtaMeta.readyToAssign,
  });

  console.log('[unassignCategoryForMonth] complete', {
    categoryId,
    monthKey: mk,
    prevAssigned,
    released: prevAssigned,
    readyToAssignDelta: rtaMeta.readyToAssignDelta,
    finalAssigned: roundMoney(Number(finalCat?.assigned) || 0),
    verified: verification.verified,
    errors: verification.errors,
  });

  return {
    categoryId,
    monthKey: mk,
    previousAssigned: prevAssigned,
    released: prevAssigned,
    category: finalCat
      ? {
          id: finalCat.id,
          assigned: roundMoney(Number(finalCat.assigned) || 0),
          available: roundMoney(Number(finalCat.available) || 0),
          activity: roundMoney(Number(finalCat.activity) || 0),
        }
      : null,
    snapshot: finalSnapshot,
    verified: verification.verified,
    verification,
    ...rtaMeta,
  };
}

/**
 * FIX #5:
 * Fund Underfunded uses bulk delta engine + forward envelope refresh.
 * Plan allocation amounts are deltas (add to current assigned), not absolutes.
 */
async function fundUnderfundedForMonth(db, userId, monthKey, opts = {}) {
  const mk = toLocalMonthKey(monthKey);
  const beforeRTA = await readReadyToAssignBalance(db, userId);
  const totalCash = Number.isFinite(Number(opts.totalCash)) ? Number(opts.totalCash) : null;
  const logPrefix = '[fundUnderfundedForMonth]';

  const snapshot = await getBudgetMonthSnapshot(db, userId, mk);
  const plan = computeFundUnderfundedPlan(snapshot.categories, {
    pool: beforeRTA,
  });

  console.log(`${logPrefix} plan`, {
    monthKey: mk,
    pool: beforeRTA,
    allocationCount: plan.allocations.length,
    totalToAssign: plan.totalToAssign,
    totalFundingNeed: plan.totalFundingNeed,
    dryRun: opts.dryRun === true,
  });

  if (opts.dryRun === true || !plan.allocations.length) {
    return {
      monthKey: mk,
      snapshot,
      plan,
      assignments: [],
      readyToAssign: beforeRTA,
      readyToAssignBefore: beforeRTA,
      readyToAssignDelta: 0,
    };
  }

  const bulkAssignments = plan.allocations.map((row) => ({
    categoryId: row.categoryId,
    delta: row.amount,
  }));

  console.log(`${logPrefix} applying bulk deltas`, {
    assignments: bulkAssignments.map((row) => ({
      categoryId: row.categoryId,
      delta: row.delta,
    })),
  });

  const bulkResult = await applyMonthBudgetBulkAndRefresh(
    db,
    userId,
    mk,
    bulkAssignments,
    {
      mode: 'delta',
      totalCash,
      auditSource: 'fund_underfunded',
      forwardMonths: Number(opts.forwardMonths) || 36,
    }
  );

  const afterSnapshotRaw = await getBudgetMonthSnapshot(db, userId, mk);
  const mergedCategories = mergeFundAssignmentsIntoSnapshotCategories(
    afterSnapshotRaw.categories,
    bulkResult.assignments,
  );
  const afterSnapshot = enrichBudgetSnapshot({
    monthKey: mk,
    categories: mergedCategories,
  });

  console.log(`${logPrefix} applied`, {
    assignmentCount: bulkResult.assignments?.length || 0,
    readyToAssignBefore: bulkResult.readyToAssignBefore,
    readyToAssignAfter: bulkResult.readyToAssign,
    readyToAssignDelta: bulkResult.readyToAssignDelta,
    underfundedAfter: afterSnapshot.underfundedTotal,
    sampleAssignments: (bulkResult.assignments || []).slice(0, 5).map((row) => ({
      categoryId: row.categoryId,
      assigned: row.assigned,
      available: row.available,
    })),
  });

  return {
    monthKey: mk,
    snapshot: afterSnapshot,
    plan,
    assignments: bulkResult.assignments || [],
    ...bulkResult,
  };
}

/**
 * SNAPSHOT — authoritative month rows for UI reload.
 * Uses CAST-safe monthly_budgets lookup + carryover; never zeroes assigned when a row exists.
 */
async function getBudgetMonthSnapshot(db, userId, monthKey) {
  const mk = toLocalMonthKey(monthKey);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentCalendarMonth = mk === todayKey;
  const prevMonthKey = addCalendarMonths(mk, -1);

  const categories = await db.all(
    `SELECT * FROM categories WHERE user_id=? AND ${sqlCategoryNotArchived('categories')}`,
    [userId]
  );

  const rows = [];

  for (const c of categories) {
    const mb = await db.get(
      `SELECT * FROM monthly_budgets
       WHERE CAST(category_id AS TEXT) = CAST(? AS TEXT) AND month = ?`,
      [c.id, mk]
    );
    const prevRow = await db.get(
      `SELECT available_amount FROM monthly_budgets
       WHERE CAST(category_id AS TEXT) = CAST(? AS TEXT) AND month = ?`,
      [c.id, prevMonthKey]
    );
    const previousAvailable = previousAvailableForCategory(c, prevRow);
    const budgeted = resolveBudgetedForMonth(c, mb, isCurrentCalendarMonth);

    const envelope = await buildCategoryEnvelopeRow(db, userId, c, {
      monthKey: mk,
      previousAvailable,
      budgeted,
      isCurrentCalendarMonth,
    });

    rows.push({
      ...c,
      ...envelope,
      budgeted_amount: budgeted,
    });
  }

  return enrichBudgetSnapshot({ monthKey: mk, categories: rows });
}

function mergeFundAssignmentsIntoSnapshotCategories(categories, assignments) {
  const byId = new Map(
    (assignments || []).map((row) => [normalizeCategoryId(row.categoryId), row]),
  );
  if (!byId.size) return categories || [];
  return (categories || []).map((cat) => {
    const patch = byId.get(normalizeCategoryId(cat.id));
    if (!patch) return cat;
    return {
      ...cat,
      assigned: roundMoney(Number(patch.assigned) || 0),
      available: roundMoney(Number(patch.available) || 0),
      activity: roundMoney(Number(patch.activity) || 0),
      budgeted_amount: roundMoney(Number(patch.assigned) || 0),
    };
  });
}

function previousAvailableForCategory(category, prevRow) {
  const raw = prevRow ? Number(prevRow.available_amount) || 0 : 0;
  return resolveCategoryCarryover(category, raw);
}

/**
 * Resolve current-month Assigned from monthly_budgets (authoritative) with category fallback.
 * @param {object} cat
 * @param {object | undefined} mb
 * @param {boolean} isCurrentCalendarMonth
 */
function resolveBudgetedForMonth(cat, mb, isCurrentCalendarMonth) {
  const fromRow = mb == null ? null : roundMoney(Number(mb.budgeted_amount) || 0);
  const fromCategory = isCurrentCalendarMonth
    ? roundMoney(Number(cat?.assigned) || 0)
    : 0;
  if (mb == null) {
    return isCurrentCalendarMonth ? fromCategory : 0;
  }
  if (isCurrentCalendarMonth && fromCategory > fromRow + 0.02) {
    return fromCategory;
  }
  return fromRow;
}

async function readMonthBudgeted(db, userId, categoryId, monthKey) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentCalendarMonth = normalizedMonth === todayKey;
  const mb = await db.get(
    `SELECT budgeted_amount FROM monthly_budgets
     WHERE CAST(category_id AS TEXT) = CAST(? AS TEXT) AND month = ?`,
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

/** @deprecated Use per-category totals from categoryAvailableEngine; kept for callers expecting a map. */
/**
 * Parent transaction IDs that contribute to category activity in a budget month
 * (direct categorizations + split lines; excludes transfers).
 */
async function getCategoryActivityTransactionIds(db, userId, categoryId, monthKey) {
  const ym = String(monthKey || '').slice(0, 7);
  if (!categoryId || !ym) return [];

  const isReadyToAssign =
    categoryId === 'inflow_ready_to_assign' || categoryId === '__ready_to_assign__';

  if (isReadyToAssign) {
    const rows = await db.all(
      `
      SELECT DISTINCT t.id
      FROM transactions t
      WHERE t.user_id = ?
        AND (t.category_id IS NULL OR t.category_id = '')
        AND IFNULL(t.is_transfer, 0) = 0
        AND t.amount > 0
        AND strftime('%Y-%m', t.date) = ?
    `,
      [userId, ym]
    );
    return (rows || []).map((r) => String(r.id));
  }

  const rows = await db.all(
    `
    SELECT DISTINCT tx_id AS id FROM (
      SELECT CAST(t.id AS TEXT) AS tx_id
      FROM transactions t
      WHERE t.user_id = ?
        AND t.category_id = ?
        AND IFNULL(t.is_transfer, 0) = 0
        AND strftime('%Y-%m', t.date) = ?
      UNION
      SELECT CAST(t.id AS TEXT) AS tx_id
      FROM transaction_splits ts
      INNER JOIN transactions t ON CAST(t.id AS TEXT) = CAST(ts.transaction_id AS TEXT)
      WHERE ts.user_id = ?
        AND ts.category_id = ?
        AND IFNULL(t.is_transfer, 0) = 0
        AND strftime('%Y-%m', t.date) = ?
    )
  `,
    [userId, categoryId, ym, userId, categoryId, ym]
  );
  return (rows || []).map((r) => String(r.id));
}

async function getActivityTotalsByCategoryForMonth(db, userId, monthKey) {
  const ym = monthKey.slice(0, 7);
  const rows = await db.all(
    `
    SELECT category_id, COALESCE(SUM(activity_line), 0) AS activity
    FROM (
      SELECT
        t.category_id AS category_id,
        CASE WHEN IFNULL(t.is_transfer, 0) = 1 THEN 0 ELSE -t.amount END AS activity_line
      FROM transactions t
      WHERE t.user_id = ?
        AND t.category_id IS NOT NULL
        AND strftime('%Y-%m', t.date) = ?
      UNION ALL
      SELECT
        ts.category_id,
        CASE
          WHEN IFNULL(t.is_transfer, 0) = 1 THEN 0
          WHEN t.amount < 0 THEN -ts.amount
          WHEN t.amount > 0 THEN ts.amount
          ELSE 0
        END AS activity_line
      FROM transaction_splits ts
      INNER JOIN transactions t ON CAST(t.id AS TEXT) = CAST(ts.transaction_id AS TEXT)
      WHERE ts.user_id = ?
        AND strftime('%Y-%m', t.date) = ?
    )
    GROUP BY category_id
  `,
    [userId, ym, userId, ym]
  );
  const map = Object.create(null);
  for (const r of rows || []) {
    if (r.category_id) map[r.category_id] = Number(r.activity) || 0;
  }
  return map;
}

async function getMonthlyRowMap(db, monthKey, categoryIds) {
  if (!categoryIds.length) return new Map();
  const normalizedIds = categoryIds.map((id) => normalizeCategoryId(id)).filter(Boolean);
  if (!normalizedIds.length) return new Map();
  const clauses = normalizedIds.map(() => 'CAST(category_id AS TEXT) = CAST(? AS TEXT)').join(' OR ');
  const rows = await db.all(
    `SELECT category_id, budgeted_amount, activity_amount, available_amount
     FROM monthly_budgets
     WHERE month = ? AND (${clauses})`,
    [monthKey, ...normalizedIds]
  );
  const map = new Map();
  for (const r of rows || []) {
    map.set(normalizeCategoryId(r.category_id), r);
  }
  return map;
}

/**
 * Persist activity/available only. Never overwrite an existing budgeted_amount row.
 * Used by envelope refresh after transactions, sync, and snapshot recompute.
 */
async function upsertMonthlyEnvelopeRow(db, row) {
  const categoryId = normalizeCategoryId(row.category_id);
  const existing = await db.get(
    `SELECT id, budgeted_amount FROM monthly_budgets
     WHERE CAST(category_id AS TEXT) = CAST(? AS TEXT) AND month = ?`,
    [categoryId, row.month]
  );

  if (existing) {
    await db.run(
      `UPDATE monthly_budgets
       SET activity_amount = ?, available_amount = ?, updated_at = datetime('now')
       WHERE CAST(category_id AS TEXT) = CAST(? AS TEXT) AND month = ?`,
      [
        Number(row.activity_amount) || 0,
        Number(row.available_amount) || 0,
        categoryId,
        row.month,
      ]
    );
    return roundMoney(Number(existing.budgeted_amount) || 0);
  }

  await upsertMonthlyRow(db, row);
  return roundMoney(Number(row.budgeted_amount) || 0);
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
 * Recompute activity/available for specific categories from startMonth forward.
 * Preserves budgeted_amount from monthly_budgets (no global assigned inflation).
 */
async function refreshCategoryEnvelopesForward(
  db,
  userId,
  startMonthKey,
  categoryIds,
  forwardMonths = 36
) {
  const ids = [...new Set((categoryIds || []).map((id) => String(id)).filter(Boolean))];
  if (!ids.length) return;

  let key = toLocalMonthKey(startMonthKey);
  const todayKey = toLocalMonthKey(new Date());
  const n = Math.max(1, Math.min(Number(forwardMonths) || 36, 120));

  for (let i = 0; i < n; i++) {
    const isCurrentCalendarMonth = key === todayKey;
    const prevMonthKey = addCalendarMonths(key, -1);
    const [rowThisMonth, rowPrevMonth] = await Promise.all([
      getMonthlyRowMap(db, key, ids),
      getMonthlyRowMap(db, prevMonthKey, ids),
    ]);

    await runBudgetTransaction(db, async () => {
      for (const categoryId of ids) {
        const cat = await db.get(
          `SELECT * FROM categories
           WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
          [categoryId, userId]
        );
        if (!cat) continue;

        const mb = rowThisMonth.get(normalizeCategoryId(categoryId));
        const prevRow = rowPrevMonth.get(normalizeCategoryId(categoryId));
        const previousAvailable = previousAvailableForCategory(cat, prevRow);
        const budgeted = await readMonthBudgeted(db, userId, categoryId, key);

        const envelope = await buildCategoryEnvelopeRow(db, userId, cat, {
          monthKey: key,
          previousAvailable,
          budgeted,
          isCurrentCalendarMonth,
        });

        const persistedAssigned = await upsertMonthlyEnvelopeRow(db, {
          category_id: categoryId,
          month: key,
          budgeted_amount: budgeted,
          activity_amount: envelope.activity,
          available_amount: envelope.available,
        });

        if (isCurrentCalendarMonth) {
          await db.run(
            `UPDATE categories
             SET assigned = ?, available = ?, activity = ?, updated_at = datetime('now')
             WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
            [
              persistedAssigned,
              envelope.available,
              envelope.activity,
              categoryId,
              userId,
            ]
          );
        }
      }
    });

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
 * @deprecated Disabled — assigned amounts must not be cleared by automated healers.
 * Returns candidate rows for diagnostics only.
 */
async function releasePhantomImplicitAssignments(db, userId) {
  const phantoms = await findPhantomImplicitAssignmentRows(db, userId);
  return {
    released: 0,
    rows: phantoms,
    skipped: true,
    reason: 'automated_phantom_heal_disabled',
  };
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
    const amount = roundMoney(Number(row.mb_budgeted) || 0);
    if (month === todayKey) {
      seenCurrentMonth.add(String(row.category_id));
    }
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

async function getGlobalBudgetSummary(db, userId, totalCash, _opts = {}) {
  const { rows, currentMonthKey } = await getGlobalAssignmentTotals(db, userId);
  const legacySummary = computeGlobalBudgetSummary(rows, currentMonthKey, totalCash);
  const poolBalance = await readyToAssignPoolService.ensurePoolBackfilled(
    db,
    userId,
    totalCash,
    legacySummary.totalAssigned
  );
  const summary = computeGlobalBudgetSummary(rows, currentMonthKey, totalCash, {
    readyToAssignBalance: poolBalance,
  });
  let categoryTotal = 0;
  let budgetInvariantValid = Math.abs(
    roundMoney(summary.totalCash - (summary.readyToAssign + summary.totalAssigned))
  ) < 0.02;
  let budgetInvariantDelta = roundMoney(
    summary.totalCash - (summary.readyToAssign + summary.totalAssigned)
  );
  try {
    const budgetIntegrityService = require('./budgetIntegrityService.cjs');
    const identity = await budgetIntegrityService.evaluateBudgetIdentity(db, userId, {
      monthKey: currentMonthKey,
    });
    categoryTotal = identity.categoryTotal;
    budgetInvariantValid = identity.invariantValid;
    budgetInvariantDelta = identity.budgetInvariantDelta;
  } catch (integrityErr) {
    console.warn('getGlobalBudgetSummary integrity:', integrityErr?.message || integrityErr);
  }
  return {
    ...summary,
    categoryTotal,
    budgetInvariantValid,
    budgetInvariantDelta,
  };
}

/**
 * Align persisted RTA pool with on-budget cash minus total assigned (scoped budget equation).
 */
async function reconcileBudgetPoolEnvelope(db, userId, totalCash) {
  const budgetIntegrityService = require('./budgetIntegrityService.cjs');
  const result = await budgetIntegrityService.reconcileBudgetIdentity(db, userId);
  return {
    readyToAssign: result.readyToAssign,
    categoryTotal: result.categoryTotal,
    totalCash: result.onBudgetCash ?? totalCash,
    reconciled: result.reconciled,
  };
}

/**
 * @param {import('sqlite').Database} db
 * @param {string} userId
 * @param {number} positiveDelta
 * @param {number} totalCash
 */
async function assertSufficientReadyToAssign(db, userId, positiveDelta, _totalCash) {
  const nDelta = Number(positiveDelta) || 0;
  if (nDelta <= 0) return;
  const pool = await readyToAssignPoolService.getPoolBalance(db, userId);
  if (nDelta > pool + 0.005) {
    const err = new Error('Insufficient Ready to Assign funds.');
    err.code = 'INSUFFICIENT_RTA';
    err.readyToAssign = pool;
    throw err;
  }
}

async function setReadyToAssignPoolBalance(db, userId, target) {
  return readyToAssignPoolService.setPoolBalance(db, userId, target);
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
 * Apply client-provided assigned + available (e.g. credit card envelope moves) for a month.
 */
async function applyMonthAssignedAndAvailable(db, userId, categoryId, monthKey, assigned, available, opts = {}) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentCalendarMonth = normalizedMonth === todayKey;
  const previousAssigned = await readMonthBudgeted(db, userId, categoryId, normalizedMonth);
  const a = Number(assigned) || 0;
  assertAssignedMutationAllowed(previousAssigned, a, {
    auditSource: opts.auditSource || 'assign',
    userIntentAssignment: opts.userIntentAssignment,
  });

  const prevMonthKey = addCalendarMonths(normalizedMonth, -1);

  const cat = await db.get(
    'SELECT * FROM categories WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?',
    [categoryId, userId]
  );
  if (!cat) {
    throw new Error('Category not found');
  }

  const prevRow = await db.get(
    'SELECT available_amount FROM monthly_budgets WHERE category_id = ? AND month = ?',
    [categoryId, prevMonthKey]
  );
  const previousAvailable = previousAvailableForCategory(cat, prevRow);

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

  const rtaBefore = await readReadyToAssignBalance(db, userId);

  const bulkResult = await withBudgetDbLock(async () => {
  if (Number.isFinite(opts.totalCash) && mode === 'delta' && !opts.skipRtaCheck) {
    const netDeltaSum = rows.reduce((sum, item) => sum + (Number(item?.delta) || 0), 0);
    const newAssignmentFromPool = netDeltaSum > 0.005 ? netDeltaSum : 0;
    if (newAssignmentFromPool > 0) {
      await assertSufficientReadyToAssign(db, userId, newAssignmentFromPool, opts.totalCash);
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
            skipPoolAdjustment: opts.skipPoolAdjustment === true,
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
            skipPoolAdjustment: opts.skipPoolAdjustment === true,
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

  const rtaMeta = await buildReadyToAssignMutationMeta(db, userId, rtaBefore);
  return { ...bulkResult, ...rtaMeta };
}

/**
 * Apply bulk month assignments then refresh forward envelopes so UI + RTA stay aligned.
 */
async function applyMonthBudgetBulkAndRefresh(db, userId, monthKey, assignments, opts = {}) {
  const result = await applyMonthBudgetBulk(db, userId, monthKey, assignments, opts);
  const forwardMonths = Number(opts.forwardMonths) || 36;
  const isMoveMoney =
    opts.auditSource === 'move_money' || opts.auditSource === 'move_money_undo';
  const isFundUnderfunded = opts.auditSource === 'fund_underfunded';
  if (isMoveMoney || isFundUnderfunded) {
    const categoryIds = (assignments || [])
      .map((item) => item?.categoryId)
      .filter((id) => id !== undefined && id !== null && String(id).trim() !== '');
    await refreshCategoryEnvelopesForward(
      db,
      userId,
      result.monthKey,
      categoryIds,
      forwardMonths
    );
  } else {
    await refreshBudgetMonthsForward(db, userId, result.monthKey, forwardMonths);
  }
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

  await runBudgetTransaction(db, async () => {
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
      const previousAvailable = previousAvailableForCategory(cat, prevRow);
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
        await upsertMonthlyEnvelopeRow(db, {
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

      if (Math.abs(orphan) > 0.01) {
        repairs.push({
          categoryId: cat.id,
          name: cat.name,
          type: 'skipped_budget_adjustment',
          previousBudgeted: budgeted,
          orphan,
          note: 'Assigned is preserved; only explicit user actions may change budgeted_amount.',
        });
      }
    }
  });

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
  requireUserIntentMaintenanceOperation(opts);
  const normalizedMonth = toLocalMonthKey(monthKey);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentCalendarMonth = normalizedMonth === todayKey;
  const assignAuditSource = opts.auditSource || 'consolidate_assignments';

  const categories = await db.all(
    `SELECT c.*
     FROM categories c
     WHERE c.user_id = ?
       AND ${sqlCategoryNotArchived('c')}`,
    [userId]
  );

  const conversions = [];

  await runBudgetTransaction(db, async () => {
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
        {
          ignoreCarryover: true,
          auditSource: assignAuditSource,
          userIntentAssignment: true,
        }
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
  });

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
  const rtaBefore = await readReadyToAssignBalance(db, userId);
  const snapshot = await getBudgetMonthSnapshot(db, userId, normalizedMonth);

  const categoriesToClear = [];
  for (const cat of snapshot.categories || []) {
    const assigned = await readMonthBudgeted(db, userId, cat.id, normalizedMonth);
    if (assigned > 0.005) {
      categoriesToClear.push({ ...cat, assigned: roundMoney(assigned) });
    }
  }

  let totalReleased = 0;
  const breakdown = [];

  await runBudgetTransaction(db, async () => {
    for (const cat of categoriesToClear) {
      const previousAssigned = roundMoney(Number(cat.assigned) || 0);
      await applyMonthBudgetedAmount(db, userId, cat.id, normalizedMonth, 0, {
        auditSource: opts.auditSource || 'unassign_month',
        auditMetadata: opts.auditMetadata || null,
      });

      totalReleased += previousAssigned;
      breakdown.push({
        categoryId: cat.id,
        categoryName: cat.name,
        released: previousAssigned,
      });
    }
  });

  await refreshBudgetMonthsForward(db, userId, normalizedMonth, 12);
  const finalSnapshot = await getBudgetMonthSnapshot(db, userId, normalizedMonth);
  const rtaMeta = await buildReadyToAssignMutationMeta(db, userId, rtaBefore);

  console.log('[unassignAllForMonth] complete', {
    monthKey: normalizedMonth,
    categoriesUpdated: breakdown.length,
    totalReleased: roundMoney(totalReleased),
    readyToAssignDelta: rtaMeta.readyToAssignDelta,
    remainingAssigned: roundMoney(
      (finalSnapshot.categories || []).reduce(
        (sum, cat) => sum + Math.max(0, Number(cat.assigned) || 0),
        0,
      ),
    ),
  });

  return {
    monthKey: normalizedMonth,
    totalReleased: roundMoney(totalReleased),
    categoriesUpdated: breakdown.length,
    breakdown,
    snapshot: finalSnapshot,
    ...rtaMeta,
  };
}

/**
 * Zero Assigned for one category in one month; returns released funds to global RTA.
 */
async function verifyUnassignCategoryResult(db, userId, categoryId, monthKey, opts = {}) {
  const normalizedMonth = toLocalMonthKey(monthKey);
  const expectedReleased = roundMoney(Number(opts.expectedReleased) || 0);
  const rtaBefore = roundMoney(Number(opts.rtaBefore) || 0);
  const rtaAfter = roundMoney(Number(opts.rtaAfter) || 0);
  const budgetedAfter = await readMonthBudgeted(db, userId, categoryId, normalizedMonth);
  const todayKey = toLocalMonthKey(new Date());
  const isCurrentMonth = normalizedMonth === todayKey;

  let categoryAssignedAfter = null;
  if (isCurrentMonth) {
    const cat = await db.get(
      'SELECT assigned FROM categories WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?',
      [categoryId, userId]
    );
    categoryAssignedAfter = roundMoney(Number(cat?.assigned) || 0);
  }

  const { getBudgetAssignmentAuditLog } = require('./budgetAssignmentAuditService.cjs');
  const auditRows = await getBudgetAssignmentAuditLog(db, userId, {
    categoryId,
    monthKey: normalizedMonth,
    limit: 10,
  });
  const unassignAudit = auditRows.find(
    (row) =>
      String(row.source || '').toLowerCase() === 'unassign_category' &&
      Math.abs(Number(row.newAssigned) || 0) <= 0.005
  );

  const errors = [];
  if (expectedReleased > 0.005) {
    if (budgetedAfter > 0.005) {
      errors.push(`monthly_budgets.budgeted_amount is still ${budgetedAfter}`);
    }
    if (isCurrentMonth && categoryAssignedAfter > 0.005) {
      errors.push(`categories.assigned is still ${categoryAssignedAfter}`);
    }
    const rtaDelta = roundMoney(rtaAfter - rtaBefore);
    if (Math.abs(rtaDelta - expectedReleased) > 0.02) {
      errors.push(
        `Ready to Assign delta ${rtaDelta} does not match released ${expectedReleased}`,
      );
    }
    if (!unassignAudit) {
      errors.push('missing budget_assignment_audit row with source unassign_category');
    }
  }

  return {
    verified: errors.length === 0,
    errors,
    budgetedAfter,
    categoryAssignedAfter,
    readyToAssignBefore: rtaBefore,
    readyToAssignAfter: rtaAfter,
    readyToAssignDelta: roundMoney(rtaAfter - rtaBefore),
    auditId: unassignAudit?.id || null,
  };
}

/**
 * Roll back envelope balances from a month forward (returns funds to Ready to Assign).
 */
async function resetEnvelopesFromMonth(db, userId, monthKey, opts = {}) {
  requireUserIntentMaintenanceOperation(opts);
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

  await runBudgetTransaction(db, async () => {
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
  });

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

function formatMonthLabel(monthKey) {
  const mk = toLocalMonthKey(monthKey);
  const y = parseInt(mk.slice(0, 4), 10);
  const m = parseInt(mk.slice(5, 7), 10);
  if (!Number.isFinite(y) || !Number.isFinite(m)) return mk;
  return new Date(y, m - 1, 1, 12, 0, 0, 0).toLocaleString('en-US', {
    month: 'long',
    year: 'numeric',
  });
}

function enumerateMonthKeysInclusive(minMonthKey, maxMonthKey) {
  const min = toLocalMonthKey(minMonthKey);
  const max = toLocalMonthKey(maxMonthKey);
  if (min > max) return [min];

  const keys = [];
  let y = parseInt(min.slice(0, 4), 10);
  let m = parseInt(min.slice(5, 7), 10);
  const endY = parseInt(max.slice(0, 4), 10);
  const endM = parseInt(max.slice(5, 7), 10);

  while (y < endY || (y === endY && m <= endM)) {
    keys.push(`${y}-${pad2(m)}-01`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return keys;
}

/**
 * Timeline for the budget month dropdown: earliest budget month through
 * max(furthest budgeted month, current calendar month), every month in between.
 */
async function listBudgetTimelineMonths(db, userId) {
  const currentKey = toLocalMonthKey(new Date());

  const bounds = await db.get(
    `
    SELECT MIN(mb.month) AS min_month, MAX(mb.month) AS max_month
    FROM monthly_budgets mb
    INNER JOIN categories c ON CAST(c.id AS TEXT) = CAST(mb.category_id AS TEXT)
    WHERE c.user_id = ?
  `,
    [userId]
  );

  const activityRows = await db.all(
    `
    SELECT DISTINCT mb.month AS month
    FROM monthly_budgets mb
    INNER JOIN categories c ON CAST(c.id AS TEXT) = CAST(mb.category_id AS TEXT)
    WHERE c.user_id = ?
      AND (
        ABS(COALESCE(mb.budgeted_amount, 0)) > 0.005
        OR ABS(COALESCE(mb.activity_amount, 0)) > 0.005
        OR ABS(COALESCE(mb.available_amount, 0)) > 0.005
      )
  `,
    [userId]
  );

  const budgetedSet = new Set(
    (activityRows || []).map((r) => toLocalMonthKey(r.month))
  );

  let minKey = bounds?.min_month ? toLocalMonthKey(bounds.min_month) : currentKey;
  let maxBudgetedKey = bounds?.max_month ? toLocalMonthKey(bounds.max_month) : currentKey;
  const maxKey = maxBudgetedKey > currentKey ? maxBudgetedKey : currentKey;

  if (minKey > maxKey) minKey = currentKey;
  if (!bounds?.min_month && budgetedSet.size === 0) {
    return {
      currentMonthKey: currentKey,
      minMonthKey: currentKey,
      maxMonthKey: currentKey,
      months: [
        {
          monthKey: currentKey,
          label: formatMonthLabel(currentKey),
          isCurrentMonth: true,
          hasBudgetData: false,
        },
      ],
    };
  }

  const monthKeys = enumerateMonthKeysInclusive(minKey, maxKey);
  const months = monthKeys.map((monthKey) => ({
    monthKey,
    label: formatMonthLabel(monthKey),
    isCurrentMonth: monthKey === currentKey,
    hasBudgetData: budgetedSet.has(monthKey),
  }));

  return {
    currentMonthKey: currentKey,
    minMonthKey: minKey,
    maxMonthKey: maxKey,
    maxBudgetedMonthKey: maxBudgetedKey,
    months,
  };
}

module.exports = {
  toLocalMonthKey,
  resolveBudgetedForMonth,
  readMonthBudgeted,
  addCalendarMonths,
  getActivityTotalsByCategoryForMonth,
  getCategoryActivityTransactionIds,
  getBudgetMonthSnapshot,
  enrichCategoriesWithUnderfunded,
  enrichBudgetSnapshot,
  refreshBudgetMonthsForward,
  refreshCategoryEnvelopesForward,
  applyMonthBudgetedAmount,
  applyMonthBudgetDelta,
  applyMonthAssignedAndAvailable,
  applyMonthBudgetBulk,
  applyMonthBudgetBulkAndRefresh,
  fundUnderfundedForMonth,
  repairImplicitAssignmentsForMonth,
  repairAndRefreshBudgetMonths,
  consolidateAvailableIntoMonthAssignments,
  resetEnvelopesFromMonth,
  unassignAllForMonth,
  unassignCategoryForMonth,
  verifyUnassignCategoryResult,
  auditBudgetMonthIntegrity,
  getGlobalAssignmentTotals,
  getGlobalBudgetSummary,
  listBudgetTimelineMonths,
  findPhantomImplicitAssignmentRows,
  releasePhantomImplicitAssignments,
  assertSufficientReadyToAssign,
  setReadyToAssignPoolBalance,
  reconcileBudgetPoolEnvelope,
  computeReadyToAssign,
};
