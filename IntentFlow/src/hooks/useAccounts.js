import { useState, useEffect, useCallback } from 'react';

/**
 * Active accounts summary + refresh on accounts-updated (plan §8.1).
 */
export function useAccounts(userId) {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!userId || !window.electronAPI?.getAccountsSummary) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await window.electronAPI.getAccountsSummary(userId);
      if (res?.success) {
        setAccounts(res.data || []);
        setError(null);
      } else {
        setError(res?.error || 'Failed to load accounts');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refresh();
    const unsub = window.electronAPI?.onAccountsUpdated?.(() => refresh());
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [refresh]);

  return { accounts, loading, error, refresh };
}
