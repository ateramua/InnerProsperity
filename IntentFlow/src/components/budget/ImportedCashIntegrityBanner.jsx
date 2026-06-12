import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { showIntentFlowConfirmDialog } from '../../utils/showIntentFlowDialog.jsx';

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const ImportedCashIntegrityBanner = ({ userId, monthKey, onReconciled, onNavigate }) => {
  const [status, setStatus] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);
  const [selectedAccountIds, setSelectedAccountIds] = useState([]);

  const loadStatus = useCallback(async () => {
    if (!userId || !window.electronAPI?.getBudgetIntegrityState) return;
    setLoading(true);
    try {
      const [statusRes, analysisRes] = await Promise.all([
        window.electronAPI.getBudgetIntegrityState(userId, monthKey),
        window.electronAPI.analyzeImportedCash?.(userId, monthKey),
      ]);
      if (statusRes?.success) setStatus(statusRes.data);
      if (analysisRes?.success) {
        setAnalysis(analysisRes.data);
        const ids = (analysisRes.data?.proposals || []).map((p) => p.accountId);
        setSelectedAccountIds(ids);
      }
    } finally {
      setLoading(false);
    }
  }, [userId, monthKey]);

  useEffect(() => {
    loadStatus();
    const unsubAccounts = window.electronAPI?.onAccountsUpdated?.(() => loadStatus());
    return () => {
      if (typeof unsubAccounts === 'function') unsubAccounts();
    };
  }, [loadStatus]);

  const proposals = analysis?.proposals || [];
  const proposedTotal = useMemo(() => {
    if (!proposals.length) return status?.unallocatedImportedCash ?? 0;
    const selected = proposals.filter((p) => selectedAccountIds.includes(p.accountId));
    return selected.reduce((sum, p) => sum + (Number(p.proposedOpeningBalance) || 0), 0);
  }, [proposals, selectedAccountIds, status]);

  if (loading && !status) return null;
  if (!status?.needsReconciliation) return null;

  const isOrphan = status.identityIssueType === 'orphaned_imported_cash' || status.needsOrphanRepair;
  const isOverAssigned = status.identityIssueType === 'over_assigned' || status.needsOverAssignmentRepair;
  const severity = status.healthStatus || 'warning';
  const isCritical = severity === 'critical' || severity === 'error';

  const toggleAccount = (accountId) => {
    setSelectedAccountIds((prev) =>
      prev.includes(accountId) ? prev.filter((id) => id !== accountId) : [...prev, accountId]
    );
  };

  const handleReconcileSelected = async () => {
    const confirmed = await showIntentFlowConfirmDialog({
      title: 'Add imported cash to budget?',
      message: `Create opening balance inflows totaling about ${formatMoney(proposedTotal)} for ${selectedAccountIds.length} selected account(s), crediting Ready to Assign.`,
    });
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await window.electronAPI.reconcileImportedCash(userId, {
        monthKey,
        accountIds: selectedAccountIds.length ? selectedAccountIds : undefined,
      });
      if (res?.success) {
        setMessage('Imported cash added to your budget.');
        await loadStatus();
        onReconciled?.(res.data);
      } else {
        setMessage(res?.error || 'Reconciliation failed');
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleRepairOverAssignment = async () => {
    const confirmed = await showIntentFlowConfirmDialog({
      title: 'Repair over-assignment?',
      message:
        'This adjusts Ready to Assign so it matches on-budget cash minus category balances. Use this when you have assigned more than your available cash envelope allows.',
    });
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await window.electronAPI.repairBudgetIntegrity(userId, monthKey, {
        forceReconcile: true,
      });
      if (res?.success) {
        setMessage('Budget identity repaired.');
        await loadStatus();
        onReconciled?.(res.data);
      } else {
        setMessage(res?.error || 'Repair failed');
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleCombinedRepair = async () => {
    const confirmed = await showIntentFlowConfirmDialog({
      title: 'Full budget repair?',
      message:
        'This will add opening balances for selected linked accounts, then reconcile Ready to Assign to restore budget identity. Recommended for accounts linked before onboarding was enabled.',
    });
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      if (isOrphan && (selectedAccountIds.length || proposals.length)) {
        await window.electronAPI.reconcileImportedCash(userId, {
          monthKey,
          accountIds: selectedAccountIds.length ? selectedAccountIds : undefined,
        });
      }
      const repairRes = await window.electronAPI.repairBudgetIntegrity(userId, monthKey, {
        forceReconcile: true,
      });
      if (repairRes?.success) {
        setMessage('Full budget repair complete.');
        await loadStatus();
        onReconciled?.(repairRes.data);
      } else {
        setMessage(repairRes?.error || 'Repair failed');
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleSuppress = async (days) => {
    setBusy(true);
    try {
      const res = await window.electronAPI.suppressBudgetIntegrityWarning(userId, { days });
      if (res?.success) {
        setMessage(days ? `Reminder snoozed for ${days} days.` : 'Warning dismissed.');
        await loadStatus();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="imported-cash-integrity-banner"
      className={`rounded-2xl border px-4 py-3 text-sm ${
        isCritical
          ? 'border-rose-300/40 bg-rose-950/40 text-rose-100'
          : 'border-amber-300/35 bg-amber-900/30 text-amber-100'
      }`}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="font-semibold">
              {isOrphan && isOverAssigned
                ? 'Budget identity mismatch'
                : isOrphan
                  ? 'Unallocated imported cash'
                  : 'Over-assigned budget'}
            </p>
            <p className="mt-1 text-xs opacity-90 leading-relaxed">
              {isOrphan
                ? 'Linked account cash must be converted into Ready to Assign through opening balance inflows.'
                : 'Category assignments exceed the cash available in your budget envelope.'}
            </p>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <div>
                <dt className="opacity-70">On-budget cash</dt>
                <dd className="font-medium">{formatMoney(status.onBudgetCash)}</dd>
              </div>
              <div>
                <dt className="opacity-70">Assigned</dt>
                <dd className="font-medium">{formatMoney(status.totalAssigned ?? 0)}</dd>
              </div>
              <div>
                <dt className="opacity-70">Ready to Assign</dt>
                <dd className="font-medium">{formatMoney(status.readyToAssign)}</dd>
              </div>
              <div>
                <dt className="opacity-70">
                  {isOrphan ? 'Unallocated imported' : 'Over-assigned gap'}
                </dt>
                <dd className="font-medium">
                  {formatMoney(
                    isOrphan ? status.unallocatedImportedCash : status.overAssignedGap
                  )}
                </dd>
              </div>
            </dl>
          </div>
        </div>

        {isOrphan && proposals.length > 0 && (
          <div className="rounded-xl border border-white/15 bg-black/15 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide opacity-80">
              Per-account opening balances
            </p>
            <ul className="mt-2 space-y-2">
              {proposals.map((p) => (
                <li key={p.accountId} className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    data-testid={`imported-cash-proposal-${p.accountId}`}
                    checked={selectedAccountIds.includes(p.accountId)}
                    onChange={() => toggleAccount(p.accountId)}
                  />
                  <span className="flex-1">{p.accountName}</span>
                  <span className="font-medium">{formatMoney(p.proposedOpeningBalance)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs opacity-75">
              Selected total: {formatMoney(proposedTotal)}
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {isOrphan && (
            <button
              type="button"
              data-testid="imported-cash-reconcile-btn"
              className="rounded-lg bg-[#0047AB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#003d94] disabled:opacity-60"
              onClick={handleReconcileSelected}
              disabled={busy || (proposals.length > 0 && !selectedAccountIds.length)}
            >
              {busy ? 'Working…' : 'Add imported cash to budget'}
            </button>
          )}
          {isOverAssigned && (
            <button
              type="button"
              data-testid="imported-cash-repair-overassignment-btn"
              className="rounded-lg bg-[#0047AB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#003d94] disabled:opacity-60"
              onClick={handleRepairOverAssignment}
              disabled={busy}
            >
              Repair over-assignment
            </button>
          )}
          {isOrphan && isOverAssigned && (
            <button
              type="button"
              data-testid="imported-cash-combined-repair-btn"
              className="rounded-lg border border-white/30 px-4 py-2 text-xs font-semibold disabled:opacity-60"
              onClick={handleCombinedRepair}
              disabled={busy}
            >
              Full repair
            </button>
          )}
          <button
            type="button"
            className="rounded-lg border border-white/25 px-3 py-2 text-xs opacity-90 disabled:opacity-60"
            onClick={() => handleSuppress(7)}
            disabled={busy}
          >
            Snooze 7 days
          </button>
          <button
            type="button"
            className="rounded-lg border border-white/25 px-3 py-2 text-xs opacity-90 disabled:opacity-60"
            onClick={() => handleSuppress(30)}
            disabled={busy}
          >
            Snooze 30 days
          </button>
          {onNavigate && (
            <button
              type="button"
              className="rounded-lg border border-white/25 px-3 py-2 text-xs opacity-90"
              onClick={() => onNavigate('budget-diagnostics')}
            >
              View diagnostics
            </button>
          )}
        </div>
        {message && <span className="text-xs opacity-90">{message}</span>}
      </div>
    </div>
  );
};

export default ImportedCashIntegrityBanner;
