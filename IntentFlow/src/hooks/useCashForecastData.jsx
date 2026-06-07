import { useCallback, useEffect, useMemo, useState } from 'react';
import useConsolidatedTransactions from './useConsolidatedTransactions';
import { formatBudgetMonthKey } from '../utils/budgetMonthUtils.jsx';
import useRealtimeUpdates from './useRealtimeUpdates';

function mapSnapshotCategory(cat) {
  return {
    id: cat.id,
    name: cat.name,
    assigned: Number(cat.budgeted_amount ?? cat.assigned ?? 0),
    activity: Number(cat.activity ?? 0),
    available: Number(cat.available ?? 0),
    target_amount: Number(cat.target_amount ?? 0),
    target_type: cat.target_type || null,
    target_date: cat.target_date || null,
    archived: cat.archived,
    groupId: cat.group_id ?? cat.groupId,
  };
}

/**
 * Loads accounts, transactions, budget categories, and scheduled transactions for Cash Forecast.
 */
export default function useCashForecastData() {
  const {
    accounts: allAccounts,
    transactions,
    loading: txLoading,
    reload: reloadTx,
  } = useConsolidatedTransactions({ activeOnly: true });

  const [budgetCategories, setBudgetCategories] = useState([]);
  const [scheduledTransactions, setScheduledTransactions] = useState([]);
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [userId, setUserId] = useState('default');

  const loadBudgetAndScheduled = useCallback(async () => {
    if (!window.electronAPI?.getCurrentUser) {
      setBudgetLoading(false);
      return;
    }
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      const uid = userResult?.success ? userResult.data?.id : null;
      if (!uid) return;
      setUserId(String(uid));
      const monthKey = formatBudgetMonthKey(new Date());
      if (window.electronAPI.getBudgetMonthSnapshot) {
        const snap = await window.electronAPI.getBudgetMonthSnapshot(uid, monthKey);
        if (snap?.success && Array.isArray(snap.data?.categories)) {
          setBudgetCategories(snap.data.categories.map(mapSnapshotCategory));
        }
      } else if (window.electronAPI.getCategories) {
        const cats = await window.electronAPI.getCategories(uid, monthKey);
        if (cats?.success && Array.isArray(cats.data)) {
          setBudgetCategories(cats.data.map(mapSnapshotCategory));
        }
      }

      if (window.electronAPI.listCashForecastScheduled) {
        const sched = await window.electronAPI.listCashForecastScheduled();
        if (sched?.success && Array.isArray(sched.data)) {
          setScheduledTransactions(sched.data);
        }
      }
    } catch (e) {
      console.warn('Cash forecast budget load failed', e);
    } finally {
      setBudgetLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBudgetAndScheduled();
  }, [loadBudgetAndScheduled]);

  useRealtimeUpdates(
    ['prosperity:updated', 'budget:assigned', 'budget:bulkAssigned', 'budget:moved'],
    () => loadBudgetAndScheduled(),
  );

  const { cashAccounts, creditCards, loans } = useMemo(() => {
    const cash = [];
    const credit = [];
    const loanList = [];
    for (const a of allAccounts || []) {
      const type = String(a?.type || '').toLowerCase();
      if (type === 'credit') credit.push(a);
      else if (type === 'loan' || type === 'mortgage') loanList.push(a);
      else cash.push(a);
    }
    return { cashAccounts: cash, creditCards: credit, loans: loanList };
  }, [allAccounts]);

  return {
    userId,
    accounts: cashAccounts,
    creditCards,
    loans,
    transactions,
    scheduledTransactions,
    budgetData: { categories: budgetCategories },
    loading: txLoading || budgetLoading,
    reload: () => {
      reloadTx({ quiet: true });
      loadBudgetAndScheduled();
    },
  };
}
