import { useState, useEffect, useCallback } from 'react';

/**
 * Linked Plaid items for the current user (safe DTOs from main process).
 */
export function usePlaidItems() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!window.electronAPI?.getLinkedItems) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (window.electronAPI.getPlaidConfigStatus) {
        const cfg = await window.electronAPI.getPlaidConfigStatus();
        if (cfg?.success) setConfigured(cfg.data?.configured !== false && cfg.data?.enabled !== false);
      }
      const res = await window.electronAPI.getLinkedItems();
      if (res?.success) {
        setItems(res.data || []);
        setError(null);
      } else {
        setError(res?.error || 'Failed to load linked banks');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const unsub = window.electronAPI?.onAccountsUpdated?.(() => {
      refresh();
    });
    return () => {
      if (typeof unsub === 'function') unsub();
    };
  }, [refresh]);

  const needsReconnect = items.some((i) => i.status === 'login_required');

  return { items, loading, configured, error, needsReconnect, refresh };
}
