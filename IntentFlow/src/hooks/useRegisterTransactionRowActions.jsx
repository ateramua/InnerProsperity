import { useCallback, useState } from 'react';

/**
 * Row-level actions for account register tables (delete, cleared, split modal).
 */
export default function useRegisterTransactionRowActions({ onAfterMutation } = {}) {
  const [splitTransaction, setSplitTransaction] = useState(null);

  const refresh = useCallback(async () => {
    if (onAfterMutation) {
      await onAfterMutation();
    }
  }, [onAfterMutation]);

  const handleDeleteRow = useCallback(
    async (txId) => {
      if (!window.electronAPI?.deleteTransaction) {
        alert('Delete is not available.');
        return;
      }
      if (!confirm('Are you sure you want to delete this transaction?')) return;
      try {
        const result = await window.electronAPI.deleteTransaction(txId);
        if (!result?.success) {
          alert(result?.error || 'Error deleting transaction');
          return;
        }
        await refresh();
      } catch (e) {
        alert(e?.message || 'Error deleting transaction');
      }
    },
    [refresh]
  );

  const handleToggleClearedRow = useCallback(
    async (txId, currentCleared) => {
      if (!window.electronAPI?.toggleTransactionCleared) {
        alert('Cleared toggle is not available.');
        return;
      }
      try {
        const result = await window.electronAPI.toggleTransactionCleared(
          txId,
          currentCleared ? 0 : 1
        );
        if (!result?.success) {
          alert(result?.error || 'Could not update cleared status');
          return;
        }
        await refresh();
      } catch (e) {
        alert(e?.message || 'Could not update cleared status');
      }
    },
    [refresh]
  );

  const handleSplitSaved = useCallback(async () => {
    setSplitTransaction(null);
    await refresh();
  }, [refresh]);

  return {
    splitTransaction,
    setSplitTransaction,
    handleDeleteRow,
    handleToggleClearedRow,
    handleSplitSaved,
  };
}
