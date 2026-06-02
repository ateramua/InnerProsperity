import { useCallback, useMemo } from 'react';
import useTransactionPayees from './useTransactionPayees.jsx';
import { applyTransactionPatch } from '../utils/transactionPatchUtils.jsx';
import { isPlaidImportedTransaction } from '../utils/plaidTransactionUtils.jsx';
import {
  isTransferTransaction,
  normalizeInlineTransactionUpdates,
} from '../utils/transferPayeeUtils.jsx';
import {
  isReadyToAssignSentinel,
  isIncomeTransaction,
  READY_TO_ASSIGN_VALIDATION_MSG,
  validateReadyToAssignSelection,
} from '../utils/readyToAssignCategory.jsx';

/**
 * Inline payee/category edits for account register tables (AccountDetailView, accounts/[id]).
 */
export default function useRegisterTableInlineEdit({
  accountId,
  transactions,
  allTransactions = null,
  setTransactions,
  setAllTransactions,
  categories = [],
}) {
  const { payees: registerPayees, loading: registerPayeesLoading } = useTransactionPayees(
    accountId ?? null
  );

  const categoryList = useMemo(() => categories || [], [categories]);

  const patchInLists = useCallback(
    (txId, patch) => {
      const apply = (list) =>
        (list || []).map((t) =>
          String(t.id) === String(txId)
            ? applyTransactionPatch(t, patch, { categories: categoryList })
            : t
        );
      if (setTransactions) setTransactions((prev) => apply(prev));
      if (setAllTransactions) setAllTransactions((prev) => apply(prev));
    },
    [setTransactions, setAllTransactions, categoryList]
  );

  const findTransaction = useCallback(
    (txId) => {
      const id = String(txId);
      for (const list of [allTransactions, transactions]) {
        const found = (list || []).find((t) => String(t.id) === id);
        if (found) return found;
      }
      return null;
    },
    [allTransactions, transactions]
  );

  const handleInlineUpdate = useCallback(
    async (txId, updates) => {
      const tx = findTransaction(txId);
      if (!tx) return { success: false, error: 'Transaction not found' };

      if (tx.is_system === 1) {
        return { success: false, error: 'System transactions cannot be edited' };
      }

      const payeeChange =
        updates.payee !== undefined ||
        updates.description !== undefined;
      if (payeeChange && isPlaidImportedTransaction(tx) && tx.is_transfer !== 1) {
        alert(
          'Bank-imported transactions cannot change payee here. Use Edit or change category only.'
        );
        return { success: false };
      }

      const categoryChange =
        updates.category_id !== undefined || updates.categoryId !== undefined;
      if (categoryChange && isTransferTransaction(tx)) {
        return { success: false, error: 'Transfers do not use a category' };
      }

      const rawCategory = updates.category_id ?? updates.categoryId;
      if (categoryChange && isReadyToAssignSentinel(rawCategory)) {
        const check = validateReadyToAssignSelection(rawCategory, {
          isIncome: isIncomeTransaction(tx),
          isTransfer: isTransferTransaction(tx),
        });
        if (!check.ok) {
          alert(check.message || READY_TO_ASSIGN_VALIDATION_MSG);
          return { success: false, error: check.message };
        }
      }

      const apiUpdates = normalizeInlineTransactionUpdates(updates);

      try {
        patchInLists(txId, apiUpdates);
        const result = await window.electronAPI.updateTransaction(txId, apiUpdates);
        if (!result?.success) {
          alert(result?.error || 'Could not save changes');
          return { success: false, error: result?.error };
        }
        const structuralTransferChange =
          apiUpdates.destinationAccountId != null || apiUpdates.convertToRegular === true;
        if (structuralTransferChange) {
          window.dispatchEvent(new CustomEvent('accounts-updated'));
        } else {
          patchInLists(txId, result.data || apiUpdates);
        }
        return { success: true };
      } catch (e) {
        alert(e.message || 'Could not save changes');
        return { success: false, error: e.message };
      }
    },
    [findTransaction, patchInLists]
  );

  const isInlineEditDisabled = useCallback((tx) => tx?.is_system === 1, []);

  const isCategoryInlineDisabled = useCallback((tx) => tx?.is_system === 1, []);

  const isPayeeInlineDisabled = useCallback(
    (tx) => tx?.is_system === 1 || (isPlaidImportedTransaction(tx) && tx?.is_transfer !== 1),
    []
  );

  return {
    registerPayees,
    registerPayeesLoading,
    handleInlineUpdate,
    isInlineEditDisabled,
    isCategoryInlineDisabled,
    isPayeeInlineDisabled,
  };
}
