import React, { useState, useMemo } from 'react';
import {
  DEFAULT_TRANSACTION_SORT,
  sortTransactions,
} from '../utils/transactionSortUtils.jsx';
import {
  DEFAULT_TRANSACTION_FILTERS,
  filterTransactions,
} from '../utils/transactionFilterUtils.jsx';
import TransactionToolbar from './transactions/TransactionToolbar.jsx';
import TransactionTable from './transactions/TransactionTable.jsx';

const editStyles = {
  input: {
    width: '100%',
    padding: '0.4rem',
    background: '#111827',
    border: '1px solid #10B981',
    borderRadius: '0.375rem',
    color: 'white',
    fontSize: '0.875rem',
  },
  select: {
    width: '100%',
    padding: '0.4rem',
    background: '#111827',
    border: '1px solid #10B981',
    borderRadius: '0.375rem',
    color: 'white',
    fontSize: '0.875rem',
  },
  td: {
    padding: '0.75rem 1rem',
    background: 'rgba(16, 185, 129, 0.08)',
    borderBottom: '1px solid #374151',
  },
  actionBtn: {
    padding: '0.25rem 0.5rem',
    borderRadius: '0.375rem',
    border: 'none',
    cursor: 'pointer',
    fontSize: '0.75rem',
    marginRight: '0.35rem',
  },
};

const TransactionManager = ({
  transactions,
  categories,
  accounts,
  onUpdateTransaction,
  onDeleteTransaction,
  onToggleCleared,
  showAccountColumn = true,
  hideAccountFilter = false,
}) => {
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [sort, setSort] = useState(DEFAULT_TRANSACTION_SORT);
  const [filters, setFilters] = useState({ ...DEFAULT_TRANSACTION_FILTERS });

  const filtered = useMemo(
    () => filterTransactions(transactions, filters, { categories, accounts }),
    [transactions, filters, categories, accounts]
  );

  const sortedTransactions = useMemo(
    () => sortTransactions(filtered, sort, { categories }),
    [filtered, sort, categories]
  );

  const handleEdit = (transaction) => {
    setEditingId(transaction.id);
    setEditForm({
      date: transaction.date,
      payee: transaction.payee || transaction.description || '',
      categoryId: transaction.category_id || '',
      amount: Math.abs(transaction.amount),
      type: transaction.amount < 0 ? 'outflow' : 'inflow',
      memo: transaction.memo || '',
      cleared: transaction.is_cleared === 1 || transaction.cleared === 1,
    });
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    const amountMag = parseFloat(editForm.amount);
    if (!Number.isFinite(amountMag) || amountMag === 0) {
      alert('Please enter a valid amount');
      return;
    }
    const signedAmount = editForm.type === 'outflow' ? -Math.abs(amountMag) : Math.abs(amountMag);
    const updateData = {
      date: editForm.date,
      payee: editForm.payee,
      description: editForm.payee,
      amount: signedAmount,
      category_id:
        editForm.categoryId === 'inflow_ready_to_assign' ? null : editForm.categoryId || null,
      memo: editForm.memo || null,
      cleared: editForm.cleared ? 1 : 0,
    };
    if (onUpdateTransaction) {
      const result = await onUpdateTransaction(editingId, updateData);
      if (result?.success) {
        setEditingId(null);
        setEditForm({});
      }
    }
  };

  const handleDelete = async (id) => {
    if (confirm('Are you sure you want to delete this transaction?')) {
      const result = await onDeleteTransaction(id);
      if (!result || !result.success) {
        alert('Error deleting transaction');
      }
    }
  };

  const handleToggleCleared = async (id, currentStatus) => {
    const result = await onToggleCleared(id, currentStatus ? 0 : 1);
    if (!result || !result.success) {
      alert('Error toggling cleared status');
    }
  };

  const renderEditRow = (tx) => (
    <tr key={tx.id}>
      {showAccountColumn && (
        <td style={editStyles.td}>{tx.account_name || '—'}</td>
      )}
      <td style={editStyles.td}>
        <input
          type="date"
          value={editForm.date || ''}
          onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
          style={editStyles.input}
        />
      </td>
      <td style={editStyles.td}>
        <input
          type="text"
          value={editForm.payee || ''}
          onChange={(e) => setEditForm({ ...editForm, payee: e.target.value })}
          style={editStyles.input}
        />
      </td>
      <td style={editStyles.td}>
        <select
          value={editForm.categoryId || ''}
          onChange={(e) => setEditForm({ ...editForm, categoryId: e.target.value })}
          style={editStyles.select}
        >
          <option value="">Select category</option>
          {(categories || []).map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </td>
      <td style={editStyles.td}>
        {editForm.type === 'outflow' ? (
          <input
            type="number"
            value={editForm.amount || ''}
            onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
            style={editStyles.input}
            step="0.01"
            min="0"
          />
        ) : null}
      </td>
      <td style={editStyles.td}>
        {editForm.type === 'inflow' ? (
          <input
            type="number"
            value={editForm.amount || ''}
            onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
            style={editStyles.input}
            step="0.01"
            min="0"
          />
        ) : null}
        <select
          value={editForm.type || 'outflow'}
          onChange={(e) => setEditForm({ ...editForm, type: e.target.value })}
          style={{ ...editStyles.select, marginTop: editForm.type === 'inflow' ? 0 : '0.35rem' }}
        >
          <option value="outflow">Outflow</option>
          <option value="inflow">Inflow</option>
        </select>
      </td>
      <td style={editStyles.td}>
        <input
          type="checkbox"
          checked={editForm.cleared || false}
          onChange={(e) => setEditForm({ ...editForm, cleared: e.target.checked })}
          title="Cleared"
        />
        <button
          type="button"
          style={{ ...editStyles.actionBtn, background: '#10B981', color: 'white' }}
          onClick={handleSaveEdit}
        >
          Save
        </button>
        <button
          type="button"
          style={{ ...editStyles.actionBtn, background: '#6B7280', color: 'white' }}
          onClick={() => setEditingId(null)}
        >
          Cancel
        </button>
      </td>
    </tr>
  );

  return (
    <div style={{ width: '100%' }}>
      <div
        style={{
          background: '#1F2937',
          borderRadius: '0.75rem',
          overflow: 'hidden',
          border: '1px solid #374151',
        }}
      >
        <TransactionToolbar
          filters={filters}
          onFiltersChange={setFilters}
          categories={categories}
          accounts={accounts}
          hideAccountFilter={hideAccountFilter}
          resultCount={sortedTransactions.length}
          totalCount={(transactions || []).length}
        />
        <TransactionTable
          transactions={sortedTransactions}
          categories={categories}
          sort={sort}
          onSortChange={setSort}
          showAccountColumn={showAccountColumn}
          editingId={editingId}
          renderEditRow={renderEditRow}
          renderActions={(tx) => (
            <>
              <button
                type="button"
                onClick={() => handleEdit(tx)}
                style={{ background: 'none', border: 'none', cursor: 'pointer' }}
                title="Edit"
              >
                ✏️
              </button>
              <button
                type="button"
                onClick={() => handleDelete(tx.id)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', marginLeft: '0.5rem' }}
                title="Delete"
              >
                🗑️
              </button>
              <input
                type="checkbox"
                checked={tx.is_cleared === 1 || tx.cleared === 1}
                onChange={() =>
                  handleToggleCleared(tx.id, tx.is_cleared === 1 || tx.cleared === 1)
                }
                title="Cleared"
                style={{ marginLeft: '0.5rem', verticalAlign: 'middle' }}
              />
            </>
          )}
        />
      </div>
    </div>
  );
};

export default TransactionManager;
