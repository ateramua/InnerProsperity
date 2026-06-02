import React, { useMemo, useState } from 'react';
import TransactionToolbar from './TransactionToolbar.jsx';
import TransactionTable from './TransactionTable.jsx';
import {
  DEFAULT_TRANSACTION_FILTERS,
  filterTransactions,
} from '../../utils/transactionFilterUtils.jsx';
import { DEFAULT_TRANSACTION_SORT, sortTransactions } from '../../utils/transactionSortUtils.jsx';

/**
 * Import preview using the same toolbar + table layout as post-import transaction views.
 */
export default function ImportTransactionPreview({
  transactions = [],
  categories = [],
  title = 'Import preview',
}) {
  const [filters, setFilters] = useState({ ...DEFAULT_TRANSACTION_FILTERS });
  const [sort, setSort] = useState(DEFAULT_TRANSACTION_SORT);

  const filtered = useMemo(
    () => filterTransactions(transactions, filters, { categories }),
    [transactions, filters, categories]
  );

  const sorted = useMemo(
    () => sortTransactions(filtered, sort, { categories }),
    [filtered, sort, categories]
  );

  if (!transactions.length) return null;

  return (
    <div style={styles.wrap}>
      <h4 style={styles.title}>{title}</h4>
      <div style={styles.panel}>
        <TransactionToolbar
          filters={filters}
          onFiltersChange={setFilters}
          categories={categories}
          accounts={[]}
          hideAccountFilter
          resultCount={sorted.length}
          totalCount={transactions.length}
        />
        <TransactionTable
          transactions={sorted}
          categories={categories}
          sort={sort}
          onSortChange={setSort}
          emptyMessage="No rows match your search or filters"
        />
      </div>
    </div>
  );
}

const styles = {
  wrap: {
    marginTop: '1rem',
  },
  title: {
    margin: '0 0 0.5rem',
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#e2e8f0',
  },
  panel: {
    border: '1px solid #334155',
    borderRadius: '8px',
    overflow: 'auto',
    maxHeight: 'min(50vh, 420px)',
    background: '#1e293b',
  },
};
