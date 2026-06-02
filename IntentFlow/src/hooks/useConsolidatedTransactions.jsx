import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { loadAllAccountsViaApi } from '../utils/cashAccountUtils';
import useRealtimeUpdates from './useRealtimeUpdates';
import { subscribeAccountsChanged } from '../utils/accountRefreshEvents.jsx';
import { applyTransactionPatch } from '../utils/transactionPatchUtils.jsx';

function isActiveAccount(account) {
  return account?.is_active !== 0 && String(account?.account_status || 'active') === 'active';
}

/**
 * Loads accounts + consolidated transactions (single source of truth per account).
 */
export default function useConsolidatedTransactions({ activeOnly = true } = {}) {
  const [accounts, setAccounts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadRef = useRef(null);
  const categoriesRef = useRef([]);
  /** Skip redundant realtime full/patch updates right after a local optimistic patch. */
  const skipRealtimePatchUntilRef = useRef(new Map());
  const accountsReloadTimerRef = useRef(null);

  useEffect(() => {
    categoriesRef.current = categories;
  }, [categories]);

  const shouldSkipRealtimePatch = useCallback((txId) => {
    const until = skipRealtimePatchUntilRef.current.get(String(txId));
    if (!until) return false;
    if (until > Date.now()) return true;
    skipRealtimePatchUntilRef.current.delete(String(txId));
    return false;
  }, []);

  const loadRegisterData = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError(null);
    }
    try {
      const userResult = await window.electronAPI?.getCurrentUser?.();
      const uid = userResult?.success ? userResult.data?.id : null;

      const accountsResult = await loadAllAccountsViaApi();
      const acctList = accountsResult.success ? accountsResult.data || [] : [];
      const filteredAccounts = activeOnly ? acctList.filter(isActiveAccount) : acctList;
      setAccounts(acctList);

      const nameMap = new Map(
        filteredAccounts.filter((a) => a?.id).map((a) => [String(a.id), a.name || 'Account'])
      );
      const activeIds = new Set(filteredAccounts.map((a) => String(a.id)));

      let txRows = [];
      if (window.electronAPI?.getTransactions) {
        const txResult = await window.electronAPI.getTransactions({});
        if (txResult?.success && Array.isArray(txResult.data)) {
          txRows = txResult.data;
        }
      } else {
        for (const account of filteredAccounts) {
          try {
            const part = await window.electronAPI.getAccountTransactions(account.id);
            if (part?.success && part.data) {
              txRows.push(
                ...part.data.map((tx) => ({
                  ...tx,
                  account_name: nameMap.get(String(tx.account_id)) || account.name,
                }))
              );
            }
          } catch (e) {
            console.warn('Account tx load failed', account.id, e);
          }
        }
      }

      const enriched = txRows
        .filter((tx) => !activeOnly || activeIds.has(String(tx.account_id)))
        .map((tx) => ({
          ...tx,
          account_name: tx.account_name || nameMap.get(String(tx.account_id)) || '—',
        }));

      setTransactions(enriched);

      if (uid && window.electronAPI?.getCategories) {
        const catResult = await window.electronAPI.getCategories(uid);
        if (catResult?.success) setCategories(catResult.data || []);
      }
    } catch (err) {
      console.error('useConsolidatedTransactions load error:', err);
      if (!quiet) setError(err.message || 'Failed to load transactions');
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [activeOnly]);

  loadRef.current = loadRegisterData;

  const patchTransaction = useCallback((id, patch, { local = false } = {}) => {
    if (id == null || !patch) return;
    if (local) {
      skipRealtimePatchUntilRef.current.set(String(id), Date.now() + 2500);
    }
    setTransactions((prev) => {
      const idx = prev.findIndex((t) => String(t.id) === String(id));
      if (idx < 0) return prev;
      const merged = applyTransactionPatch(prev[idx], patch, {
        categories: categoriesRef.current,
      });
      const next = [...prev];
      next[idx] = merged;
      return next;
    });
  }, []);

  const removeTransaction = useCallback((id) => {
    if (id == null) return;
    setTransactions((prev) => prev.filter((t) => String(t.id) !== String(id)));
  }, []);

  const handleRealtimeUpdate = useCallback((eventType, data) => {
    const txId = data?.id ?? data?.transaction_id;
    if (eventType === 'transaction:updated') {
      if (txId != null) {
        if (!shouldSkipRealtimePatch(txId)) {
          patchTransaction(txId, data);
        }
        return;
      }
      loadRef.current({ quiet: true });
      return;
    }
    if (eventType === 'transaction:deleted' && txId != null) {
      if (!shouldSkipRealtimePatch(txId)) {
        removeTransaction(txId);
      }
      return;
    }
    if (eventType === 'transaction:added') {
      loadRef.current({ quiet: true });
    }
  }, [patchTransaction, removeTransaction, shouldSkipRealtimePatch]);

  useEffect(() => {
    loadRegisterData();
    const scheduleAccountsReload = () => {
      if (accountsReloadTimerRef.current) clearTimeout(accountsReloadTimerRef.current);
      accountsReloadTimerRef.current = setTimeout(() => {
        accountsReloadTimerRef.current = null;
        loadRef.current({ quiet: true });
      }, 400);
    };
    return subscribeAccountsChanged(scheduleAccountsReload);
  }, [loadRegisterData]);

  useEffect(
    () => () => {
      if (accountsReloadTimerRef.current) clearTimeout(accountsReloadTimerRef.current);
    },
    []
  );

  useRealtimeUpdates(
    ['transaction:added', 'transaction:updated', 'transaction:deleted', 'transaction:patched'],
    (eventType, data) => {
      if (eventType === 'transaction:patched') {
        const txId = data?.id ?? data?.transaction_id;
        if (txId != null && !shouldSkipRealtimePatch(txId)) {
          patchTransaction(txId, data);
        }
        return;
      }
      handleRealtimeUpdate(eventType, data);
    }
  );

  const activeAccounts = useMemo(
    () => (activeOnly ? accounts.filter(isActiveAccount) : accounts),
    [accounts, activeOnly]
  );

  const accountNameById = useMemo(() => {
    const map = new Map();
    for (const a of accounts) {
      if (a?.id) map.set(String(a.id), a.name || 'Account');
    }
    return map;
  }, [accounts]);

  return {
    accounts,
    activeAccounts,
    transactions,
    categories,
    loading,
    error,
    accountNameById,
    reload: loadRegisterData,
    patchTransaction,
    removeTransaction,
  };
}
