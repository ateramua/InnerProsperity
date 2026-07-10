import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { showIntentFlowConfirmDialog } from '../../utils/showIntentFlowDialog.jsx';

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

const ISSUE_COPY = {
  imported_cash_onboarding: {
    title: 'Imported cash onboarding',
    description: 'Accounts contain cash that has not been added to the budget.',
  },
  envelope_integrity: {
    title: 'Envelope integrity',
    description: 'One or more category balances appear corrupted (missing month carryover).',
  },
  credit_card_reserve: {
    title: 'Credit card reserve',
    description: 'Credit card payment reserves require recalculation.',
  },
  over_assigned: {
    title: 'Over-assigned budget',
    description: 'Category assignments exceed the cash available in your budget envelope.',
  },
  budget_identity_drift: {
    title: 'Budget identity drift',
    description: 'Budget balances are out of sync.',
  },
};

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

  const proposals = analysis?.proposals || status?.diagnostics?.onboardingGap
    ? analysis?.proposals || []
    : [];
  const proposedTotal = useMemo(() => {
    if (!proposals.length) return status?.diagnostics?.onboardingGap ?? status?.unallocatedImportedCash ?? 0;
    const selected = proposals.filter((p) => selectedAccountIds.includes(p.accountId));
    return selected.reduce((sum, p) => sum + (Number(p.proposedOpeningBalance) || 0), 0);
  }, [proposals, selectedAccountIds, status]);

  const issues = status?.issues || [];
  const primaryIssue = status?.primaryIssue;
  const primaryCopy = primaryIssue ? ISSUE_COPY[primaryIssue.type] : null;

  if (loading && !status) return null;
  if (!status?.needsReconciliation) return null;

  const isOrphan = status.needsOrphanRepair || primaryIssue?.type === 'imported_cash_onboarding';
  const isOverAssigned = status.needsOverAssignmentRepair || primaryIssue?.type === 'over_assigned';
  const isEnvelope = status.needsEnvelopeRepair || primaryIssue?.type === 'envelope_integrity';
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
      title: 'Backfill assignment ledger?',
      message:
        'This creates missing assignment audit records for your existing category budgets ' +
        '(without changing June assignments or category amounts), then recomputes Ready to Assign from the ledger.',
    });
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await window.electronAPI.backfillAssignmentLedger?.(userId);
      if (res?.success) {
        setMessage(
          `Assignment ledger reconstructed (${res.data?.applied?.length || 0} events). ` +
            'Ready to Assign updated from ledger.'
        );
        await loadStatus();
        onReconciled?.(res.data);
      } else {
        setMessage(res?.error || 'Ledger backfill failed');
      }
    } catch (err) {
      setMessage(err.message);
    } finally {
      setBusy(false);
    }
  };

  const handleEnvelopeRepair = async () => {
    const confirmed = await showIntentFlowConfirmDialog({
      title: 'Repair category envelopes?',
      message:
        'This rebuilds missing month carryover bridges and refreshes category balances without changing assignments.',
    });
    if (!confirmed) return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await window.electronAPI.repairBudgetIntegrity(userId, monthKey, {
        forceReconcile: false,
      });
      if (res?.success) {
        setMessage('Category envelopes repaired.');
        await loadStatus();
        onReconciled?.(res.data);
      } else {
        setMessage(res?.error || 'Envelope repair failed');
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

  const bannerTitle =
    primaryCopy?.title ||
    (issues.length > 1 ? 'Budget integrity issues detected' : 'Budget integrity issue');

  const bannerDescription =
    primaryCopy?.description ||
    'Review the diagnostics below and choose the appropriate repair action.';

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
            <p className="font-semibold">{bannerTitle}</p>
            <p className="mt-1 text-xs opacity-90 leading-relaxed">{bannerDescription}</p>

            {issues.length > 0 && (
              <ul className="mt-3 space-y-2">
                {issues.map((issue) => {
                  const copy = ISSUE_COPY[issue.type] || {
                    title: issue.label,
                    description: issue.message,
                  };
                  return (
                    <li
                      key={issue.type}
                      className="rounded-lg border border-white/15 bg-black/10 px-3 py-2 text-xs"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{copy.title}</p>
                          <p className="mt-0.5 opacity-85">{copy.description}</p>
                        </div>
                        <span className="font-medium whitespace-nowrap">
                          {formatMoney(issue.amount)}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs sm:grid-cols-4">
              <div>
                <dt className="opacity-70">On-budget cash</dt>
                <dd className="font-medium">{formatMoney(status.onBudgetCash)}</dd>
              </div>
              <div>
                <dt className="opacity-70">Reserved budget</dt>
                <dd className="font-medium">{formatMoney(status.reservedBudget ?? 0)}</dd>
              </div>
              <div>
                <dt className="opacity-70">Ready to Assign</dt>
                <dd className="font-medium">{formatMoney(status.readyToAssign)}</dd>
              </div>
              <div>
                <dt className="opacity-70">Identity delta</dt>
                <dd className="font-medium">{formatMoney(status.budgetInvariantDelta)}</dd>
              </div>
            </dl>
            <p className="mt-2 text-[11px] opacity-70">
              Global budget identity (month-independent anchor:{' '}
              {status.monthKey || status.anchorMonth || 'current month'})
            </p>
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
          {isOrphan && proposals.length > 0 && (
            <button
              type="button"
              data-testid="imported-cash-reconcile-btn"
              className="rounded-lg bg-[#0047AB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#003d94] disabled:opacity-60"
              onClick={handleReconcileSelected}
              disabled={busy || !selectedAccountIds.length}
            >
              {busy ? 'Working…' : 'Add imported cash to budget'}
            </button>
          )}
          {isEnvelope && (
            <button
              type="button"
              data-testid="imported-cash-repair-envelope-btn"
              className="rounded-lg bg-[#0047AB] px-4 py-2 text-xs font-semibold text-white hover:bg-[#003d94] disabled:opacity-60"
              onClick={handleEnvelopeRepair}
              disabled={busy}
            >
              Repair category envelopes
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
              Backfill assignment ledger
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
