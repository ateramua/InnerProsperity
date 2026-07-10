/**
 * Trailing spend averages for spending-target / forecasted_need goals.
 */

const SPENDING_TARGET_TYPES = new Set(['spending_target', 'needed_for_spending']);

function toMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

function isSpendingTargetCategory(cat) {
  const t = String(cat?.target_type || '').toLowerCase();
  return SPENDING_TARGET_TYPES.has(t);
}

/**
 * Average monthly outflows for a category over prior complete months.
 * @param {import('sqlite').Database} db
 * @param {number|string} userId
 * @param {string} categoryId
 * @param {string} monthKey - YYYY-MM-01 (exclude this month from history)
 * @param {number} [lookbackMonths=3]
 */
async function computeTrailingMonthlySpendAverage(db, userId, categoryId, monthKey, lookbackMonths = 3) {
  const rows = await db.all(
    `
    SELECT
      strftime('%Y-%m', t.date) AS ym,
      COALESCE(SUM(
        CASE
          WHEN IFNULL(t.is_transfer, 0) = 1 THEN 0
          WHEN t.amount < 0 THEN ABS(t.amount)
          ELSE 0
        END
      ), 0) AS spend
    FROM transactions t
    WHERE t.user_id = ?
      AND CAST(t.category_id AS TEXT) = CAST(? AS TEXT)
      AND t.date < ?
    GROUP BY ym
    ORDER BY ym DESC
    LIMIT ?
    `,
    [userId, categoryId, monthKey, Math.max(1, lookbackMonths)]
  );

  if (!rows?.length) return 0;
  const sum = rows.reduce((acc, r) => acc + (Number(r.spend) || 0), 0);
  return toMoney(sum / rows.length);
}

/**
 * Resolve forecasted need for one category row.
 */
async function resolveForecastedNeedForCategory(db, userId, cat, monthKey) {
  if (!cat) return 0;

  const stored = Number(cat.average_spending);
  const trailing = await computeTrailingMonthlySpendAverage(db, userId, cat.id, monthKey);
  const explicitTarget = Number(cat.target_amount);

  if (isSpendingTargetCategory(cat)) {
    if (Number.isFinite(explicitTarget) && explicitTarget > 0) {
      return toMoney(Math.max(explicitTarget, trailing));
    }
    if (trailing > 0) return trailing;
    if (Number.isFinite(stored) && stored > 0) return toMoney(stored);
    return 0;
  }

  if (trailing > 0) return trailing;
  if (Number.isFinite(stored) && stored > 0) return toMoney(stored);
  return 0;
}

/**
 * @returns {Promise<Map<string, number>>}
 */
async function buildForecastedNeedMap(db, userId, categories, monthKey, opts = {}) {
  const persist = opts.persist !== false;
  const map = new Map();
  for (const cat of categories || []) {
    if (!cat?.id) continue;
    const forecast = await resolveForecastedNeedForCategory(db, userId, cat, monthKey);
    map.set(String(cat.id), forecast);
    if (
      persist &&
      forecast > 0 &&
      (isSpendingTargetCategory(cat) || forecast !== Number(cat.average_spending))
    ) {
      await db.run(
        `UPDATE categories
         SET average_spending = ?, updated_at = datetime('now')
         WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
        [forecast, cat.id, userId]
      );
    }
  }
  return map;
}

function applyForecastMapToCategories(categories, forecastMap) {
  return (categories || []).map((cat) => {
    const forecast = forecastMap.get(String(cat.id));
    if (forecast == null) return cat;
    return {
      ...cat,
      forecasted_need: forecast,
      average_spending: forecast > 0 ? forecast : cat.average_spending,
    };
  });
}

module.exports = {
  isSpendingTargetCategory,
  computeTrailingMonthlySpendAverage,
  resolveForecastedNeedForCategory,
  buildForecastedNeedMap,
  applyForecastMapToCategories,
};
