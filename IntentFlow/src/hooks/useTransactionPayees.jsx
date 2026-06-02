import { useState, useEffect, useCallback } from 'react';

function normalizeTransferPayee(row) {
  return {
    id: row.id || `transfer_${row.transfer_account_id || row.transferAccountId}`,
    name: row.name,
    isTransfer: true,
    transferAccountId: row.transfer_account_id ?? row.transferAccountId,
    accountType: row.account_type ?? row.accountType,
  };
}

function normalizeRegularPayee(row) {
  return {
    id: row.id,
    name: row.name,
    isTransfer: false,
    transferAccountId: null,
    usageCount: row.usage_count ?? row.usageCount,
  };
}

export function serializePayeeOption(payee) {
  return JSON.stringify({
    id: payee.id,
    name: payee.name,
    isTransfer: Boolean(payee.isTransfer),
    transferAccountId: payee.transferAccountId ?? null,
    accountType: payee.accountType ?? null,
  });
}

export function parsePayeeOption(value) {
  if (!value || value === '__manual__') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function findPayeeOptionByName(payees, payeeName) {
  const name = (payeeName || '').trim();
  if (!name) return null;
  const all = [...(payees?.transferPayees || []), ...(payees?.regularPayees || [])];
  return all.find((p) => p.name === name) || null;
}

let sharedPayeesCache = null;
let sharedPayeesCachePromise = null;

async function fetchAllPayeesForForm() {
  if (sharedPayeesCache) return sharedPayeesCache;
  if (sharedPayeesCachePromise) return sharedPayeesCachePromise;

  sharedPayeesCachePromise = (async () => {
    const empty = { transferPayees: [], regularPayees: [] };
    if (!window.electronAPI?.getCurrentUser) {
      sharedPayeesCache = empty;
      return empty;
    }
    const userResult = await window.electronAPI.getCurrentUser();
    const userId = userResult?.success ? userResult.data?.id : null;
    if (!userId) {
      sharedPayeesCache = empty;
      return empty;
    }

    if (window.electronAPI.getPayeesForForm) {
      const res = await window.electronAPI.getPayeesForForm({
        userId,
        currentAccountId: undefined,
      });
      if (res?.success && res.data) {
        const data = {
          transferPayees: (res.data.transferPayees || []).map(normalizeTransferPayee),
          regularPayees: (res.data.regularPayees || []).map(normalizeRegularPayee),
        };
        sharedPayeesCache = data;
        return data;
      }
    }

    const accountsResult = await window.electronAPI.getAccountsSummary?.(userId);
    const allAccounts = accountsResult?.success ? accountsResult.data || [] : [];
    const transferPayees = allAccounts
      .filter((acc) => acc?.id != null)
      .map((acc) =>
        normalizeTransferPayee({
          id: `transfer_${acc.id}`,
          name: `Transfer: ${acc.name}`,
          transfer_account_id: acc.id,
          account_type: acc.type,
        })
      );

    let regularPayees = [];
    const payeesResult = await window.electronAPI.getPayees?.(userId);
    if (payeesResult?.success) {
      regularPayees = (payeesResult.data || [])
        .filter((p) => !p.is_transfer_payee)
        .map(normalizeRegularPayee);
    }

    const data = { transferPayees, regularPayees };
    sharedPayeesCache = data;
    return data;
  })();

  try {
    return await sharedPayeesCachePromise;
  } finally {
    sharedPayeesCachePromise = null;
  }
}

export function invalidateTransactionPayeesCache() {
  sharedPayeesCache = null;
}

export function filterTransferPayeesForAccount(payees, accountId) {
  if (accountId == null) return payees?.transferPayees || [];
  const exclude = String(accountId);
  return (payees?.transferPayees || []).filter(
    (p) => String(p.transferAccountId) !== exclude
  );
}

/**
 * Loads transfer + recent payees (same data as Add Transaction modals).
 * @param {string|null} excludeAccountId - when set, filters transfers client-side after shared load
 */
export default function useTransactionPayees(excludeAccountId = null, { enabled = true } = {}) {
  const [payees, setPayees] = useState({ transferPayees: [], regularPayees: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    if (!window.electronAPI?.getPayeesForForm && !window.electronAPI?.getCurrentUser) {
      setPayees({ transferPayees: [], regularPayees: [] });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllPayeesForForm();
      setPayees({
        transferPayees: filterTransferPayeesForAccount(data, excludeAccountId),
        regularPayees: data.regularPayees || [],
      });
    } catch (e) {
      console.error('useTransactionPayees:', e);
      setError(e.message || 'Failed to load payees');
      setPayees({ transferPayees: [], regularPayees: [] });
    } finally {
      setLoading(false);
    }
  }, [excludeAccountId, enabled]);

  useEffect(() => {
    if (enabled) load();
  }, [load, enabled]);

  return { payees, loading, error, reload: load };
}
