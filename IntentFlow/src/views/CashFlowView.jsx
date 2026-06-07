/**
 * Personal Cash Forecast — flagship planning dashboard.
 * Uses budget months, accounts, transactions, and detected recurring patterns.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import PM from '../constants/pmTheme.jsx';
import useRealtimeUpdates from '../hooks/useRealtimeUpdates';
import useCashForecastData from '../hooks/useCashForecastData.jsx';
import ForecastChart from '../components/cashForecast/ForecastChart.jsx';
import {
  FORECAST_HORIZONS,
  FORECAST_MODES,
  buildDailyForecast,
  buildScenarioComparison,
  buildForecastSnapshot,
  computeForecastAccuracy,
  exportForecastCsv,
  formatIsoDate,
  resolveHorizonDays,
  roundMoney,
  runCashForecast,
} from '../shared/cashForecastEngine.mjs';
import {
  buildSharePayload,
  buildShareUrl,
  exportForecastPdf,
  exportSvgAsPng,
} from '../shared/cashForecastExport.mjs';
import {
  appendForecastSnapshot,
  loadForecastSnapshots,
} from '../shared/cashForecastPrefs.mjs';
import {
  fetchForecastShare,
  fetchRecurringPrefs,
  persistForecastShare,
  persistRecurringPref,
  syncRecurringPrefsToLocal,
} from '../shared/cashForecastApi.mjs';

const REFRESH_EVENTS = [
  'transaction:added',
  'transaction:updated',
  'transaction:deleted',
  'prosperity:updated',
  'budget:assigned',
  'budget:bulkAssigned',
  'accounts-updated',
];

function formatCurrency(amount, compact = false) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 0 : 2,
  }).format(Number(amount) || 0);
}

function statusColor(status) {
  if (status === 'critical') return '#F87171';
  if (status === 'warning') return '#FBBF24';
  return '#4ADE80';
}

function riskSeverityColor(severity) {
  if (severity === 'critical') return '#F87171';
  if (severity === 'warning') return '#FBBF24';
  return '#93C5FD';
}

const TABS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'scenarios', label: 'Scenarios' },
  { id: 'recurring', label: 'Recurring' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'goals', label: 'Goals' },
];

const CashFlowView = ({
  budgetData: budgetDataProp = { categories: [] },
  transactions: transactionsProp = [],
  accounts: accountsProp = [],
  creditCards: creditCardsProp = [],
  loans: loansProp = [],
  userId: userIdProp = null,
  shareId: shareIdProp = null,
}) => {
  const router = useRouter();
  const shareIdFromUrl = typeof router.query?.share === 'string' ? router.query.share : null;
  const shareId = shareIdProp || shareIdFromUrl;

  const loaded = useCashForecastData();
  const userId = userIdProp || loaded.userId;
  const accounts = accountsProp?.length ? accountsProp : loaded.accounts;
  const creditCards = creditCardsProp?.length ? creditCardsProp : loaded.creditCards;
  const loans = loansProp?.length ? loansProp : loaded.loans;
  const transactions = transactionsProp?.length ? transactionsProp : loaded.transactions;
  const scheduledTransactions = loaded.scheduledTransactions || [];
  const budgetData =
    budgetDataProp?.categories?.length > 0 ? budgetDataProp : loaded.budgetData;
  const chartRef = useRef(null);
  const [horizonId, setHorizonId] = useState('12m');
  const [customRange, setCustomRange] = useState({ start: '', end: '' });
  const [mode, setMode] = useState('expected');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [cashThreshold, setCashThreshold] = useState(500);
  const [accountFilter, setAccountFilter] = useState('all');
  const [waterfallPeriod, setWaterfallPeriod] = useState('monthly');
  const [selectedMonthKey, setSelectedMonthKey] = useState(null);
  const [drillDay, setDrillDay] = useState(null);
  const [scenario, setScenario] = useState({
    monthlyIncomeDelta: 0,
    monthlyExpenseDelta: 0,
    label: 'Custom scenario',
  });
  const [ignoredRecurring, setIgnoredRecurring] = useState(() => new Set());
  const [confirmedRecurring, setConfirmedRecurring] = useState(() => new Set());
  const [recurringOverrides, setRecurringOverrides] = useState({});
  const [editingRecurring, setEditingRecurring] = useState(null);
  const [showMobileExtras, setShowMobileExtras] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [shareBanner, setShareBanner] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const prefs = await fetchRecurringPrefs(userId);
      if (cancelled) return;
      setIgnoredRecurring(new Set(prefs.ignoredRecurring || []));
      setConfirmedRecurring(new Set(prefs.confirmedRecurring || []));
      setRecurringOverrides(prefs.customOverrides || {});
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const syncPrefsLocal = useCallback(() => {
    syncRecurringPrefsToLocal(userId, {
      ignoredRecurring: [...ignoredRecurring],
      confirmedRecurring: [...confirmedRecurring],
      customOverrides: recurringOverrides,
    });
  }, [userId, ignoredRecurring, confirmedRecurring, recurringOverrides]);

  useEffect(() => {
    syncPrefsLocal();
  }, [syncPrefsLocal]);

  const setRecurringStatus = useCallback(
    async (recurringId, status, override = null) => {
      if (status === 'ignored') {
        setIgnoredRecurring((prev) => new Set(prev).add(recurringId));
        setConfirmedRecurring((prev) => {
          const next = new Set(prev);
          next.delete(recurringId);
          return next;
        });
      } else if (status === 'confirmed') {
        setConfirmedRecurring((prev) => new Set(prev).add(recurringId));
        setIgnoredRecurring((prev) => {
          const next = new Set(prev);
          next.delete(recurringId);
          return next;
        });
      }
      if (override) {
        setRecurringOverrides((prev) => ({ ...prev, [recurringId]: override }));
      }
      await persistRecurringPref(recurringId, status, override);
      setRefreshKey((k) => k + 1);
    },
    [],
  );

  useEffect(() => {
    if (!shareId) return;
    let cancelled = false;
    (async () => {
      const payload = await fetchForecastShare(shareId);
      if (!cancelled && payload) setShareBanner(payload);
    })();
    return () => {
      cancelled = true;
    };
  }, [shareId]);

  const categories = budgetData?.categories || [];
  const horizonDays = useMemo(
    () => resolveHorizonDays(horizonId, customRange),
    [horizonId, customRange],
  );
  const horizonLabel = useMemo(() => {
    if (horizonId === 'custom' && customRange.start && customRange.end) {
      return `${customRange.start} → ${customRange.end}`;
    }
    return FORECAST_HORIZONS.find((h) => h.id === horizonId)?.label ?? '12 Months';
  }, [horizonId, customRange]);

  const filteredTransactions = useMemo(() => {
    if (accountFilter === 'all') return transactions;
    return transactions.filter((t) => String(t.account_id) === String(accountFilter));
  }, [transactions, accountFilter]);

  const forecastInput = useMemo(
    () => ({
      accounts: [...(accounts || []), ...(creditCards || []), ...(loans || [])],
      transactions: filteredTransactions,
      categories,
      horizonDays,
      mode,
      cashThreshold,
      accountId: accountFilter,
      ignoredRecurringIds: [...ignoredRecurring],
      recurringOverrides,
      scheduledTransactions,
    }),
    [
      accounts,
      creditCards,
      loans,
      filteredTransactions,
      categories,
      horizonDays,
      mode,
      cashThreshold,
      accountFilter,
      ignoredRecurring,
      recurringOverrides,
      scheduledTransactions,
    ],
  );

  const result = useMemo(() => {
    void refreshKey;
    if (shareBanner) {
      return {
        forecast: {
          mode: shareBanner.mode,
          horizonDays: shareBanner.horizonDays || horizonDays,
          startingCash: shareBanner.startingCash,
          daily: [],
          historical: [],
          summary: shareBanner.summary,
          recurring: [],
          categoryAnalysis: [],
        },
        monthly: shareBanner.monthly || [],
        accounts: [],
        risks: shareBanner.risks || [],
        insights: shareBanner.insights || [],
        goals: shareBanner.goals || [],
        calendar: [],
        waterfall: null,
        waterfallPeriods: { monthly: [], quarterly: [], yearly: [] },
        generatedAt: shareBanner.generatedAt,
        isSharedView: true,
      };
    }
    return runCashForecast(forecastInput);
  }, [forecastInput, refreshKey, shareBanner, horizonDays]);

  useEffect(() => {
    if (shareBanner) return;
    const today = formatIsoDate(new Date());
    const lastKey = `intentflow.cashForecast.lastSnapshot.${userId}`;
    try {
      if (localStorage.getItem(lastKey) === today) return;
      const snap = buildForecastSnapshot(result.forecast, horizonDays);
      appendForecastSnapshot(userId, snap);
      localStorage.setItem(lastKey, today);
    } catch {
      /* ignore */
    }

    const actual =
      result.forecast.historical?.slice(-1)?.[0]?.balance ?? result.forecast.startingCash;
    const snapshots = loadForecastSnapshots(userId);
    let changed = false;
    const updated = snapshots.map((s) => {
      if (s.targetDate <= today && s.actualBalance == null) {
        changed = true;
        return { ...s, actualBalance: actual };
      }
      return s;
    });
    if (changed) {
      try {
        localStorage.setItem(`intentflow.cashForecast.snapshots.${userId}`, JSON.stringify(updated));
      } catch {
        /* ignore */
      }
    }
  }, [result.forecast, horizonDays, userId, shareBanner]);

  const accuracy = useMemo(() => {
    const actual =
      result.forecast.historical?.slice(-1)?.[0]?.balance ?? result.forecast.startingCash;
    return computeForecastAccuracy(loadForecastSnapshots(userId), actual);
  }, [result.forecast, userId, refreshKey]);

  const scenarioResult = useMemo(() => {
    if (activeTab !== 'scenarios' && scenario.monthlyIncomeDelta === 0 && scenario.monthlyExpenseDelta === 0) {
      return null;
    }
    const scenForecast = buildDailyForecast({
      ...forecastInput,
      scenarioAdjustments: scenario,
    });
    return buildScenarioComparison(result.forecast, scenForecast);
  }, [forecastInput, scenario, result.forecast, activeTab]);

  useRealtimeUpdates(REFRESH_EVENTS, () => {
    setRefreshKey((k) => k + 1);
  });

  const onExportCsv = useCallback(() => {
    const csv = exportForecastCsv(result.monthly);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `cash-forecast-${formatIsoDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [result.monthly]);

  const onExportPdf = useCallback(() => {
    exportForecastPdf(result, { mode, horizonLabel, generatedAt: result.generatedAt });
  }, [result, mode, horizonLabel]);

  const onExportPng = useCallback(() => {
    if (chartRef.current?.exportPng) {
      chartRef.current.exportPng(`cash-forecast-${formatIsoDate(new Date())}.png`);
      return;
    }
    const svg = document.querySelector('[data-cash-forecast-chart] svg');
    exportSvgAsPng(svg, `cash-forecast-${formatIsoDate(new Date())}.png`);
  }, []);

  const onShareLink = useCallback(async () => {
    const payload = buildSharePayload(result, { mode, horizonLabel });
    const id = await persistForecastShare(payload);
    if (!id) return;
    const url = buildShareUrl(id);
    navigator.clipboard?.writeText(url).catch(() => {});
    setCopyFeedback('Share link copied — snapshot stored in your database');
    setTimeout(() => setCopyFeedback(''), 4000);
  }, [result, mode, horizonLabel]);

  const { forecast, monthly, accounts: accountForecasts, risks, insights, goals, calendar, waterfallPeriods } =
    result;
  const summary = forecast.summary;
  const selectedMonth = monthly.find((m) => m.monthKey === selectedMonthKey) || monthly[0];
  const periodWaterfalls = waterfallPeriods || { monthly: [], quarterly: [], yearly: [] };
  const activeWaterfallRow =
    periodWaterfalls[waterfallPeriod]?.[0] ||
    (selectedMonth
      ? {
          starting: selectedMonth.start,
          income: selectedMonth.inflow,
          transfersIn: 0,
          bills: roundMoney(selectedMonth.outflow * 0.55),
          spending: roundMoney(selectedMonth.outflow * 0.45),
          debtPayments: 0,
          ending: selectedMonth.end,
          label: selectedMonth.label,
        }
      : null);
  const displayWaterfall = activeWaterfallRow;

  const recurringVisible = (forecast.recurring || []).filter((r) => !ignoredRecurring.has(r.id));

  if (loaded.loading && !transactions.length && !shareBanner) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center text-[#F0F9FF]">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#F0F9FF]/30 border-t-[#4ADE80]" />
        <p className="mt-3 text-sm text-[#F0F9FF]/75">Building your cash forecast…</p>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-[#0047AB] px-3 py-4 pb-24 text-[#F0F9FF] md:px-6 md:py-6 md:pb-6">
      <div className="mx-auto max-w-7xl space-y-5">
        {/* Header controls */}
        <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-[#F0F9FF]/65">
              Personal Cash Forecast
            </p>
            <h1 className="mt-1 text-2xl font-semibold md:text-3xl">Future cash, explained</h1>
            <p className="mt-1 max-w-2xl text-sm text-[#F0F9FF]/75">
              Daily projections from your budget, accounts, transactions, and detected recurring patterns.
              Updated automatically when your data changes.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {FORECAST_HORIZONS.map((h) => (
              <button
                key={h.id}
                type="button"
                onClick={() => setHorizonId(h.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  horizonId === h.id
                    ? 'bg-[#F0F9FF] text-[#0047AB]'
                    : 'border border-white/30 bg-[#001a40]/50 hover:bg-[#001a40]'
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </header>

        {shareBanner && (
          <div className="rounded-xl border border-[#4ADE80]/40 bg-[#001a40]/90 px-4 py-3 text-sm">
            <strong>Shared forecast snapshot</strong> — read-only view from{' '}
            {new Date(shareBanner.generatedAt).toLocaleString()}. Live data controls are disabled.
          </div>
        )}

        {horizonId === 'custom' && (
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-white/20 bg-[#001a40]/60 p-3">
            <label className="text-sm">
              Start
              <input
                type="date"
                value={customRange.start}
                onChange={(e) => setCustomRange((r) => ({ ...r, start: e.target.value }))}
                className="mt-1 block rounded-lg border border-white/25 bg-[#0047AB]/50 px-3 py-1.5"
              />
            </label>
            <label className="text-sm">
              End
              <input
                type="date"
                value={customRange.end}
                min={customRange.start}
                onChange={(e) => setCustomRange((r) => ({ ...r, end: e.target.value }))}
                className="mt-1 block rounded-lg border border-white/25 bg-[#0047AB]/50 px-3 py-1.5"
              />
            </label>
            <p className="text-xs text-[#F0F9FF]/60">{horizonDays} day horizon</p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3">
          {Object.values(FORECAST_MODES).map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setMode(m.id)}
              className={`rounded-xl px-4 py-2 text-sm font-medium ${
                mode === m.id ? 'bg-[#001a40] ring-2 ring-[#4ADE80]/60' : 'bg-[#001a40]/40 hover:bg-[#001a40]/70'
              }`}
            >
              {m.label}
            </button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-sm text-[#F0F9FF]/80">
            Low-cash threshold
            <input
              type="number"
              min={0}
              step={100}
              value={cashThreshold}
              onChange={(e) => setCashThreshold(Number(e.target.value) || 0)}
              className="w-24 rounded-lg border border-white/25 bg-[#001a40] px-2 py-1 text-[#F0F9FF]"
            />
          </label>
          <select
            value={accountFilter}
            onChange={(e) => setAccountFilter(e.target.value)}
            className="rounded-lg border border-white/25 bg-[#001a40] px-3 py-2 text-sm"
          >
            <option value="all">All accounts</option>
            {(accounts || []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={onExportCsv}
            disabled={!!shareBanner}
            className="rounded-xl border border-white/30 px-4 py-2 text-sm hover:bg-[#001a40]/60 disabled:opacity-40"
          >
            Export CSV
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="rounded-xl border border-white/30 px-4 py-2 text-sm hover:bg-[#001a40]/60"
          >
            Export PDF
          </button>
          <button
            type="button"
            onClick={onExportPng}
            disabled={!!shareBanner}
            className="rounded-xl border border-white/30 px-4 py-2 text-sm hover:bg-[#001a40]/60 disabled:opacity-40"
          >
            Export PNG
          </button>
          <button
            type="button"
            onClick={onShareLink}
            disabled={!!shareBanner}
            className="rounded-xl border border-white/30 px-4 py-2 text-sm hover:bg-[#001a40]/60 disabled:opacity-40"
          >
            Share link
          </button>
          {copyFeedback && <span className="text-xs text-[#4ADE80]">{copyFeedback}</span>}
        </div>

        {/* Section A — KPI header */}
        <section className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
          <KpiCard label="Current Cash" value={formatCurrency(forecast.startingCash)} />
          <KpiCard
            label="Lowest Balance"
            value={formatCurrency(summary.lowPoint.balance)}
            sub={summary.lowPoint.date}
            tone={summary.lowPoint.balance < cashThreshold ? 'warn' : 'neutral'}
          />
          <KpiCard
            label="Highest Balance"
            value={formatCurrency(summary.highPoint.balance)}
            sub={summary.highPoint.date}
            tone="good"
          />
          <KpiCard label="Cash Runway" value={`${summary.runwayDays} days`} sub="At current burn" />
          <KpiCard
            label="Health Score"
            value={`${summary.healthScore}/100`}
            sub={summary.healthScore >= 70 ? 'Healthy' : summary.healthScore >= 45 ? 'Fair' : 'At risk'}
            tone={summary.healthScore >= 70 ? 'good' : summary.healthScore >= 45 ? 'warn' : 'bad'}
          />
        </section>

        {/* Tabs — fixed bottom on mobile */}
        <nav className="fixed bottom-0 left-0 right-0 z-40 flex gap-1 overflow-x-auto border-t border-white/20 bg-[#001a40]/95 px-2 py-2 backdrop-blur md:static md:flex-wrap md:gap-2 md:border-b md:bg-transparent md:px-0 md:py-0 md:pb-2">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-lg px-3 py-2 text-xs font-medium md:rounded-t-lg md:px-4 md:text-sm ${
                activeTab === tab.id ? 'bg-[#0047AB] text-[#F0F9FF] ring-1 ring-[#4ADE80]/40' : 'text-[#F0F9FF]/70 hover:text-[#F0F9FF]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === 'dashboard' && (
          <div className="flex flex-col gap-5">
            {/* Primary chart */}
            <section data-cash-forecast-chart>
              <h2 className="mb-2 text-lg font-semibold">Forecast chart</h2>
              <ForecastChart
                ref={chartRef}
                historical={forecast.historical}
                daily={forecast.daily}
                threshold={cashThreshold}
                selectedAccountFilter={accountFilter}
                onDayClick={(d) => d?.date && setDrillDay(d.date)}
              />
            </section>

            <section className="rounded-2xl border border-white/20 bg-[#001a40]/80 p-4 md:hidden">
              <h2 className="mb-3 text-lg font-semibold">Risk alerts</h2>
              {risks.length === 0 ? (
                <p className="text-sm text-[#F0F9FF]/70">No critical risks detected in this horizon.</p>
              ) : (
                <ul className="space-y-2">
                  {risks.slice(0, 4).map((r, i) => (
                    <li key={`m-${r.type}-${i}`} className="rounded-xl border border-white/10 bg-[#0047AB]/40 p-3 text-sm">
                      <strong>{r.message}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="overflow-hidden rounded-2xl border border-white/20 bg-[#001a40]/80">
              <h2 className="border-b border-white/15 px-4 py-3 text-lg font-semibold">Monthly forecast</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[#0047AB]/50 text-[#F0F9FF]/75">
                    <tr>
                      <th className="px-4 py-2">Month</th>
                      <th className="px-4 py-2 text-right">Start</th>
                      <th className="px-4 py-2 text-right">Inflow</th>
                      <th className="px-4 py-2 text-right">Outflow</th>
                      <th className="px-4 py-2 text-right">Net</th>
                      <th className="px-4 py-2 text-right">End</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthly.map((row) => (
                      <tr
                        key={row.monthKey}
                        className="cursor-pointer border-t border-white/10 hover:bg-[#0047AB]/30"
                        onClick={() => {
                          setSelectedMonthKey(row.monthKey);
                          setDrillDay(row.days?.[0]?.date || null);
                        }}
                      >
                        <td className="px-4 py-2 font-medium">{row.label}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(row.start)}</td>
                        <td className="px-4 py-2 text-right text-[#4ADE80]">{formatCurrency(row.inflow)}</td>
                        <td className="px-4 py-2 text-right text-[#F87171]">{formatCurrency(row.outflow)}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(row.net)}</td>
                        <td className="px-4 py-2 text-right font-semibold">{formatCurrency(row.end)}</td>
                        <td className="px-4 py-2">
                          <span style={{ color: statusColor(row.status) }}>
                            {row.trend === 'up' ? '↑' : '↓'} {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            {!showMobileExtras && (
              <button
                type="button"
                className="rounded-xl border border-white/30 bg-[#001a40]/70 px-4 py-3 text-sm md:hidden"
                onClick={() => setShowMobileExtras(true)}
              >
                Show waterfall, accounts & more
              </button>
            )}

            <div className={`flex-col gap-5 ${showMobileExtras ? 'flex' : 'hidden md:flex'}`}>
            {/* Forecast accuracy */}
            {!shareBanner && (
              <section className="rounded-2xl border border-white/20 bg-[#001a40]/80 p-4">
                <h2 className="mb-2 text-lg font-semibold">Forecast accuracy</h2>
                {accuracy.overall != null ? (
                  <>
                    <p className="text-2xl font-bold text-[#4ADE80]">{accuracy.overall}%</p>
                    <p className="text-sm text-[#F0F9FF]/70">
                      Based on {accuracy.samples} past projection check{accuracy.samples === 1 ? '' : 's'}
                    </p>
                    {accuracy.trend.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {accuracy.trend.map((t) => (
                          <span
                            key={t.month}
                            className="rounded-lg border border-white/15 px-2 py-1 text-xs"
                          >
                            {t.month}: {t.accuracyPct}%
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[#F0F9FF]/70">
                    Accuracy tracking begins after your first weekly forecast snapshot. Check back in 7 days.
                  </p>
                )}
              </section>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Waterfall */}
              <section className="rounded-2xl border border-white/20 bg-[#001a40]/80 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-lg font-semibold">Cash flow waterfall</h2>
                  <div className="flex gap-1">
                    {['monthly', 'quarterly', 'yearly'].map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setWaterfallPeriod(p)}
                        className={`rounded-lg px-2 py-1 text-xs capitalize ${
                          waterfallPeriod === p ? 'bg-[#0047AB] ring-1 ring-[#4ADE80]/50' : 'bg-[#0047AB]/40'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                {displayWaterfall && (
                  <>
                    {displayWaterfall.label && (
                      <p className="mb-2 text-xs text-[#F0F9FF]/60">{displayWaterfall.label}</p>
                    )}
                  <ul className="space-y-2 text-sm">
                    <WaterfallRow label="Starting cash" amount={displayWaterfall.starting} />
                    <WaterfallRow label="+ Income" amount={displayWaterfall.income} positive />
                    <WaterfallRow label="+ Transfers in" amount={displayWaterfall.transfersIn} positive />
                    <WaterfallRow label="− Bills" amount={-displayWaterfall.bills} />
                    <WaterfallRow label="− Spending" amount={-displayWaterfall.spending} />
                    <WaterfallRow label="− Debt payments" amount={-displayWaterfall.debtPayments} />
                    <li className="border-t border-white/20 pt-2 font-semibold">
                      <WaterfallRow label="= Ending cash" amount={displayWaterfall.ending} bold />
                    </li>
                  </ul>
                  </>
                )}
              </section>

              {/* Risks + Insights */}
              <section className="hidden space-y-4 md:block">
                <div className="rounded-2xl border border-white/20 bg-[#001a40]/80 p-4">
                  <h2 className="mb-3 text-lg font-semibold">Risk alerts</h2>
                  {risks.length === 0 ? (
                    <p className="text-sm text-[#F0F9FF]/70">No critical risks detected in this horizon.</p>
                  ) : (
                    <ul className="space-y-2">
                      {risks.slice(0, 6).map((r, i) => (
                        <li
                          key={`${r.type}-${i}`}
                          className="rounded-xl border border-white/10 bg-[#0047AB]/40 p-3 text-sm"
                        >
                          <span
                            className="mr-2 inline-block h-2 w-2 rounded-full"
                            style={{ background: riskSeverityColor(r.severity) }}
                          />
                          <strong>{r.message}</strong>
                          {r.cause && <p className="mt-1 text-[#F0F9FF]/65">{r.cause}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="rounded-2xl border border-white/20 bg-[#001a40]/80 p-4">
                  <h2 className="mb-3 text-lg font-semibold">Smart insights</h2>
                  {insights.length === 0 ? (
                    <p className="text-sm text-[#F0F9FF]/70">Insights will appear as patterns emerge.</p>
                  ) : (
                    <ul className="space-y-3">
                      {insights.map((ins, i) => (
                        <li key={i} className="text-sm">
                          <p className="font-medium text-[#4ADE80]">{ins.title}</p>
                          <p className="text-[#F0F9FF]/85">{ins.body}</p>
                          <p className="mt-1 text-xs text-[#F0F9FF]/60">→ {ins.action}</p>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </section>
            </div>

            {/* Account cards */}
            <section>
              <h2 className="mb-3 text-lg font-semibold">Account forecasts</h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {accountForecasts.map((acc) => (
                  <article
                    key={acc.id}
                    className="rounded-2xl border border-white/20 bg-[#001a40]/80 p-4"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold">{acc.name}</h3>
                      <span
                        className="rounded-full px-2 py-0.5 text-xs capitalize"
                        style={{
                          background:
                            acc.risk === 'high'
                              ? 'rgba(248,113,113,0.2)'
                              : acc.risk === 'medium'
                                ? 'rgba(251,191,36,0.2)'
                                : 'rgba(74,222,128,0.2)',
                        }}
                      >
                        {acc.risk} risk
                      </span>
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-wider text-[#F0F9FF]/55">{acc.type}</p>
                    <p className="mt-1 text-xl font-semibold">{formatCurrency(acc.currentBalance)}</p>
                    {acc.projectedMin != null && (
                      <p className="mt-2 text-sm text-[#F0F9FF]/75">
                        Projected range: {formatCurrency(acc.projectedMin)} – {formatCurrency(acc.projectedMax)}
                      </p>
                    )}
                    {acc.payoffMonths != null && (
                      <p className="mt-1 text-sm text-[#F0F9FF]/70">
                        Payoff ~{acc.payoffMonths} mo at min payment
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </section>

            {/* Category variance */}
            <section className="rounded-2xl border border-white/20 bg-[#001a40]/80 p-4">
              <h2 className="mb-3 text-lg font-semibold">Category variance (budget vs history)</h2>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-[#F0F9FF]/70">
                    <tr>
                      <th className="py-2 text-left">Category</th>
                      <th className="py-2 text-right">Assigned</th>
                      <th className="py-2 text-right">Avg actual</th>
                      <th className="py-2 text-right">Variance</th>
                      <th className="py-2 text-right">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {forecast.categoryAnalysis
                      .filter((c) => c.budgeted > 0 || c.actualAvg > 0)
                      .slice(0, 15)
                      .map((c) => (
                        <tr key={c.categoryId} className="border-t border-white/10">
                          <td className="py-2">{c.name}</td>
                          <td className="py-2 text-right">{formatCurrency(c.budgeted)}</td>
                          <td className="py-2 text-right">{formatCurrency(c.actualAvg)}</td>
                          <td
                            className="py-2 text-right"
                            style={{ color: c.variance > 0 ? '#F87171' : '#4ADE80' }}
                          >
                            {c.variance > 0 ? '+' : ''}
                            {formatCurrency(c.variance)}
                          </td>
                          <td className="py-2 text-right">{Math.round(c.confidence)}%</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
            </div>
          </div>
        )}

        {activeTab === 'scenarios' && (
          <section className="grid gap-5 lg:grid-cols-2">
            <div className="rounded-2xl border border-white/20 bg-[#001a40]/80 p-4">
              <h2 className="mb-4 text-lg font-semibold">Scenario builder</h2>
              <label className="mb-3 block text-sm">
                Monthly income change
                <input
                  type="number"
                  step={100}
                  value={scenario.monthlyIncomeDelta}
                  onChange={(e) =>
                    setScenario((s) => ({ ...s, monthlyIncomeDelta: Number(e.target.value) || 0 }))
                  }
                  className="mt-1 w-full rounded-lg border border-white/25 bg-[#0047AB]/50 px-3 py-2"
                />
              </label>
              <label className="mb-4 block text-sm">
                Monthly expense change
                <input
                  type="number"
                  step={100}
                  value={scenario.monthlyExpenseDelta}
                  onChange={(e) =>
                    setScenario((s) => ({ ...s, monthlyExpenseDelta: Number(e.target.value) || 0 }))
                  }
                  className="mt-1 w-full rounded-lg border border-white/25 bg-[#0047AB]/50 px-3 py-2"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                {[
                  { label: 'Job loss', income: -4000, expense: 0 },
                  { label: 'Raise +$500', income: 500, expense: 0 },
                  { label: 'Vacation', income: 0, expense: 800 },
                  { label: 'Save more', income: 0, expense: 300 },
                ].map((preset) => (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() =>
                      setScenario({
                        label: preset.label,
                        monthlyIncomeDelta: preset.income,
                        monthlyExpenseDelta: preset.expense,
                      })
                    }
                    className="rounded-lg border border-white/25 px-3 py-1.5 text-xs hover:bg-[#0047AB]/50"
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
            {scenarioResult && (
              <div className="rounded-2xl border border-white/20 bg-[#001a40]/80 p-4">
                <h2 className="mb-4 text-lg font-semibold">Current plan vs scenario</h2>
                <dl className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <dt>Ending cash (current)</dt>
                    <dd>{formatCurrency(scenarioResult.baseEnding)}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Ending cash (scenario)</dt>
                    <dd>{formatCurrency(scenarioResult.scenarioEnding)}</dd>
                  </div>
                  <div className="flex justify-between border-t border-white/15 pt-2 font-semibold">
                    <dt>Impact</dt>
                    <dd style={{ color: scenarioResult.delta >= 0 ? '#4ADE80' : '#F87171' }}>
                      {scenarioResult.delta >= 0 ? '+' : ''}
                      {formatCurrency(scenarioResult.delta)}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt>Runway (current / scenario)</dt>
                    <dd>
                      {scenarioResult.baseRunway} / {scenarioResult.scenarioRunway} days
                    </dd>
                  </div>
                </dl>
              </div>
            )}
          </section>
        )}

        {activeTab === 'recurring' && (
          <section className="space-y-4">
            <div className="rounded-2xl border border-white/20 bg-[#001a40]/80 p-4">
              <h2 className="mb-2 text-lg font-semibold">Recurring transaction center</h2>
              <p className="mb-4 text-sm text-[#F0F9FF]/70">
                Auto-detected patterns plus DB scheduled transactions. Confirm, edit amounts, or ignore.
              </p>
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-[#F0F9FF]/70">
                    <tr>
                      <th className="py-2 text-left">Payee</th>
                      <th className="py-2 text-right">Amount</th>
                      <th className="py-2">Type</th>
                      <th className="py-2">Frequency</th>
                      <th className="py-2 text-right">Occurrences</th>
                      <th className="py-2">Source</th>
                      <th className="py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {recurringVisible.map((r) => {
                      const override = recurringOverrides[r.id];
                      const displayAmount = override?.amount ?? r.amount;
                      const displayFreq = override?.frequency ?? r.frequency;
                      return (
                        <tr key={r.id} className="border-t border-white/10">
                          <td className="py-2">{r.payee}</td>
                          <td className="py-2 text-right">{formatCurrency(displayAmount)}</td>
                          <td className="py-2">{r.inflow ? 'Income' : 'Expense'}</td>
                          <td className="py-2 capitalize">{displayFreq}</td>
                          <td className="py-2 text-right">{r.occurrences}</td>
                          <td className="py-2 text-xs capitalize text-[#F0F9FF]/60">{r.source || 'detected'}</td>
                          <td className="py-2 text-right">
                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                className="text-xs text-[#93C5FD] hover:underline"
                                onClick={() =>
                                  setEditingRecurring({
                                    ...r,
                                    amount: displayAmount,
                                    frequency: displayFreq,
                                  })
                                }
                              >
                                Edit
                              </button>
                              {!confirmedRecurring.has(r.id) && (
                                <button
                                  type="button"
                                  className="text-xs text-[#4ADE80] hover:underline"
                                  onClick={() => setRecurringStatus(r.id, 'confirmed')}
                                >
                                  Confirm
                                </button>
                              )}
                              {confirmedRecurring.has(r.id) && (
                                <span className="text-xs text-[#4ADE80]">✓</span>
                              )}
                              <button
                                type="button"
                                className="text-xs text-[#F87171] hover:underline"
                                onClick={() => setRecurringStatus(r.id, 'ignored')}
                              >
                                Ignore
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {scheduledTransactions.length > 0 && (
              <div className="rounded-2xl border border-white/20 bg-[#001a40]/80 p-4">
                <h3 className="mb-3 font-semibold">Scheduled transactions (database)</h3>
                <ul className="space-y-2 text-sm">
                  {scheduledTransactions.slice(0, 30).map((s) => (
                    <li key={s.id} className="flex justify-between gap-2 border-t border-white/10 py-2">
                      <span>
                        {s.date} · {s.payee}
                      </span>
                      <span className={s.transaction_type === 'inflow' ? 'text-[#4ADE80]' : 'text-[#F87171]'}>
                        {formatCurrency(s.amount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>
        )}

        {activeTab === 'calendar' && (
          <section className="rounded-2xl border border-white/20 bg-[#001a40]/80 p-4">
            <h2 className="mb-4 text-lg font-semibold">Cash flow calendar</h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {calendar.map((ev, i) => (
                <li
                  key={`${ev.date}-${i}`}
                  className="rounded-xl border border-white/15 p-3 text-sm"
                  style={{
                    borderLeftWidth: 4,
                    borderLeftColor:
                      ev.tone === 'inflow' ? '#4ADE80' : ev.tone === 'warning' ? '#FBBF24' : '#F87171',
                  }}
                >
                  <p className="text-xs text-[#F0F9FF]/60">{ev.date}</p>
                  <p className="font-medium">{ev.payee}</p>
                  <p>{formatCurrency(ev.amount)}</p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {activeTab === 'goals' && (
          <section className="grid gap-3 sm:grid-cols-2">
            {goals.length === 0 ? (
              <p className="text-[#F0F9FF]/70">Add goal targets to budget categories to see goal forecasts.</p>
            ) : (
              goals.map((g) => (
                <article key={g.id} className="rounded-2xl border border-white/20 bg-[#001a40]/80 p-4">
                  <h3 className="font-semibold">{g.name}</h3>
                  <p className="mt-2 text-sm">
                    {formatCurrency(g.current)} / {formatCurrency(g.target)}
                  </p>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-[#0047AB]">
                    <div
                      className="h-full bg-[#4ADE80]"
                      style={{ width: `${Math.min(100, (g.current / g.target) * 100)}%` }}
                    />
                  </div>
                  {g.completionDate && (
                    <p className="mt-2 text-xs text-[#F0F9FF]/70">
                      Est. completion: {g.completionDate}
                      {!g.onTrack && ' — may need more funding'}
                    </p>
                  )}
                </article>
              ))
            )}
          </section>
        )}

        {/* Recurring edit modal */}
        {editingRecurring && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
            <div className="w-full max-w-md rounded-2xl border border-white/25 bg-[#001a40] p-5 shadow-xl">
              <h3 className="text-lg font-semibold">Edit recurring — {editingRecurring.payee}</h3>
              <label className="mt-4 block text-sm">
                Amount
                <input
                  type="number"
                  step={1}
                  value={editingRecurring.amount}
                  onChange={(e) =>
                    setEditingRecurring((r) => ({ ...r, amount: Number(e.target.value) || 0 }))
                  }
                  className="mt-1 w-full rounded-lg border border-white/25 bg-[#0047AB]/50 px-3 py-2"
                />
              </label>
              <label className="mt-3 block text-sm">
                Frequency
                <select
                  value={editingRecurring.frequency}
                  onChange={(e) => setEditingRecurring((r) => ({ ...r, frequency: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-white/25 bg-[#0047AB]/50 px-3 py-2"
                >
                  {['weekly', 'biweekly', 'monthly', 'quarterly', 'annual'].map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
                </select>
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-lg px-4 py-2 text-sm text-[#F0F9FF]/70"
                  onClick={() => setEditingRecurring(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-lg bg-[#4ADE80] px-4 py-2 text-sm font-medium text-[#0047AB]"
                  onClick={async () => {
                    const override = {
                      amount: editingRecurring.amount,
                      frequency: editingRecurring.frequency,
                    };
                    await setRecurringStatus(
                      editingRecurring.id,
                      confirmedRecurring.has(editingRecurring.id) ? 'confirmed' : 'confirmed',
                      override,
                    );
                    setEditingRecurring(null);
                  }}
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Drill-down modal */}
        {drillDay && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            role="dialog"
            aria-modal="true"
          >
            <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-2xl border border-white/25 bg-[#001a40] p-5 shadow-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Daily drill-down — {drillDay}</h3>
                <button type="button" onClick={() => setDrillDay(null)} className="text-[#F0F9FF]/70 hover:text-white">
                  ✕
                </button>
              </div>
              {(() => {
                const day = forecast.daily.find((d) => d.date === drillDay);
                if (!day) return <p className="mt-4 text-sm">No data for this day.</p>;
                return (
                  <div className="mt-4 space-y-3 text-sm">
                    <p>
                      Balance: <strong>{formatCurrency(day.balance)}</strong>
                    </p>
                    <p>Inflows: {formatCurrency(day.inflows)} · Outflows: {formatCurrency(day.outflows)}</p>
                    {day.events?.length > 0 ? (
                      <ul className="space-y-1">
                        {day.events.map((e, i) => (
                          <li key={i}>
                            {e.payee}: {formatCurrency(e.amount)}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[#F0F9FF]/65">No scheduled events this day.</p>
                    )}
                    {day.events?.length > 0 && (
                      <div className="border-t border-white/15 pt-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-[#F0F9FF]/55">
                          Category impact
                        </p>
                        <ul className="space-y-1 text-xs">
                          {Object.entries(
                            day.events.reduce((acc, e) => {
                              const key = e.type || 'other';
                              acc[key] = (acc[key] || 0) + Math.abs(e.amount);
                              return acc;
                            }, {}),
                          ).map(([type, amt]) => (
                            <li key={type} className="flex justify-between">
                              <span className="capitalize">{type}</span>
                              <span>{formatCurrency(amt)}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {selectedMonth && (
                      <p className="border-t border-white/15 pt-3 text-[#F0F9FF]/70">
                        Month net: {formatCurrency(selectedMonth.net)} ({selectedMonth.label})
                      </p>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

function KpiCard({ label, value, sub, tone = 'neutral' }) {
  const color =
    tone === 'good' ? '#4ADE80' : tone === 'warn' ? '#FBBF24' : tone === 'bad' ? '#F87171' : PM.text;
  return (
    <div className="rounded-2xl border border-white/20 bg-[#001a40]/85 p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#F0F9FF]/60">{label}</p>
      <p className="mt-2 text-xl font-bold md:text-2xl" style={{ color }}>
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-[#F0F9FF]/65">{sub}</p>}
    </div>
  );
}

function WaterfallRow({ label, amount, positive, bold }) {
  const n = Number(amount) || 0;
  const color = n > 0 ? '#4ADE80' : n < 0 ? '#F87171' : PM.text;
  return (
    <li className={`flex justify-between ${bold ? 'text-base' : ''}`}>
      <span>{label}</span>
      <span style={{ color: positive ? '#4ADE80' : color }}>{formatCurrency(Math.abs(n))}</span>
    </li>
  );
}

export default CashFlowView;
