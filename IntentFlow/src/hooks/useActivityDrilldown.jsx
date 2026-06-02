import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  readActivityDrilldownPayload,
  clearActivityDrilldown,
  filtersFromActivityDrilldown,
  fetchActivityDrilldownTransactionIds,
  computeLocalActivityTransactionIds,
  drilldownBannerLabel,
  persistBudgetReturnMonth,
  pickPrimaryActivityFocusId,
  confirmActivityIdsInRegister,
  formatActivityFocusPayee,
} from '../utils/activityDrilldownUtils.jsx';

/**
 * Consumes session drill-down payload and loads activity transaction IDs for highlighting.
 * Drill-down is read synchronously on mount so filters apply on the first render.
 */
export default function useActivityDrilldown({ categories = [], transactions = [] } = {}) {
  const [drilldown, setDrilldown] = useState(() => readActivityDrilldownPayload());
  const [highlightIds, setHighlightIds] = useState([]);
  const [idsLoading, setIdsLoading] = useState(false);
  const fetchedForRef = useRef(null);

  const refreshHighlightIds = useCallback(async (payload, txList) => {
    if (!payload?.categoryId || !payload?.month) return;
    setIdsLoading(true);
    try {
      const ids = await fetchActivityDrilldownTransactionIds(
        payload.categoryId,
        payload.month,
        txList
      );
      setHighlightIds(ids);
    } finally {
      setIdsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!drilldown) return;
    const key = `${drilldown.categoryId}:${drilldown.month}:${transactions.length}`;
    if (fetchedForRef.current === key) return;
    fetchedForRef.current = key;
    refreshHighlightIds(drilldown, transactions);
  }, [drilldown, transactions, refreshHighlightIds]);

  const initialFilters = useMemo(
    () => (drilldown ? filtersFromActivityDrilldown(drilldown) : null),
    [drilldown]
  );

  const highlightIdSet = useMemo(() => {
    if (highlightIds.length) {
      return new Set(highlightIds.map(String));
    }
    if (drilldown && transactions.length) {
      return new Set(
        computeLocalActivityTransactionIds(
          transactions,
          drilldown.categoryId,
          drilldown.month
        )
      );
    }
    return new Set();
  }, [highlightIds, drilldown, transactions]);

  const confirmedActivityIds = useMemo(() => {
    const source = highlightIds.length
      ? highlightIds
      : drilldown && transactions.length
        ? computeLocalActivityTransactionIds(
            transactions,
            drilldown.categoryId,
            drilldown.month
          )
        : [];
    return confirmActivityIdsInRegister(transactions, source);
  }, [highlightIds, drilldown, transactions]);

  const focusTransactionId = useMemo(
    () =>
      drilldown
        ? pickPrimaryActivityFocusId(
            transactions,
            confirmedActivityIds.length ? confirmedActivityIds : [...highlightIdSet],
            categories
          )
        : null,
    [drilldown, transactions, confirmedActivityIds, highlightIdSet, categories]
  );

  const focusPayeeLabel = useMemo(
    () => formatActivityFocusPayee(transactions, focusTransactionId),
    [transactions, focusTransactionId]
  );

  const bannerLabel = useMemo(
    () => drilldownBannerLabel(drilldown, categories),
    [drilldown, categories]
  );

  const clearDrilldown = useCallback(() => {
    clearActivityDrilldown();
    setDrilldown(null);
    setHighlightIds([]);
    fetchedForRef.current = null;
  }, []);

  const prepareReturnToBudget = useCallback(() => {
    if (drilldown?.month) {
      persistBudgetReturnMonth(drilldown.month);
    }
    clearDrilldown();
  }, [drilldown, clearDrilldown]);

  const filteredMatchCount = useMemo(() => {
    if (!drilldown || !transactions.length) return null;
    const ids = confirmedActivityIds.length ? confirmedActivityIds : [...highlightIdSet];
    if (!ids.length) return null;
    return ids.length;
  }, [drilldown, transactions, confirmedActivityIds, highlightIdSet]);

  const emptyDrilldownMessage =
    drilldown && !idsLoading && filteredMatchCount === 0
      ? 'No transactions found for this category in the selected month.'
      : null;

  return {
    drilldown,
    highlightIds,
    highlightIdSet,
    confirmedActivityIds,
    focusTransactionId,
    focusPayeeLabel,
    initialFilters,
    bannerLabel,
    idsLoading,
    clearDrilldown,
    prepareReturnToBudget,
    emptyDrilldownMessage,
  };
}
