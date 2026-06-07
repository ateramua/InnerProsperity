/**
 * Helpers for bulk transaction selection in register tables.
 * IDs are normalized to strings so Set membership matches checkbox state.
 */

export function normalizeTransactionId(id) {
  if (id === null || id === undefined || id === '') return null;
  return String(id);
}

/** @param {Iterable<string|number>} selected */
export function pruneTransactionSelection(selected, transactionList) {
  const valid = new Set(
    (transactionList || [])
      .map((t) => normalizeTransactionId(t?.id))
      .filter(Boolean),
  );
  const pruned = new Set();
  for (const id of selected || []) {
    const key = normalizeTransactionId(id);
    if (key && valid.has(key)) pruned.add(key);
  }
  return pruned;
}

export function isTransactionSelected(selected, txId) {
  const key = normalizeTransactionId(txId);
  if (!key || !(selected instanceof Set)) return false;
  return selected.has(key);
}

export function countSelectedInList(selected, transactionList) {
  if (!(selected instanceof Set) || selected.size === 0) return 0;
  const valid = new Set(
    (transactionList || [])
      .map((t) => normalizeTransactionId(t?.id))
      .filter(Boolean),
  );
  let count = 0;
  for (const id of selected) {
    const key = normalizeTransactionId(id);
    if (key && valid.has(key)) count += 1;
  }
  return count;
}
