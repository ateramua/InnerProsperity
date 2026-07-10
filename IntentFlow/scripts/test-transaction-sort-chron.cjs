/**
 * Quick sanity check: register display order + running-balance adjacency.
 * Run: node scripts/test-transaction-sort-chron.cjs
 */

const {
  sortRegisterDisplayOrder,
  compareTransactionsChronologically,
} = require('../src/utils/transactionSortUtils.jsx');

const txs = [
  { id: 3, date: '2024-01-15', created_at: '2024-01-15T12:00:00Z', amount: -10 },
  { id: 1, date: '2024-01-15', created_at: '2024-01-15T10:00:00Z', amount: 100 },
  { id: 2, date: '2024-01-15', created_at: '2024-01-15T11:00:00Z', amount: -50 },
  { id: 4, date: '2024-01-10', created_at: '2024-01-10T09:00:00Z', amount: 500 },
];

const sorted = sortRegisterDisplayOrder(txs);
const ids = sorted.map((t) => t.id);
if (JSON.stringify(ids) !== JSON.stringify([3, 2, 1, 4])) {
  console.error('FAIL register order', ids);
  process.exit(1);
}

const chron = [...txs].sort(compareTransactionsChronologically).map((t) => t.id);
if (JSON.stringify(chron) !== JSON.stringify([4, 1, 2, 3])) {
  console.error('FAIL chron order', chron);
  process.exit(1);
}

console.log('OK transaction sort chron');
