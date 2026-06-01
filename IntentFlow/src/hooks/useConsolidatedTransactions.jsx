import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { loadAllAccountsViaApi } from '../utils/cashAccountUtils';
import useRealtimeUpdates from './useRealtimeUpdates';
import { subscribeAccountsChanged } from '../utils/accountRefreshEvents.jsx';

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

  useEffect(() => {
    loadRegisterData();
    return subscribeAccountsChanged(() => loadRef.current({ quiet: true }));
  }, [loadRegisterData]);

  useRealtimeUpdates(
    ['transaction:added', 'transaction:updated', 'transaction:deleted'],
    () => loadRef.current({ quiet: true })
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
  };
}
