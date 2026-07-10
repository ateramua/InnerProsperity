/**
 * Envelope carryover bridge — prevents month-gap corruption during refresh.
 * When an intermediate monthly_budgets row is missing, carryover must not reset to zero.
 */

const crypto = require('crypto');
const { roundMoney } = require('../../shared/readyToAssignEngine.cjs');
const { resolveCategoryCarryover } = require('./categoryCarryover.cjs');

const MAX_LOOKBACK_MONTHS = 120;
const CONSERVATION_TOLERANCE = 0.05;

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

function monthDateBind(monthKey) {
  return toLocalMonthKey(monthKey);
}

function normalizeCategoryId(id) {
  return id == null ? '' : String(id).trim();
}

function isCarryCategory(category) {
  const mode = String(category?.carryover_mode || 'carry').trim().toLowerCase();
  return mode !== 'reset';
}

async function fetchMonthlyBudgetRow(db, categoryId, monthKey) {
  const month = monthDateBind(monthKey);
  const cid = normalizeCategoryId(categoryId);
  if (!cid || !month) return null;
  return db.get(
    `SELECT * FROM monthly_budgets
     WHERE CAST(category_id AS TEXT) = CAST(? AS TEXT)
       AND date(month) = date(?)
     ORDER BY datetime(updated_at) DESC, rowid DESC
     LIMIT 1`,
    [cid, month]
  );
}

/**
 * Find the nearest prior month row for a category (skipping gaps).
 */
async function findLastMonthlyRowBefore(db, categoryId, monthKey, maxLookback = MAX_LOOKBACK_MONTHS) {
  let key = addCalendarMonths(toLocalMonthKey(monthKey), -1);
  for (let i = 0; i < maxLookback; i++) {
    const row = await fetchMonthlyBudgetRow(db, categoryId, key);
    if (row) return { monthKey: key, row };
    key = addCalendarMonths(key, -1);
  }
  return null;
}

/**
 * Resolve carryover for month M using immediate predecessor or last-known row.
 */
async function resolvePreviousAvailable(db, category, categoryId, monthKey) {
  const mk = toLocalMonthKey(monthKey);
  const prevMonthKey = addCalendarMonths(mk, -1);
  const prevRow = await fetchMonthlyBudgetRow(db, categoryId, prevMonthKey);
  if (prevRow) {
    return resolveCategoryCarryover(category, Number(prevRow.available_amount) || 0);
  }
  if (!isCarryCategory(category)) return 0;
  const last = await findLastMonthlyRowBefore(db, categoryId, mk);
  if (!last) return 0;
  return resolveCategoryCarryover(category, Number(last.row.available_amount) || 0);
}

async function upsertBridgeRow(db, categoryId, monthKey, availableAmount) {
  const month = monthDateBind(monthKey);
  const cid = normalizeCategoryId(categoryId);
  const existing = await fetchMonthlyBudgetRow(db, cid, month);
  const available = roundMoney(Number(availableAmount) || 0);
  await db.run(
    `INSERT INTO monthly_budgets (
      id, category_id, month, budgeted_amount, activity_amount, available_amount,
      created_at, updated_at
    ) VALUES (?, ?, ?, 0, 0, ?, datetime('now'), datetime('now'))
    ON CONFLICT(category_id, month) DO UPDATE SET
      available_amount = CASE
        WHEN COALESCE(monthly_budgets.budgeted_amount, 0) = 0
         AND COALESCE(monthly_budgets.activity_amount, 0) = 0
        THEN excluded.available_amount
        ELSE monthly_budgets.available_amount
      END,
      updated_at = datetime('now')`,
    [existing?.id || crypto.randomUUID(), cid, month, available]
  );
}

/**
 * Create missing bridge months between last known row and targetMonth (exclusive).
 */
async function ensureBridgeMonthsForCategory(db, userId, category, targetMonthKey) {
  const cid = normalizeCategoryId(category?.id);
  if (!cid || !userId || !isCarryCategory(category)) return { created: 0, gaps: [] };

  const target = toLocalMonthKey(targetMonthKey);
  const last = await findLastMonthlyRowBefore(db, cid, target);
  if (!last) return { created: 0, gaps: [] };

  let cursor = addCalendarMonths(last.monthKey, 1);
  const stop = addCalendarMonths(target, -1);
  let created = 0;
  const gaps = [];
  let rollingAvailable = roundMoney(Number(last.row.available_amount) || 0);

  while (cursor <= stop) {
    const existing = await fetchMonthlyBudgetRow(db, cid, cursor);
    if (!existing) {
      gaps.push(cursor);
      await upsertBridgeRow(db, cid, cursor, rollingAvailable);
      created += 1;
    } else {
      rollingAvailable = roundMoney(Number(existing.available_amount) || 0);
    }
    cursor = addCalendarMonths(cursor, 1);
  }

  return { created, gaps };
}

async function ensureBridgeMonthsBeforeRefresh(db, userId, categoryIds, startMonthKey) {
  const ids = [...new Set((categoryIds || []).map((id) => normalizeCategoryId(id)).filter(Boolean))];
  let totalCreated = 0;
  const allGaps = [];

  for (const categoryId of ids) {
    const cat = await db.get(
      `SELECT * FROM categories
       WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
      [categoryId, userId]
    );
    if (!cat) continue;
    const result = await ensureBridgeMonthsForCategory(db, userId, cat, startMonthKey);
    totalCreated += result.created;
    if (result.gaps.length) {
      allGaps.push({ categoryId, categoryName: cat.name, gaps: result.gaps });
    }
  }

  return { totalCreated, allGaps };
}

async function sumCategoryAvailableForMonth(db, categoryIds, monthKey) {
  const month = monthDateBind(monthKey);
  const ids = [...new Set((categoryIds || []).map((id) => normalizeCategoryId(id)).filter(Boolean))];
  if (!ids.length) return 0;

  let total = 0;
  for (const categoryId of ids) {
    const row = await fetchMonthlyBudgetRow(db, categoryId, month);
    total += Number(row?.available_amount) || 0;
  }
  return roundMoney(total);
}

/**
 * After refresh, persisted available must match the recomputed envelope sum.
 * When persisted values were already consistent with the formula, also enforce
 * total budget conservation (available + RTA). When persisted values were
 * inflated vs the formula (common after bridge repair), allow downward correction.
 */
function assertEnvelopeRefreshIntegrity(before, after, expectedAfterAvailable, context = '', opts = {}) {
  const expected = roundMoney(Number(expectedAfterAvailable) || 0);
  const availAfter = roundMoney(Number(after?.categoryAvailable) || 0);
  const availBefore = roundMoney(Number(before?.categoryAvailable) || 0);

  if (Math.abs(availAfter - expected) > CONSERVATION_TOLERANCE) {
    const err = new Error(
      `Envelope refresh persistence mismatch${context ? ` (${context})` : ''}: ` +
        `expected available ${expected}, persisted ${availAfter}`
    );
    err.code = 'ENVELOPE_REFRESH_PERSISTENCE_MISMATCH';
    throw err;
  }

  const staleInflation = roundMoney(availBefore - expected);
  if (staleInflation > CONSERVATION_TOLERANCE) {
    console.warn(
      `[envelope] corrected stale inflated available${context ? ` (${context})` : ''}: ` +
        `persisted ${availBefore} → ${expected} (Δ ${roundMoney(-staleInflation)})`
    );
    return {
      staleCorrection: true,
      staleInflation,
      prevTotal: roundMoney(availBefore + (Number(before?.readyToAssign) || 0)),
      nextTotal: roundMoney(availAfter + (Number(after?.readyToAssign) || 0)),
    };
  }

  if (opts.strictConservation === false) {
    return {
      staleCorrection: false,
      prevTotal: roundMoney(availBefore + (Number(before?.readyToAssign) || 0)),
      nextTotal: roundMoney(availAfter + (Number(after?.readyToAssign) || 0)),
    };
  }

  return assertEnvelopeRefreshConservation(before, after, context, opts);
}

/**
 * (previous total available + RTA) ≈ (new total available + RTA)
 */
function assertEnvelopeRefreshConservation(before, after, context = '', opts = {}) {
  const prevAvailable = roundMoney(Number(before?.categoryAvailable) || 0);
  const nextAvailable = roundMoney(Number(after?.categoryAvailable) || 0);
  const prevRta = roundMoney(Number(before?.readyToAssign) || 0);
  const nextRta = roundMoney(Number(after?.readyToAssign) || 0);
  const budgetedDelta = roundMoney(Number(opts?.budgetedDelta) || 0);
  const rtaDelta = roundMoney(Number(opts?.rtaDelta) || 0);

  const prevTotal = roundMoney(prevAvailable + prevRta);
  const nextTotal = roundMoney(nextAvailable + nextRta);
  const delta = roundMoney(nextTotal - prevTotal);

  // Assignment moves value from RTA into envelopes — net neutral when both are measured.
  const expectedFromAssignment = roundMoney(budgetedDelta + rtaDelta);
  const unexplainedLoss = roundMoney(delta - expectedFromAssignment);

  if (unexplainedLoss < -CONSERVATION_TOLERANCE && opts.allowUnexplainedLoss !== true) {
    const err = new Error(
      `Envelope refresh destroyed budget value${context ? ` (${context})` : ''}: ` +
        `before ${prevTotal} (avail ${prevAvailable} + RTA ${prevRta}), ` +
        `after ${nextTotal} (avail ${nextAvailable} + RTA ${nextRta}), ` +
        `unexplained loss ${unexplainedLoss} (budgetedΔ ${budgetedDelta}, rtaΔ ${rtaDelta})`
    );
    err.code = 'ENVELOPE_CONSERVATION_VIOLATION';
    err.before = before;
    err.after = after;
    throw err;
  }

  return { prevTotal, nextTotal, delta, unexplainedLoss };
}

/**
 * Detect categories with month gaps that would break carryover on next refresh.
 */
async function detectCarryoverGapIssues(db, userId) {
  const categories = await db.all(
    `SELECT id, name, carryover_mode FROM categories
     WHERE user_id = ?
       AND IFNULL(archived, 0) = 0`,
    [userId]
  );

  const issues = [];
  for (const cat of categories || []) {
    if (!isCarryCategory(cat)) continue;
    const rows = await db.all(
      `SELECT month, available_amount FROM monthly_budgets
       WHERE CAST(category_id AS TEXT) = CAST(? AS TEXT)
       ORDER BY date(month) ASC`,
      [cat.id]
    );
    if (rows.length < 2) continue;

    for (let i = 1; i < rows.length; i++) {
      const prevMonth = toLocalMonthKey(rows[i - 1].month);
      const thisMonth = toLocalMonthKey(rows[i].month);
      const expected = addCalendarMonths(prevMonth, 1);
      if (expected !== thisMonth) {
        const prevAvail = roundMoney(Number(rows[i - 1].available_amount) || 0);
        const thisAvail = roundMoney(Number(rows[i].available_amount) || 0);
        const loss = roundMoney(Math.max(0, prevAvail - thisAvail));
        if (loss > CONSERVATION_TOLERANCE) {
          issues.push({
            categoryId: cat.id,
            categoryName: cat.name,
            gapFrom: prevMonth,
            gapTo: thisMonth,
            estimatedLoss: loss,
          });
        }
      }
    }
  }

  const estimatedLoss = roundMoney(
    issues.reduce((sum, issue) => sum + (Number(issue.estimatedLoss) || 0), 0)
  );

  return { issues, estimatedLoss, issueCount: issues.length };
}

/**
 * Repair all detected carryover gaps for a user (migration / maintenance).
 */
async function repairCarryoverGapsForUser(db, userId) {
  const categories = await db.all(
    `SELECT * FROM categories WHERE user_id = ? AND IFNULL(archived, 0) = 0`,
    [userId]
  );

  let bridgeRowsCreated = 0;
  const months = await db.all(
    `SELECT DISTINCT mb.month FROM monthly_budgets mb
     INNER JOIN categories c ON CAST(c.id AS TEXT) = CAST(mb.category_id AS TEXT)
     WHERE c.user_id = ?
     ORDER BY date(mb.month) ASC`,
    [userId]
  );

  for (const { month } of months || []) {
    const result = await ensureBridgeMonthsBeforeRefresh(
      db,
      userId,
      (categories || []).map((c) => c.id),
      month
    );
    bridgeRowsCreated += result.totalCreated;
  }

  return { bridgeRowsCreated };
}

module.exports = {
  MAX_LOOKBACK_MONTHS,
  CONSERVATION_TOLERANCE,
  toLocalMonthKey,
  addCalendarMonths,
  findLastMonthlyRowBefore,
  resolvePreviousAvailable,
  ensureBridgeMonthsForCategory,
  ensureBridgeMonthsBeforeRefresh,
  sumCategoryAvailableForMonth,
  assertEnvelopeRefreshIntegrity,
  assertEnvelopeRefreshConservation,
  detectCarryoverGapIssues,
  repairCarryoverGapsForUser,
  fetchMonthlyBudgetRow,
};
