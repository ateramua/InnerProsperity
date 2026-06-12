import React, { useCallback, useEffect, useState } from 'react';
import Button from '../components/ui/Button';

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function formatWhen(value) {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return String(value);
  }
}

const BudgetIdentityDiagnosticsView = ({ userId: userIdProp, monthKey: monthKeyProp, onNavigate }) => {
  const [userId, setUserId] = useState(userIdProp || null);
  const [monthKey, setMonthKey] = useState(monthKeyProp || null);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    (async () => {
      if (userIdProp) {
        setUserId(userIdProp);
        return;
      }
      const user = await window.electronAPI?.getCurrentUser?.();
      if (user?.id) setUserId(user.id);
    })();
  }, [userIdProp]);

  useEffect(() => {
    if (monthKeyProp) {
      setMonthKey(monthKeyProp);
      return;
    }
    const now = new Date();
    const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    setMonthKey(mk);
  }, [monthKeyProp]);

  const load = useCallback(async () => {
    if (!userId || !window.electronAPI?.getBudgetIdentityDiagnostics) return;
    setLoading(true);
    try {
      const res = await window.electronAPI.getBudgetIdentityDiagnostics(userId, monthKey);
      if (res?.success) setData(res.data);
    } finally {
      setLoading(false);
    }
  }, [userId, monthKey]);

  useEffect(() => {
    load();
  }, [load]);

  const status = data?.status;
  const analysis = data?.analysis;

  const runAnalysisRefresh = async () => {
    setMessage(null);
    const res = await window.electronAPI.analyzeImportedCash(userId, monthKey);
    if (res?.success) {
      setMessage('Migration analysis refreshed.');
      await load();
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 text-[#F0F9FF]" data-testid="budget-identity-diagnostics">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-[#F0F9FF]/65">Diagnostics</p>
          <h1 className="mt-2 text-2xl font-semibold">Budget identity</h1>
          <p className="mt-1 text-sm text-[#F0F9FF]/75">
            On-budget cash must equal Ready to Assign plus category available balances.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="pmSecondary" onClick={runAnalysisRefresh}>
            Refresh analysis
          </Button>
          {onNavigate && (
            <Button variant="pmSecondary" onClick={() => onNavigate('propertyMap')}>
              Back to budget
            </Button>
          )}
        </div>
      </div>

      {loading && <p className="text-sm opacity-75">Loading diagnostics…</p>}
      {message && <p className="text-sm text-emerald-200">{message}</p>}

      {status && (
        <section className="rounded-2xl border border-white/20 bg-[#0047AB]/80 p-5">
          <h2 className="text-lg font-semibold">Current status</h2>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <dt className="text-xs opacity-70">Health</dt>
              <dd className="font-medium capitalize">{status.healthStatus}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">On-budget cash</dt>
              <dd className="font-medium">{formatMoney(status.onBudgetCash)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Ready to Assign</dt>
              <dd className="font-medium">{formatMoney(status.readyToAssign)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Identity delta</dt>
              <dd className="font-medium">{formatMoney(status.budgetInvariantDelta)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Unallocated imported</dt>
              <dd className="font-medium">{formatMoney(status.unallocatedImportedCash)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Over-assigned gap</dt>
              <dd className="font-medium">{formatMoney(status.overAssignedGap)}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Warning suppressed</dt>
              <dd className="font-medium">{status.warningSuppressed ? 'Yes' : 'No'}</dd>
            </div>
            <div>
              <dt className="text-xs opacity-70">Issue type</dt>
              <dd className="font-medium">{status.identityIssueType || 'none'}</dd>
            </div>
          </dl>
        </section>
      )}

      {analysis?.proposals?.length > 0 && (
        <section className="rounded-2xl border border-white/20 bg-[#0047AB]/60 p-5">
          <h2 className="text-lg font-semibold">Pending opening balance proposals</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {analysis.proposals.map((p) => (
              <li key={p.accountId} className="flex justify-between gap-4 border-b border-white/10 py-2">
                <span>{p.accountName}</span>
                <span>{formatMoney(p.proposedOpeningBalance)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {data?.pendingDuplicates?.length > 0 && (
        <section className="rounded-2xl border border-amber-300/30 bg-amber-950/20 p-5">
          <h2 className="text-lg font-semibold">Pending duplicate reviews</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {data.pendingDuplicates.map((row) => (
              <li key={row.id}>
                {row.name} {row.mask ? `(•••• ${row.mask})` : ''} — {row.account_status}
              </li>
            ))}
          </ul>
          {onNavigate && (
            <Button className="mt-3" variant="pmSecondary" onClick={() => onNavigate('linked-banks')}>
              Review in Linked Banks
            </Button>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-white/20 bg-[#0047AB]/60 p-5">
        <h2 className="text-lg font-semibold">Identity snapshot history</h2>
        {!data?.snapshots?.length ? (
          <p className="mt-2 text-sm opacity-75">No snapshots recorded yet.</p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead>
                <tr className="opacity-70">
                  <th className="py-2 pr-4">When</th>
                  <th className="py-2 pr-4">Health</th>
                  <th className="py-2 pr-4">Cash</th>
                  <th className="py-2 pr-4">RTA</th>
                  <th className="py-2 pr-4">Delta</th>
                  <th className="py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {data.snapshots.map((row) => (
                  <tr key={row.id} className="border-t border-white/10">
                    <td className="py-2 pr-4">{formatWhen(row.recorded_at)}</td>
                    <td className="py-2 pr-4 capitalize">{row.health_status}</td>
                    <td className="py-2 pr-4">{formatMoney(row.on_budget_cash)}</td>
                    <td className="py-2 pr-4">{formatMoney(row.rta)}</td>
                    <td className="py-2 pr-4">{formatMoney(row.identity_delta)}</td>
                    <td className="py-2">{row.source || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-white/20 bg-[#0047AB]/60 p-5">
        <h2 className="text-lg font-semibold">Reconciliation events</h2>
        {!data?.events?.length ? (
          <p className="mt-2 text-sm opacity-75">No events recorded yet.</p>
        ) : (
          <ul className="mt-3 space-y-2 text-xs">
            {data.events.map((ev) => (
              <li key={ev.id} className="rounded-lg border border-white/10 px-3 py-2">
                <div className="flex justify-between gap-4">
                  <span className="font-medium">{ev.event_type}</span>
                  <span className="opacity-70">{formatWhen(ev.recorded_at)}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default BudgetIdentityDiagnosticsView;
