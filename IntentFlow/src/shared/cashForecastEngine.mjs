/**
 * Personal Cash Forecast engine — client-side projections from budget, accounts, and transactions.
 */

const MS_DAY = 86400000;

export const FORECAST_HORIZONS = [
  { id: '30d', label: '30 Days', days: 30 },
  { id: '90d', label: '90 Days', days: 90 },
  { id: '6m', label: '6 Months', days: 183 },
  { id: '12m', label: '12 Months', days: 365 },
  { id: '24m', label: '24 Months', days: 730 },
  { id: 'custom', label: 'Custom', days: null },
];

export function resolveHorizonDays(horizonId, customRange = {}) {
  if (horizonId === 'custom' && customRange.start && customRange.end) {
    const start = startOfDay(new Date(customRange.start));
    const end = startOfDay(new Date(customRange.end));
    const diff = Math.round((end - start) / MS_DAY);
    return Math.max(7, Math.min(730, diff));
  }
  return FORECAST_HORIZONS.find((h) => h.id === horizonId)?.days ?? 365;
}

export const FORECAST_MODES = {
  conservative: { id: 'conservative', label: 'Conservative', incomeFactor: 0.92, expenseFactor: 1.12, discretionaryFactor: 1.05 },
  expected: { id: 'expected', label: 'Expected', incomeFactor: 1, expenseFactor: 1, discretionaryFactor: 1 },
  optimistic: { id: 'optimistic', label: 'Optimistic', incomeFactor: 1.06, expenseFactor: 0.94, discretionaryFactor: 0.88 },
};

export function roundMoney(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  return Math.round(x * 100) / 100;
}

export function formatIsoDate(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return '';
  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, '0');
  const day = String(dt.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function startOfDay(date) {
  const d = new Date(date);
  d.setHours(12, 0, 0, 0);
  return d;
}

export function isTransferTx(tx) {
  return tx?.is_transfer === 1 || tx?.is_transfer === true;
}

export function txMagnitude(tx) {
  return Math.abs(Number(tx?.amount) || 0);
}

export function isInflowTx(tx) {
  if (!tx || isTransferTx(tx)) return false;
  if (tx.direction === 'inflow') return true;
  if (tx.direction === 'outflow') return false;
  return Number(tx.amount) > 0;
}

export function isOutflowTx(tx) {
  if (!tx || isTransferTx(tx)) return false;
  if (tx.direction === 'outflow') return true;
  if (tx.direction === 'inflow') return false;
  return Number(tx.amount) < 0;
}

export function signedTxAmount(tx) {
  const mag = txMagnitude(tx);
  return isInflowTx(tx) ? mag : -mag;
}

export function isLiquidAccount(account) {
  const type = String(account?.type || '').toLowerCase();
  return type === 'checking' || type === 'savings' || type === 'cash';
}

export function isDebtAccount(account) {
  const type = String(account?.type || '').toLowerCase();
  return type === 'credit' || type === 'loan' || type === 'mortgage' || type === 'line_of_credit';
}

export function accountBalance(account) {
  const linked = account?.plaid_account_id || account?.plaid_item_id;
  const reg = account?.register_balance;
  if (linked && reg != null && Number.isFinite(Number(reg))) return Number(reg);
  return Number(account?.balance) || 0;
}

export function sumLiquidCash(accounts = []) {
  return roundMoney(
    accounts
      .filter((a) => a && !a.archived && a.archived !== 1 && isLiquidAccount(a))
      .filter((a) => a.on_budget !== 0 && a.on_budget !== '0' && a.on_budget !== false)
      .reduce((s, a) => s + accountBalance(a), 0),
  );
}

function monthKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date) {
  return new Date(date).toLocaleString('en-US', { month: 'short', year: 'numeric' });
}

/** Detect recurring transactions by payee + approximate amount cadence. */
export function detectRecurringTransactions(transactions = [], opts = {}) {
  const minOccurrences = opts.minOccurrences ?? 3;
  const lookbackDays = opts.lookbackDays ?? 400;
  const cutoff = addDays(new Date(), -lookbackDays);
  const groups = new Map();

  for (const tx of transactions) {
    if (!tx || isTransferTx(tx)) continue;
    const d = new Date(tx.date);
    if (Number.isNaN(d.getTime()) || d < cutoff) continue;
    const payee = String(tx.payee || tx.description || '').trim().toLowerCase();
    if (!payee) continue;
    const mag = roundMoney(txMagnitude(tx));
    const bucket = Math.round(mag / 5) * 5;
    const key = `${payee}|${bucket}|${isInflowTx(tx) ? 'in' : 'out'}`;
    if (!groups.has(key)) {
      groups.set(key, { payee: tx.payee || tx.description, amount: mag, inflow: isInflowTx(tx), dates: [], txs: [] });
    }
    const g = groups.get(key);
    g.dates.push(d.getTime());
    g.txs.push(tx);
  }

  const recurring = [];
  for (const g of groups.values()) {
    if (g.dates.length < minOccurrences) continue;
    g.dates.sort((a, b) => a - b);
    const intervals = [];
    for (let i = 1; i < g.dates.length; i++) {
      intervals.push((g.dates[i] - g.dates[i - 1]) / MS_DAY);
    }
    const avgInterval = intervals.reduce((s, v) => s + v, 0) / intervals.length;
    let frequency = 'monthly';
    if (avgInterval <= 10) frequency = 'weekly';
    else if (avgInterval <= 20) frequency = 'biweekly';
    else if (avgInterval <= 45) frequency = 'monthly';
    else if (avgInterval <= 100) frequency = 'quarterly';
    else frequency = 'annual';

    const lastDate = new Date(g.dates[g.dates.length - 1]);
    recurring.push({
      id: `${g.payee}-${g.amount}-${frequency}`,
      payee: g.payee,
      amount: g.amount,
      inflow: g.inflow,
      frequency,
      avgIntervalDays: Math.round(avgInterval),
      occurrences: g.dates.length,
      lastDate: formatIsoDate(lastDate),
      categoryId: g.txs[g.txs.length - 1]?.category_id ?? null,
      confirmed: g.dates.length >= 4,
    });
  }

  return recurring.sort((a, b) => b.amount - a.amount);
}

/** Category spending intelligence from history + budget. */
export function analyzeCategorySpending(transactions = [], categories = []) {
  const byCat = new Map();
  const now = new Date();
  const sixMonthsAgo = addDays(now, -183);

  for (const tx of transactions) {
    if (!tx?.category_id || isTransferTx(tx) || !isOutflowTx(tx)) continue;
    const d = new Date(tx.date);
    if (d < sixMonthsAgo) continue;
    const id = String(tx.category_id);
    if (!byCat.has(id)) {
      byCat.set(id, { monthly: {}, amounts: [] });
    }
    const row = byCat.get(id);
    const mk = monthKey(d);
    row.monthly[mk] = (row.monthly[mk] || 0) + txMagnitude(tx);
    row.amounts.push(txMagnitude(tx));
  }

  return (categories || [])
    .filter((c) => c && !c.archived)
    .map((cat) => {
      const hist = byCat.get(String(cat.id)) || { monthly: {}, amounts: [] };
      const monthlyVals = Object.values(hist.monthly);
      const avg = monthlyVals.length
        ? monthlyVals.reduce((s, v) => s + v, 0) / monthlyVals.length
        : 0;
      const budgeted = Number(cat.assigned) || 0;
      const variance = budgeted > 0 ? avg - budgeted : 0;
      const mean = avg || 1;
      const std =
        monthlyVals.length > 1
          ? Math.sqrt(monthlyVals.reduce((s, v) => s + (v - avg) ** 2, 0) / monthlyVals.length)
          : 0;
      const confidence = Math.min(100, Math.max(20, 100 - (std / mean) * 50 + monthlyVals.length * 8));
      const isAnomaly = hist.amounts.some((a) => a > avg * 3 && avg > 0);
      return {
        categoryId: cat.id,
        name: cat.name,
        budgeted,
        actualAvg: roundMoney(avg),
        variance: roundMoney(variance),
        confidence: roundMoney(confidence),
        available: Number(cat.available) || 0,
        assigned: Number(cat.assigned) || 0,
        activity: Number(cat.activity) || 0,
        targetAmount: Number(cat.target_amount) || 0,
        targetType: cat.target_type || null,
        targetDate: cat.target_date || null,
        hasAnomaly: isAnomaly,
        groupId: cat.groupId ?? cat.group_id,
      };
    });
}

function nextOccurrenceDate(lastIso, frequency, fromDate) {
  const base = lastIso ? new Date(lastIso) : new Date(fromDate);
  const d = new Date(base);
  switch (frequency) {
    case 'weekly':
      d.setDate(d.getDate() + 7);
      break;
    case 'biweekly':
      d.setDate(d.getDate() + 14);
      break;
    case 'quarterly':
      d.setMonth(d.getMonth() + 3);
      break;
    case 'annual':
      d.setFullYear(d.getFullYear() + 1);
      break;
    default:
      d.setMonth(d.getMonth() + 1);
  }
  while (d <= fromDate) {
    switch (frequency) {
      case 'weekly':
        d.setDate(d.getDate() + 7);
        break;
      case 'biweekly':
        d.setDate(d.getDate() + 14);
        break;
      case 'quarterly':
        d.setMonth(d.getMonth() + 3);
        break;
      case 'annual':
        d.setFullYear(d.getFullYear() + 1);
        break;
      default:
        d.setMonth(d.getMonth() + 1);
    }
  }
  return d;
}

function buildScheduledEvents(recurring, horizonDays, mode, categoryAnalysis, recurringOverrides = {}) {
  const events = [];
  const modeCfg = FORECAST_MODES[mode] || FORECAST_MODES.expected;
  const today = startOfDay(new Date());
  const end = addDays(today, horizonDays);
  const catMap = new Map((categoryAnalysis || []).map((c) => [String(c.categoryId), c]));

  for (const r of recurring) {
    const override = recurringOverrides[r.id] || {};
    let cursor = nextOccurrenceDate(r.lastDate, override.frequency || r.frequency, today);
    let guard = 0;
    while (cursor <= end && guard < 500) {
      guard += 1;
      let amount = override.amount != null ? Number(override.amount) : r.amount;
      if (r.inflow) amount *= modeCfg.incomeFactor;
      else {
        amount *= modeCfg.expenseFactor;
        const cat = catMap.get(String(r.categoryId));
        if (cat && cat.budgeted <= 0) amount *= modeCfg.discretionaryFactor;
      }
      events.push({
        date: formatIsoDate(cursor),
        payee: r.payee,
        amount: roundMoney(r.inflow ? amount : -amount),
        type: r.inflow ? 'income' : 'bill',
        recurring: true,
        frequency: override.frequency || r.frequency,
        source: r.source || 'detected',
        recurringId: r.id,
      });
      cursor = nextOccurrenceDate(formatIsoDate(cursor), override.frequency || r.frequency, cursor);
    }
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/** Map DB scheduled_transactions rows into forecast events within horizon. */
export function mapDbScheduledEvents(rows = [], horizonDays = 365) {
  const today = startOfDay(new Date());
  const end = addDays(today, horizonDays);
  const events = [];
  for (const row of rows || []) {
    if (!row?.date || String(row.status || 'pending') !== 'pending') continue;
    const d = startOfDay(new Date(row.date));
    if (Number.isNaN(d.getTime()) || d < today || d > end) continue;
    const mag = roundMoney(Math.abs(Number(row.amount) || 0));
    const inflow = String(row.transaction_type || '').toLowerCase() === 'inflow';
    events.push({
      date: formatIsoDate(d),
      payee: row.payee || 'Scheduled',
      amount: roundMoney(inflow ? mag : -mag),
      type: inflow ? 'income' : 'bill',
      recurring: false,
      source: 'scheduled_db',
      scheduledId: row.id,
      categoryId: row.category_id || null,
    });
  }
  return events;
}

function mergeScheduledEvents(recurringEvents, dbEvents) {
  const byKey = new Map();
  for (const e of [...recurringEvents, ...dbEvents]) {
    const key = `${e.date}|${String(e.payee).toLowerCase()}|${e.amount}`;
    if (!byKey.has(key)) byKey.set(key, e);
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function dailyDiscretionarySpend(categoryAnalysis, mode) {
  const modeCfg = FORECAST_MODES[mode] || FORECAST_MODES.expected;
  const monthly =
    categoryAnalysis.reduce((s, c) => {
      const base = c.actualAvg > 0 ? c.actualAvg : c.budgeted;
      return s + Math.max(0, base);
    }, 0) / Math.max(1, categoryAnalysis.length) *
    Math.max(1, categoryAnalysis.filter((c) => (c.actualAvg || c.budgeted) > 0).length);

  const adjusted = monthly * modeCfg.expenseFactor * modeCfg.discretionaryFactor;
  return roundMoney(adjusted / 30.44);
}

/** Core daily forecast series. */
export function buildDailyForecast(input) {
  const {
    accounts = [],
    transactions = [],
    categories = [],
    horizonDays = 365,
    mode = 'expected',
    cashThreshold = 500,
    scenarioAdjustments = {},
  } = input;

  const modeCfg = FORECAST_MODES[mode] || FORECAST_MODES.expected;
  const today = startOfDay(new Date());
  const recurring = detectRecurringTransactions(transactions)
    .filter((r) => !(input.ignoredRecurringIds || []).includes(r.id))
    .map((r) => ({ ...r, source: 'detected' }));
  const categoryAnalysis = analyzeCategorySpending(transactions, categories);
  const recurringOverrides = input.recurringOverrides || {};
  const recurringEvents = buildScheduledEvents(
    recurring,
    horizonDays,
    mode,
    categoryAnalysis,
    recurringOverrides,
  );
  const dbEvents = mapDbScheduledEvents(input.scheduledTransactions || [], horizonDays);
  const scheduled = mergeScheduledEvents(recurringEvents, dbEvents);
  const eventsByDate = new Map();
  for (const e of scheduled) {
    if (!eventsByDate.has(e.date)) eventsByDate.set(e.date, []);
    eventsByDate.get(e.date).push(e);
  }

  let startingCash = sumLiquidCash(accounts);
  if (input.accountId && input.accountId !== 'all') {
    const acct = accounts.find((a) => String(a.id) === String(input.accountId));
    if (acct) startingCash = roundMoney(accountBalance(acct));
  }
  let balance = startingCash;
  const daily = [];
  const historical = [];
  const histCutoff = addDays(today, -Math.min(90, Math.floor(horizonDays / 2)));

  let histBalance = startingCash;
  const pastTx = transactions
    .filter((t) => {
      const d = new Date(t.date);
      return d >= histCutoff && d <= today && !isTransferTx(t);
    })
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));

  for (let i = 0; histCutoff <= addDays(today, -1); ) {
    /* built below in loop */
    break;
  }

  for (let d = new Date(histCutoff); d <= today; d = addDays(d, 1)) {
    const iso = formatIsoDate(d);
    const dayTx = pastTx.filter((t) => formatIsoDate(t.date) === iso);
    const net = dayTx.reduce((s, t) => s + signedTxAmount(t), 0);
    histBalance = roundMoney(histBalance + net);
    historical.push({ date: iso, balance: histBalance, actual: true, net });
  }

  const incomeAdj = Number(scenarioAdjustments.monthlyIncomeDelta) || 0;
  const expenseAdj = Number(scenarioAdjustments.monthlyExpenseDelta) || 0;
  const dailyIncomeAdj = incomeAdj / 30.44;
  const dailyExpenseAdj = expenseAdj / 30.44;
  const discDaily = dailyDiscretionarySpend(categoryAnalysis, mode);

  let lowPoint = { balance: startingCash, date: formatIsoDate(today) };
  let highPoint = { balance: startingCash, date: formatIsoDate(today) };

  for (let i = 0; i <= horizonDays; i++) {
    const d = addDays(today, i);
    const iso = formatIsoDate(d);
    const dayEvents = eventsByDate.get(iso) || [];
    let inflows = 0;
    let outflows = 0;

    for (const e of dayEvents) {
      if (e.amount > 0) inflows += e.amount;
      else outflows += Math.abs(e.amount);
    }

    if (i > 0) outflows += discDaily;
    inflows += dailyIncomeAdj;
    outflows += dailyExpenseAdj;

    const net = roundMoney(inflows - outflows);
    balance = roundMoney(balance + net);

    if (balance < lowPoint.balance) lowPoint = { balance, date: iso };
    if (balance > highPoint.balance) highPoint = { balance, date: iso };

    const band = roundMoney(Math.max(50, Math.abs(net) * 0.15 + discDaily * 0.5));

    daily.push({
      date: iso,
      balance,
      inflows: roundMoney(inflows),
      outflows: roundMoney(outflows),
      net,
      confidenceLow: roundMoney(balance - band),
      confidenceHigh: roundMoney(balance + band),
      events: dayEvents,
      projected: i > 0,
    });
  }

  const runwayDays = computeCashRunwayDays(daily, cashThreshold);
  const healthScore = computeHealthScore({
    startingCash,
    daily,
    categoryAnalysis,
    accounts,
    categories,
  });

  return {
    mode,
    horizonDays,
    startingCash,
    daily,
    historical,
    recurring,
    categoryAnalysis,
    scheduled,
    summary: {
      lowPoint,
      highPoint,
      endingCash: daily[daily.length - 1]?.balance ?? startingCash,
      runwayDays,
      healthScore,
    },
  };
}

export function computeCashRunwayDays(dailySeries, threshold = 0) {
  for (let i = 0; i < dailySeries.length; i++) {
    if (dailySeries[i].balance <= threshold) return i;
  }
  return dailySeries.length;
}

export function computeHealthScore({ startingCash, daily, categoryAnalysis, accounts, categories }) {
  let score = 50;
  const liquid = startingCash;
  const monthlyBurn =
    categoryAnalysis.reduce((s, c) => s + (c.actualAvg || c.budgeted), 0) || 1;
  const monthsReserve = liquid / monthlyBurn;
  if (monthsReserve >= 6) score += 20;
  else if (monthsReserve >= 3) score += 12;
  else if (monthsReserve >= 1) score += 5;
  else score -= 10;

  const overspent = (categories || []).filter((c) => (Number(c.available) || 0) < 0).length;
  score -= Math.min(20, overspent * 4);

  const debtBal = (accounts || [])
    .filter(isDebtAccount)
    .reduce((s, a) => s + Math.abs(Math.min(0, accountBalance(a))), 0);
  if (debtBal > 0 && liquid > 0) {
    const ratio = debtBal / liquid;
    if (ratio > 2) score -= 15;
    else if (ratio > 1) score -= 8;
  }

  const minFuture = Math.min(...(daily || []).map((d) => d.balance));
  if (minFuture < 0) score -= 25;
  else if (minFuture < 500) score -= 10;

  const avgConf =
    categoryAnalysis.length > 0
      ? categoryAnalysis.reduce((s, c) => s + c.confidence, 0) / categoryAnalysis.length
      : 50;
  score += (avgConf - 50) * 0.2;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function buildMonthlySummaries(dailySeries) {
  const byMonth = new Map();
  for (const day of dailySeries) {
    const mk = day.date.slice(0, 7);
    if (!byMonth.has(mk)) {
      byMonth.set(mk, {
        monthKey: mk,
        label: monthLabel(`${mk}-01`),
        start: day.balance,
        end: day.balance,
        inflow: 0,
        outflow: 0,
        days: [],
      });
    }
    const m = byMonth.get(mk);
    if (m.days.length === 0) m.start = day.balance;
    m.end = day.balance;
    m.inflow += day.inflows || 0;
    m.outflow += day.outflows || 0;
    m.days.push(day);
  }

  return [...byMonth.values()].map((m) => ({
    monthKey: m.monthKey,
    label: m.label,
    start: roundMoney(m.start),
    inflow: roundMoney(m.inflow),
    outflow: roundMoney(m.outflow),
    net: roundMoney(m.inflow - m.outflow),
    end: roundMoney(m.end),
    status: m.end < 0 ? 'critical' : m.end < 500 ? 'warning' : 'healthy',
    trend: m.net >= 0 ? 'up' : 'down',
  }));
}

export function buildWaterfall(monthlyRow) {
  if (!monthlyRow) return null;
  return {
    starting: monthlyRow.start,
    income: monthlyRow.inflow,
    transfersIn: 0,
    bills: roundMoney(monthlyRow.outflow * 0.55),
    spending: roundMoney(monthlyRow.outflow * 0.45),
    debtPayments: 0,
    ending: monthlyRow.end,
  };
}

function periodKey(date, period) {
  const d = new Date(`${date}T12:00:00`);
  if (period === 'yearly') return String(d.getFullYear());
  if (period === 'quarterly') return `${d.getFullYear()}-Q${Math.floor(d.getMonth() / 3) + 1}`;
  return date.slice(0, 7);
}

function periodLabel(key, period) {
  if (period === 'yearly') return key;
  if (period === 'quarterly') return key.replace('-Q', ' Q');
  return monthLabel(`${key}-01`);
}

/** Aggregate daily forecast into monthly, quarterly, or yearly waterfall rows. */
export function buildWaterfallForPeriod(dailySeries = [], period = 'monthly') {
  const buckets = new Map();
  for (const day of dailySeries) {
    const key = periodKey(day.date, period);
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        label: periodLabel(key, period),
        start: day.balance,
        end: day.balance,
        inflow: 0,
        outflow: 0,
        days: [],
      });
    }
    const b = buckets.get(key);
    if (b.days.length === 0) b.start = day.balance;
    b.end = day.balance;
    b.inflow += day.inflows || 0;
    b.outflow += day.outflows || 0;
    b.days.push(day);
  }
  return [...buckets.values()].map((b) => ({
    ...buildWaterfall({
      start: roundMoney(b.start),
      inflow: roundMoney(b.inflow),
      outflow: roundMoney(b.outflow),
      end: roundMoney(b.end),
    }),
    label: b.label,
    key: b.key,
    net: roundMoney(b.inflow - b.outflow),
  }));
}

export function buildAccountForecasts(accounts = [], dailySeries = [], debtPayments = {}) {
  const totalLiquid = sumLiquidCash(accounts.filter(isLiquidAccount));
  const endBalance = dailySeries[dailySeries.length - 1]?.balance ?? totalLiquid;

  return (accounts || [])
    .filter((a) => a && !a.archived && a.archived !== 1)
    .map((account) => {
      const bal = accountBalance(account);
      const type = String(account.type || '').toLowerCase();
      const share = totalLiquid > 0 && isLiquidAccount(account) ? bal / totalLiquid : 0;
      const projectedMin = roundMoney(endBalance * share * 0.85);
      const projectedMax = roundMoney(endBalance * share * 1.05);
      const isCredit = type === 'credit';
      const debt = isCredit ? Math.max(0, -bal) : 0;
      const minPay = debtPayments[account.id] || account.minimum_payment || Math.max(25, debt * 0.02);

      let risk = 'low';
      if (isLiquidAccount(account) && projectedMin < (account.minimum_balance || 500)) risk = 'high';
      else if (isLiquidAccount(account) && projectedMin < 1000) risk = 'medium';
      if (isCredit && debt > 0) risk = debt > 5000 ? 'high' : 'medium';

      return {
        id: account.id,
        name: account.name,
        type,
        currentBalance: roundMoney(bal),
        projectedMin: isLiquidAccount(account) ? projectedMin : null,
        projectedMax: isLiquidAccount(account) ? projectedMax : null,
        projectedBalance: isCredit ? roundMoney(debt * 1.02) : roundMoney(bal + (endBalance - totalLiquid) * share),
        risk,
        minimumPayment: isCredit || type === 'loan' ? minPay : null,
        payoffMonths: isCredit && minPay > 0 ? Math.ceil(debt / minPay) : null,
      };
    });
}

export function detectRisks(forecast, input = {}) {
  const risks = [];
  const threshold = Number(input.cashThreshold) || 500;
  const { daily, categoryAnalysis, summary } = forecast;
  const assignedTotal = (input.categories || []).reduce((s, c) => s + (Number(c.assigned) || 0), 0);
  const monthlyIncome = (forecast.recurring || [])
    .filter((r) => r.inflow)
    .reduce((s, r) => {
      const mult = r.frequency === 'weekly' ? 4.33 : r.frequency === 'biweekly' ? 2.17 : 1;
      return s + r.amount * mult;
    }, 0);

  for (const day of daily) {
    if (day.balance < 0) {
      risks.push({
        type: 'negative_balance',
        severity: 'critical',
        date: day.date,
        amount: day.balance,
        message: `Projected balance drops to ${day.balance.toFixed(2)} on ${day.date}.`,
        cause: day.events?.[0]?.payee || 'Combined outflows exceed inflows',
      });
      break;
    }
  }

  for (const day of daily) {
    if (day.balance < threshold && day.balance >= 0) {
      risks.push({
        type: 'low_cash',
        severity: 'warning',
        date: day.date,
        amount: day.balance,
        message: `Balance may fall below your ${threshold} threshold on ${day.date}.`,
        cause: 'Upcoming bills and spending',
      });
      break;
    }
  }

  if (monthlyIncome > 0 && assignedTotal > monthlyIncome * 1.1) {
    risks.push({
      type: 'budget_deficit',
      severity: 'warning',
      message: 'Total assigned exceeds expected monthly income.',
      cause: `Assigned ${roundMoney(assignedTotal)} vs ~${roundMoney(monthlyIncome)} income`,
    });
  }

  for (const cat of categoryAnalysis) {
    if (cat.targetAmount > 0 && cat.targetDate) {
      const target = new Date(cat.targetDate);
      const need = Math.max(0, cat.targetAmount - cat.available);
      if (need > 0 && target > new Date()) {
        const monthsLeft = Math.max(1, (target - new Date()) / (MS_DAY * 30.44));
        const required = need / monthsLeft;
        if (required > cat.assigned * 1.5 && need > 100) {
          risks.push({
            type: 'goal_funding',
            severity: 'medium',
            message: `${cat.name} may miss target by ${roundMoney(need)}.`,
            cause: `Need ~${roundMoney(required)}/mo; currently assigned ${roundMoney(cat.assigned)}`,
          });
        }
      }
    }
  }

  if (summary?.lowPoint?.balance < threshold) {
    risks.push({
      type: 'low_point',
      severity: summary.lowPoint.balance < 0 ? 'critical' : 'warning',
      date: summary.lowPoint.date,
      amount: summary.lowPoint.balance,
      message: `Lowest projected balance: ${roundMoney(summary.lowPoint.balance)} on ${summary.lowPoint.date}.`,
    });
  }

  for (const account of input.accounts || []) {
    if (!isDebtAccount(account)) continue;
    const bal = accountBalance(account);
    const debt = Math.max(0, -bal);
    if (debt <= 0) continue;
    const minPay = account.minimum_payment || Math.max(25, debt * 0.02);
    const apr = Number(account.apr || account.interest_rate || 0);
    if (apr > 18) {
      risks.push({
        type: 'credit_interest',
        severity: 'warning',
        message: `${account.name} carries ${roundMoney(debt)} at ~${apr}% APR.`,
        cause: 'High interest may slow payoff — consider extra payments.',
      });
    }
    if (minPay > 0 && debt / minPay > 60) {
      risks.push({
        type: 'credit_payoff',
        severity: 'medium',
        message: `${account.name} payoff exceeds 5 years at minimum payment.`,
        cause: `Balance ${formatCurrencyShort(debt)} vs min payment ${formatCurrencyShort(minPay)}`,
      });
    }
  }

  return risks;
}

function formatCurrencyShort(n) {
  return `$${roundMoney(n).toLocaleString('en-US')}`;
}

export function generateInsights(forecast, categories = []) {
  const insights = [];
  const { categoryAnalysis, recurring, summary, startingCash } = forecast;

  for (const cat of categoryAnalysis) {
    if (cat.available > 50 && cat.assigned > 0 && cat.activity < cat.assigned * 0.5) {
      const unused = roundMoney(cat.assigned - cat.activity);
      if (unused >= 50) {
        insights.push({
          type: 'surplus',
          title: `Unused funds in ${cat.name}`,
          body: `You consistently leave ~${unused}/month unspent in ${cat.name}.`,
          action: 'Move money to savings or another goal.',
        });
      }
    }
    if (cat.variance > 50 && cat.budgeted > 0) {
      insights.push({
        type: 'trend',
        title: `${cat.name} trending over budget`,
        body: `Average spending exceeds assigned by ${roundMoney(cat.variance)}/month.`,
        action: 'Review transactions or increase the category assignment.',
      });
    }
  }

  const idleThreshold = startingCash * 0.25;
  if (startingCash > 5000 && summary.runwayDays > 180) {
    insights.push({
      type: 'idle_cash',
      title: 'Idle cash opportunity',
      body: `$${roundMoney(startingCash)} on hand with ${summary.runwayDays}+ days runway.`,
      action: 'Consider transferring excess to savings or debt payoff.',
    });
  }

  const bigBills = (recurring || []).filter((r) => !r.inflow && r.amount > 200);
  if (bigBills.length) {
    insights.push({
      type: 'bills',
      title: `${bigBills.length} major recurring bills detected`,
      body: bigBills.slice(0, 3).map((b) => b.payee).join(', '),
      action: 'Confirm amounts in the Recurring center.',
    });
  }

  for (const cat of categories) {
    const target = Number(cat.target_amount) || 0;
    const avail = Number(cat.available) || 0;
    if (target > 0 && avail < target * 0.5 && target - avail >= 200) {
      insights.push({
        type: 'goal_gap',
        title: `${cat.name} funding gap`,
        body: `Projected shortfall of ${roundMoney(target - avail)} toward your goal.`,
        action: 'Create a monthly funding plan.',
      });
    }
  }

  return insights.slice(0, 8);
}

export function buildGoalForecasts(categories = []) {
  return (categories || [])
    .filter((c) => !c.archived && Number(c.target_amount) > 0)
    .map((cat) => {
      const target = Number(cat.target_amount);
      const current = Number(cat.available) || 0;
      const remaining = Math.max(0, target - current);
      const assigned = Number(cat.assigned) || 0;
      const monthsToComplete = assigned > 0 ? Math.ceil(remaining / assigned) : null;
      const completionDate =
        monthsToComplete != null
          ? formatIsoDate(addDays(new Date(), monthsToComplete * 30))
          : null;
      return {
        id: cat.id,
        name: cat.name,
        target,
        current,
        remaining,
        assigned,
        monthsToComplete,
        completionDate,
        onTrack: remaining <= 0 || (monthsToComplete != null && monthsToComplete <= 12),
        requiredMonthly: remaining > 0 && cat.target_date
          ? remaining /
            Math.max(
              1,
              (new Date(cat.target_date) - new Date()) / (MS_DAY * 30.44),
            )
          : null,
      };
    });
}

export function buildScenarioComparison(baseForecast, scenarioForecast) {
  const baseEnd = baseForecast.daily[baseForecast.daily.length - 1]?.balance ?? 0;
  const scenEnd = scenarioForecast.daily[scenarioForecast.daily.length - 1]?.balance ?? 0;
  return {
    baseEnding: roundMoney(baseEnd),
    scenarioEnding: roundMoney(scenEnd),
    delta: roundMoney(scenEnd - baseEnd),
    baseLow: baseForecast.summary.lowPoint,
    scenarioLow: scenarioForecast.summary.lowPoint,
    baseRunway: baseForecast.summary.runwayDays,
    scenarioRunway: scenarioForecast.summary.runwayDays,
  };
}

export function buildCalendarEvents(dailySeries, limit = 60) {
  const events = [];
  for (const day of dailySeries) {
    for (const e of day.events || []) {
      events.push({
        ...e,
        date: day.date,
        balanceAfter: day.balance,
        tone: e.amount > 0 ? 'inflow' : 'outflow',
      });
    }
    if (day.balance < 500 && day.projected) {
      events.push({
        date: day.date,
        payee: 'Low balance warning',
        amount: day.balance,
        type: 'alert',
        tone: 'warning',
        balanceAfter: day.balance,
      });
    }
  }
  return events.slice(0, limit);
}

export function exportForecastCsv(monthlySummaries) {
  const header = 'Month,Start,Inflow,Outflow,Net,End,Status';
  const rows = monthlySummaries.map(
    (m) =>
      `${m.label},${m.start},${m.inflow},${m.outflow},${m.net},${m.end},${m.status}`,
  );
  return [header, ...rows].join('\n');
}

/** Compare stored forecast snapshots to actual balances for accuracy tracking. */
export function computeForecastAccuracy(snapshots = [], actualBalanceToday) {
  if (!snapshots.length) {
    return { overall: null, trend: [], samples: 0 };
  }
  const today = formatIsoDate(new Date());
  const scored = [];
  for (const snap of snapshots) {
    if (!snap.targetDate || snap.targetDate > today) continue;
    const projected = Number(snap.projectedBalance);
    const actual = Number(snap.actualBalance ?? actualBalanceToday);
    if (!Number.isFinite(projected) || !Number.isFinite(actual)) continue;
    const err = Math.abs(actual - projected);
    const denom = Math.max(100, Math.abs(actual));
    const pct = Math.max(0, Math.min(100, 100 - (err / denom) * 100));
    scored.push({
      recordedAt: snap.recordedAt,
      targetDate: snap.targetDate,
      projected,
      actual,
      accuracyPct: roundMoney(pct),
    });
  }
  const overall =
    scored.length > 0
      ? roundMoney(scored.reduce((s, r) => s + r.accuracyPct, 0) / scored.length)
      : null;
  const byMonth = new Map();
  for (const row of scored) {
    const mk = row.targetDate.slice(0, 7);
    if (!byMonth.has(mk)) byMonth.set(mk, []);
    byMonth.get(mk).push(row.accuracyPct);
  }
  const trend = [...byMonth.entries()]
    .map(([month, vals]) => ({
      month,
      accuracyPct: roundMoney(vals.reduce((s, v) => s + v, 0) / vals.length),
    }))
    .sort((a, b) => a.month.localeCompare(b.month))
    .slice(-12);
  return { overall, trend, samples: scored.length };
}

export function buildForecastSnapshot(forecast, horizonDays) {
  const today = formatIsoDate(new Date());
  const weekOut = formatIsoDate(addDays(new Date(), 7));
  const day7 = forecast.daily.find((d) => d.date === weekOut);
  return {
    recordedAt: today,
    targetDate: weekOut,
    projectedBalance: day7?.balance ?? forecast.summary.endingCash,
    horizonDays,
    mode: forecast.mode,
  };
}

export function enrichDailyWithMarkers(daily = [], scheduled = []) {
  const eventDates = new Set((scheduled || []).map((e) => e.date));
  return daily.map((d) => {
    const events = d.events || [];
    const markers = [];
    if (events.some((e) => e.type === 'income')) markers.push('payday');
    if (events.some((e) => e.type === 'bill')) markers.push('bill');
    if (events.some((e) => e.type === 'transfer')) markers.push('transfer');
    if (d.balance < 500 && d.projected) markers.push('alert');
    return { ...d, markers, hasEvent: eventDates.has(d.date) };
  });
}

/** Full pipeline for the Cash Forecast page. */
export function runCashForecast(input) {
  const horizonDays = input.horizonDays ?? 365;
  const mode = input.mode ?? 'expected';
  const forecastRaw = buildDailyForecast({ ...input, horizonDays, mode });
  const forecast = {
    ...forecastRaw,
    daily: enrichDailyWithMarkers(forecastRaw.daily, forecastRaw.scheduled),
  };
  const monthly = buildMonthlySummaries(forecast.daily);
  const waterfallPeriods = {
    monthly: buildWaterfallForPeriod(forecast.daily, 'monthly'),
    quarterly: buildWaterfallForPeriod(forecast.daily, 'quarterly'),
    yearly: buildWaterfallForPeriod(forecast.daily, 'yearly'),
  };
  const accounts = buildAccountForecasts(
    input.accounts,
    forecast.daily,
    input.debtPayments || {},
  );
  const risks = detectRisks(forecast, input);
  const insights = generateInsights(forecast, input.categories);
  const goals = buildGoalForecasts(input.categories);
  const calendar = buildCalendarEvents(forecast.daily);
  const waterfall = buildWaterfall(monthly[monthly.length - 1] || monthly[0]);

  return {
    forecast,
    monthly,
    accounts,
    risks,
    insights,
    goals,
    calendar,
    waterfall,
    waterfallPeriods,
    generatedAt: new Date().toISOString(),
  };
}
