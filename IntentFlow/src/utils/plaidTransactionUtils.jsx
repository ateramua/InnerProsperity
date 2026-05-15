/** Fields users may change on bank-imported transactions (plan §3.2). */
export const PLAID_TXN_EDITABLE_FIELDS = new Set([
  'category_id',
  'memo',
  'payee',
  'is_cleared',
  'check_number',
]);

export const PLAID_TXN_LOCKED_FIELDS = new Set([
  'amount',
  'date',
  'description',
  'account_id',
  'plaid_transaction_id',
]);

export function isPlaidImportedTransaction(transaction) {
  return Boolean(transaction?.plaid_transaction_id);
}

/**
 * Strip disallowed updates for Plaid-imported rows; returns filtered updates + removed keys.
 */
export function filterPlaidTransactionUpdates(transaction, updates = {}) {
  if (!isPlaidImportedTransaction(transaction)) {
    return { updates, removed: [] };
  }
  const filtered = {};
  const removed = [];
  for (const [key, value] of Object.entries(updates)) {
    if (PLAID_TXN_EDITABLE_FIELDS.has(key)) {
      filtered[key] = value;
    } else if (PLAID_TXN_LOCKED_FIELDS.has(key) || key in updates) {
      removed.push(key);
    }
  }
  return { updates: filtered, removed };
}
