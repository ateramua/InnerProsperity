import { useState, useEffect, useCallback } from 'react';
import {
  buildAccountPayeeOptions,
  getAllRoutingPayees,
  mapPayeesFromFormApi,
  mapRoutingPayeeOption,
  EMPTY_PAYEES_FORM,
} from '../utils/transferPayeeUtils.jsx';

export function serializePayeeOption(payee) {
  return JSON.stringify({
    id: payee.id,
    name: payee.name,
    isTransfer: Boolean(payee.isTransfer),
    transferAccountId: payee.transferAccountId ?? null,
    accountType: payee.accountType ?? null,
    payeeKind: payee.payeeKind ?? null,
    isPaymentPayee: Boolean(payee.isPaymentPayee),
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
  const all = [...getAllRoutingPayees(payees), ...(payees?.regularPayees || [])];
  return all.find((p) => p.name === name) || null;
}

let sharedPayeesCache = null;
let sharedPayeesCachePromise = null;

async function fetchAllPayeesForForm() {
  if (sharedPayeesCache) return sharedPayeesCache;
  if (sharedPayeesCachePromise) return sharedPayeesCachePromise;

  sharedPayeesCachePromise = (async () => {
    if (!window.electronAPI?.getCurrentUser) {
      sharedPayeesCache = EMPTY_PAYEES_FORM;
      return EMPTY_PAYEES_FORM;
    }
    const userResult = await window.electronAPI.getCurrentUser();
    const userId = userResult?.success ? userResult.data?.id : null;
    if (!userId) {
      sharedPayeesCache = EMPTY_PAYEES_FORM;
      return EMPTY_PAYEES_FORM;
    }

    if (window.electronAPI.getPayeesForForm) {
      const res = await window.electronAPI.getPayeesForForm({
        userId,
        currentAccountId: undefined,
      });
      if (res?.success && res.data) {
        const data = mapPayeesFromFormApi(res.data);
        sharedPayeesCache = data;
        return data;
      }
    }

    const accountsResult = await window.electronAPI.getAccountsSummary?.(userId);
    const allAccounts = accountsResult?.success ? accountsResult.data || [] : [];
    const built = buildAccountPayeeOptions(allAccounts, undefined);
    const data = {
      paymentPayees: built.paymentPayees.map((p) => mapRoutingPayeeOption(p)),
      transferPayees: built.transferPayees.map((p) => mapRoutingPayeeOption(p)),
      regularPayees: [],
    };

    const payeesResult = await window.electronAPI.getPayees?.(userId);
    if (payeesResult?.success) {
      data.regularPayees = (payeesResult.data || [])
        .filter((p) => !p.is_transfer_payee)
        .map((p) => ({
          id: p.id,
          name: p.name,
          isTransfer: false,
          transferAccountId: null,
          usageCount: p.usage_count ?? p.usageCount,
        }));
    }

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
  const regularPayees = payees?.regularPayees || [];
  const paymentPayees = payees?.paymentPayees || [];
  const transferPayees = payees?.transferPayees || [];

  if (accountId == null) {
    return { paymentPayees, transferPayees, regularPayees };
  }

  const exclude = String(accountId);
  const filterList = (list) =>
    (list || []).filter((p) => String(p.transferAccountId) !== exclude);

  return {
    paymentPayees: filterList(paymentPayees),
    transferPayees: filterList(transferPayees),
    regularPayees,
  };
}

/**
 * Loads transfer + recent payees (same data as Add Transaction modals).
 * @param {string|null} excludeAccountId - when set, filters transfers client-side after shared load
 */
export default function useTransactionPayees(excludeAccountId = null, { enabled = true } = {}) {
  const [payees, setPayees] = useState({
    paymentPayees: [],
    transferPayees: [],
    regularPayees: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    if (!window.electronAPI?.getPayeesForForm && !window.electronAPI?.getCurrentUser) {
      setPayees({ paymentPayees: [], transferPayees: [], regularPayees: [] });
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAllPayeesForForm();
      setPayees(filterTransferPayeesForAccount(data, excludeAccountId));
    } catch (e) {
      console.error('useTransactionPayees:', e);
      setError(e.message || 'Failed to load payees');
      setPayees({ paymentPayees: [], transferPayees: [], regularPayees: [] });
    } finally {
      setLoading(false);
    }
  }, [excludeAccountId, enabled]);

  useEffect(() => {
    if (enabled) load();
  }, [load, enabled]);

  return { payees, loading, error, reload: load };
}
