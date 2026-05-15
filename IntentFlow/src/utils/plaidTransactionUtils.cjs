/** Main-process mirror of plaidTransactionUtils.jsx */
const PLAID_TXN_EDITABLE_FIELDS = new Set([
  'category_id',
  'memo',
  'payee',
  'is_cleared',
  'check_number',
]);

const PLAID_TXN_LOCKED_FIELDS = new Set([
  'amount',
  'date',
  'description',
  'account_id',
  'plaid_transaction_id',
]);

function isPlaidImportedTransaction(transaction) {
  return Boolean(transaction?.plaid_transaction_id);
}

function filterPlaidTransactionUpdates(transaction, updates = {}) {
  if (!isPlaidImportedTransaction(transaction)) {
    return { updates, removed: [] };
  }
  const filtered = {};
  const removed = [];
  for (const [key, value] of Object.entries(updates)) {
    if (PLAID_TXN_EDITABLE_FIELDS.has(key)) {
      filtered[key] = value;
    } else if (key in updates) {
      removed.push(key);
    }
  }
  return { updates: filtered, removed };
}

module.exports = {
  PLAID_TXN_EDITABLE_FIELDS,
  PLAID_TXN_LOCKED_FIELDS,
  isPlaidImportedTransaction,
  filterPlaidTransactionUpdates,
};
