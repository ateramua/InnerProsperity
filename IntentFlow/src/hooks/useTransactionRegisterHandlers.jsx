import { normalizeInlineTransactionUpdates } from '../utils/transferPayeeUtils.jsx';

/**
 * IPC handlers for consolidated transaction register views.
 */
export function createTransactionRegisterHandlers(reload, { patchTransaction, removeTransaction } = {}) {
  const refresh = () => reload({ quiet: true });
  const canPatch = typeof patchTransaction === 'function';

  const handleUpdateTransaction = async (id, updates) => {
    const apiUpdates = normalizeInlineTransactionUpdates(updates);
    if (canPatch) {
      patchTransaction(id, apiUpdates, { local: true });
    }
    try {
      const result = await window.electronAPI.updateTransaction(id, apiUpdates);
      if (result?.success) {
        const structuralTransferChange =
          apiUpdates.destinationAccountId != null || apiUpdates.convertToRegular === true;
        if (structuralTransferChange) {
          await refresh();
        } else if (canPatch) {
          if (result.data) {
            patchTransaction(id, result.data, { local: true });
          }
        } else {
          await refresh();
        }
        return { success: true };
      }
      if (canPatch) {
        await refresh();
      }
      return { success: false, error: result?.error };
    } catch (e) {
      if (canPatch) {
        await refresh();
      }
      return { success: false, error: e.message };
    }
  };

  const handleDeleteTransaction = async (id) => {
    try {
      const result = await window.electronAPI.deleteTransaction(id);
      if (result?.success) {
        if (typeof removeTransaction === 'function') {
          removeTransaction(id);
        } else {
          await refresh();
        }
        return { success: true };
      }
      return { success: false, error: result?.error };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  const handleToggleCleared = async (id, clearedStatus) => {
    try {
      const result = await window.electronAPI.toggleTransactionCleared(id, clearedStatus);
      if (result?.success) {
        if (canPatch) {
          patchTransaction(
            id,
            {
              is_cleared: clearedStatus ? 1 : 0,
              cleared: clearedStatus ? 1 : 0,
              ...(result.data || {}),
            },
            { local: true }
          );
        } else {
          await refresh();
        }
        return { success: true };
      }
      return { success: false, error: result?.error };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  const handleBulkDelete = async (ids) => {
    try {
      if (window.electronAPI?.bulkDeleteTransactions) {
        const result = await window.electronAPI.bulkDeleteTransactions(ids);
        if (result?.success !== false) {
          if (typeof removeTransaction === 'function') {
            for (const id of ids) removeTransaction(id);
          } else {
            await refresh();
          }
          return { success: true };
        }
        return { success: false, error: result?.error };
      }
      for (const id of ids) {
        await window.electronAPI.deleteTransaction(id);
      }
      await refresh();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  const handleBulkUpdate = async (_action, ids, payload) => {
    try {
      if (window.electronAPI?.bulkUpdateTransactions) {
        const result = await window.electronAPI.bulkUpdateTransactions(ids, payload);
        if (result?.success !== false) {
          await refresh();
          return { success: true, data: result?.data };
        }
        return { success: false, error: result?.error };
      }
      for (const id of ids) {
        await window.electronAPI.updateTransaction(id, payload);
      }
      await refresh();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  return {
    handleUpdateTransaction,
    handleDeleteTransaction,
    handleToggleCleared,
    handleBulkDelete,
    handleBulkUpdate,
  };
}
