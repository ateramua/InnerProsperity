/**
 * IPC handlers for consolidated transaction register views.
 */
export function createTransactionRegisterHandlers(reload) {
  const refresh = () => reload({ quiet: true });

  const handleUpdateTransaction = async (id, updates) => {
    try {
      const result = await window.electronAPI.updateTransaction(id, updates);
      if (result?.success) {
        await refresh();
        return { success: true };
      }
      return { success: false, error: result?.error };
    } catch (e) {
      return { success: false, error: e.message };
    }
  };

  const handleDeleteTransaction = async (id) => {
    try {
      const result = await window.electronAPI.deleteTransaction(id);
      if (result?.success) {
        await refresh();
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
        await refresh();
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
          await refresh();
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
