// src/views/AccountDetailView.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

const AccountDetailView = ({ account }) => {
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTransaction, setEditingTransaction] = useState(null);
  const [categories, setCategories] = useState([]);


  // Form state for new/edit transaction
  const [transactionForm, setTransactionForm] = useState({
    date: new Date().toISOString().split('T')[0],
    payee: '',
    categoryId: '',
    amount: '',
    type: 'outflow',
    memo: '',
    cleared: false
  });

  useEffect(() => {
    if (account) {
      loadTransactions();
      loadCategories();
    }
  }, [account]);

  const loadTransactions = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.getAccountTransactions(account.id);
      if (result.success) {
        setTransactions(result.data);
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    try {
      const result = await window.electronAPI.getCategories();
      if (result.success) {
        setCategories(result.data);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const handleAddTransaction = async () => {
    try {
      const amount = transactionForm.type === 'outflow'
        ? -Math.abs(parseFloat(transactionForm.amount))
        : Math.abs(parseFloat(transactionForm.amount));

      const transactionData = {
        accountId: account.id,
        date: transactionForm.date,
        payee: transactionForm.payee,
        description: transactionForm.payee,
        amount: amount,
        categoryId: transactionForm.categoryId || null,
        memo: transactionForm.memo,
        cleared: transactionForm.cleared ? 1 : 0
      };

      const result = await window.electronAPI.addTransaction(transactionData);
      if (result.success) {
        setShowAddModal(false);
        resetForm();
        loadTransactions();
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
    }
  };
  const handleEditAccount = () => {
    router.push(`/accounts/${account.id}/edit`);
  };

  const handleEditTransaction = (transaction) => {
    setEditingTransaction(transaction);
    setTransactionForm({
      date: transaction.date,
      payee: transaction.payee || transaction.description,
      categoryId: transaction.category_id || '',
      amount: Math.abs(transaction.amount),
      type: transaction.amount < 0 ? 'outflow' : 'inflow',
      memo: transaction.memo || '',
      cleared: transaction.is_cleared === 1
    });
  };

  const handleUpdateTransaction = async () => {
    try {
      const amount = transactionForm.type === 'outflow'
        ? -Math.abs(parseFloat(transactionForm.amount))
        : Math.abs(parseFloat(transactionForm.amount));

      const updates = {
        date: transactionForm.date,
        payee: transactionForm.payee,
        description: transactionForm.payee,
        amount: amount,
        category_id: transactionForm.categoryId || null,
        memo: transactionForm.memo,
        is_cleared: transactionForm.cleared ? 1 : 0
      };

      const result = await window.electronAPI.updateTransaction(editingTransaction.id, updates);
      if (result.success) {
        setEditingTransaction(null);
        resetForm();
        loadTransactions();
      }
    } catch (error) {
      console.error('Error updating transaction:', error);
    }
  };

  const handleDeleteTransaction = async (transactionId) => {
    if (!confirm('Are you sure you want to delete this transaction?')) return;

    try {
      const result = await window.electronAPI.deleteTransaction(transactionId);
      if (result.success) {
        loadTransactions();
      }
    } catch (error) {
      console.error('Error deleting transaction:', error);
    }
  };

  const handleToggleCleared = async (transactionId, currentStatus) => {
    try {
      const result = await window.electronAPI.toggleTransactionCleared(transactionId, currentStatus ? 0 : 1);
      if (result.success) {
        loadTransactions();
      }
    } catch (error) {
      console.error('Error toggling cleared status:', error);
    }
  };

  const handleReconcile = () => {
    router.push(`/accounts/${account.id}/reconcile`);
  };

  const resetForm = () => {
    setTransactionForm({
      date: new Date().toISOString().split('T')[0],
      payee: '',
      categoryId: '',
      amount: '',
      type: 'outflow',
      memo: '',
      cleared: false
    });
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (!account) {
    return (
      <div style={styles.errorContainer}>
        <h2>Account Not Found</h2>
        <p>The account you're looking for doesn't exist.</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header with Account Info */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>{account.name}</h1>
          <div style={styles.accountMeta}>
            <span style={styles.accountType}>{account.type}</span>
            {account.institution && (
              <span style={styles.institution}>• {account.institution}</span>
            )}
          </div>
        </div>
        <div style={styles.balanceContainer}>
          <div style={styles.balanceLabel}>Current Balance</div>
          <div style={{
            ...styles.balance,
            color: account.balance >= 0 ? '#4ADE80' : '#F87171'
          }}>
            {formatCurrency(account.balance)}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={styles.actions}>
        <button
          style={styles.actionButton}
          onClick={() => setShowAddModal(true)}
        >
          <span style={styles.actionIcon}>+</span>
          Add Transaction
        </button>
        <button
          style={styles.actionButton}
          onClick={handleReconcile}
        >
          <span style={styles.actionIcon}>🔄</span>
          Reconcile
        </button>
        <button
          style={styles.actionButton}
          onClick={handleEditAccount}
        >
          <span style={styles.actionIcon}>✏️</span>
          Edit Account
        </button>
      </div>

      {/* Transactions Table */}
      <div style={styles.tableContainer}>
        <h2 style={styles.tableTitle}>Recent Transactions</h2>
        {loading ? (
          <div style={styles.loading}>Loading transactions...</div>
        ) : (
          <table style={styles.table}>
            <thead style={styles.tableHead}>
              <tr>
                <th style={styles.tableHeader}>Date</th>
                <th style={styles.tableHeader}>Payee</th>
                <th style={styles.tableHeader}>Category</th>
                <th style={styles.tableHeader}>Memo</th>
                <th style={styles.tableHeader}>Outflow</th>
                <th style={styles.tableHeader}>Inflow</th>
                <th style={styles.tableHeader}>Cleared</th>
                <th style={styles.tableHeader}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan="8" style={styles.noTransactions}>
                    No transactions yet. Click "Add Transaction" to get started.
                  </td>
                </tr>
              ) : (
                transactions.map((transaction) => (
                  <tr key={transaction.id} style={styles.tableRow}>
                    <td style={styles.tableCell}>{transaction.date}</td>
                    <td style={styles.tableCell}>{transaction.payee || transaction.description}</td>
                    <td style={styles.tableCell}>
                      <span style={styles.category}>
                        {categories.find(c => c.id === transaction.category_id)?.name || 'Uncategorized'}
                      </span>
                    </td>
                    <td style={styles.tableCell}>{transaction.memo || '-'}</td>
                    <td style={{ ...styles.tableCell, ...styles.outflow }}>
                      {transaction.amount < 0 ? formatCurrency(transaction.amount) : ''}
                    </td>
                    <td style={{ ...styles.tableCell, ...styles.inflow }}>
                      {transaction.amount > 0 ? formatCurrency(transaction.amount) : ''}
                    </td>
                    <td style={styles.tableCell}>
                      <input
                        type="checkbox"
                        checked={transaction.is_cleared === 1}
                        onChange={() => handleToggleCleared(transaction.id, transaction.is_cleared)}
                        style={styles.checkbox}
                      />
                    </td>
                    <td style={styles.tableCell}>
                      <button
                        onClick={() => handleEditTransaction(transaction)}
                        style={styles.iconButton}
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleDeleteTransaction(transaction.id)}
                        style={styles.iconButton}
                      >
                        🗑️
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Add Transaction Modal - FIXED */}
      {showAddModal && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>Add Transaction</h3>

            <div style={styles.formGroup}>
              <label style={styles.label}>Date</label>
              <input
                type="date"
                value={transactionForm.date}
                onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Payee</label>
              <input
                type="text"
                value={transactionForm.payee}
                onChange={(e) => setTransactionForm({ ...transactionForm, payee: e.target.value })}
                style={styles.input}
                placeholder="e.g., Grocery Store"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Category</label>
              <select
                value={transactionForm.categoryId}
                onChange={(e) => setTransactionForm({ ...transactionForm, categoryId: e.target.value })}
                style={styles.select}
              >
                <option value="">Select Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Amount</label>
              <input
                type="number"
                value={transactionForm.amount}
                onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                style={styles.input}
                placeholder="0.00"
                step="0.01"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Type</label>
              <select
                value={transactionForm.type}
                onChange={(e) => setTransactionForm({ ...transactionForm, type: e.target.value })}
                style={styles.select}
              >
                <option value="outflow">Outflow (Expense)</option>
                <option value="inflow">Inflow (Income)</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Memo</label>
              <input
                type="text"
                value={transactionForm.memo}
                onChange={(e) => setTransactionForm({ ...transactionForm, memo: e.target.value })}
                style={styles.input}
                placeholder="Optional notes"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={transactionForm.cleared}
                  onChange={(e) => setTransactionForm({ ...transactionForm, cleared: e.target.checked })}
                />
                Cleared
              </label>
            </div>

            <div style={styles.modalActions}>
              {/* FIXED: Changed from handleUpdateTransaction to handleAddTransaction */}
              <button onClick={handleAddTransaction} style={styles.saveButton}>
                Add Transaction
              </button>
              <button
                onClick={() => {
                  setShowAddModal(false);
                  resetForm();
                  // FIXED: Changed from '/accounts' to '/' for home page
                  router.push('/');
                }}
                style={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Transaction Modal */}
      {editingTransaction && (
        <div style={styles.modal}>
          <div style={styles.modalContent}>
            <h3 style={styles.modalTitle}>Edit Transaction</h3>

            <div style={styles.formGroup}>
              <label style={styles.label}>Date</label>
              <input
                type="date"
                value={transactionForm.date}
                onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Payee</label>
              <input
                type="text"
                value={transactionForm.payee}
                onChange={(e) => setTransactionForm({ ...transactionForm, payee: e.target.value })}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Category</label>
              <select
                value={transactionForm.categoryId}
                onChange={(e) => setTransactionForm({ ...transactionForm, categoryId: e.target.value })}
                style={styles.select}
              >
                <option value="">Select Category</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Amount</label>
              <input
                type="number"
                value={transactionForm.amount}
                onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                style={styles.input}
                step="0.01"
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Type</label>
              <select
                value={transactionForm.type}
                onChange={(e) => setTransactionForm({ ...transactionForm, type: e.target.value })}
                style={styles.select}
              >
                <option value="outflow">Outflow (Expense)</option>
                <option value="inflow">Inflow (Income)</option>
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Memo</label>
              <input
                type="text"
                value={transactionForm.memo}
                onChange={(e) => setTransactionForm({ ...transactionForm, memo: e.target.value })}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={transactionForm.cleared}
                  onChange={(e) => setTransactionForm({ ...transactionForm, cleared: e.target.checked })}
                />
                Cleared
              </label>
            </div>

            <div style={styles.modalActions}>
              <button onClick={handleUpdateTransaction} style={styles.saveButton}>
                Update Transaction
              </button>
              <button 
                onClick={() => {
                  setEditingTransaction(null);
                  resetForm();
                }} 
                style={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Account Details Card */}
      <div style={styles.detailsCard}>
        <h3 style={styles.detailsTitle}>Account Details</h3>
        <div style={styles.detailsGrid}>
          {account.credit_limit > 0 && (
            <>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Credit Limit</span>
                <span style={styles.detailValue}>{formatCurrency(account.credit_limit)}</span>
              </div>
              <div style={styles.detailItem}>
                <span style={styles.detailLabel}>Available Credit</span>
                <span style={styles.detailValue}>
                  {formatCurrency(account.credit_limit - Math.abs(account.balance))}
                </span>
              </div>
            </>
          )}
          {account.interest_rate > 0 && (
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Interest Rate</span>
              <span style={styles.detailValue}>{account.interest_rate}%</span>
            </div>
          )}
          {account.due_date && (
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Due Date</span>
              <span style={styles.detailValue}>{account.due_date}</span>
            </div>
          )}
          {account.minimum_payment > 0 && (
            <div style={styles.detailItem}>
              <span style={styles.detailLabel}>Minimum Payment</span>
              <span style={styles.detailValue}>{formatCurrency(account.minimum_payment)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    width: '100%'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '2rem',
    padding: '1.5rem',
    background: '#1F2937',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    color: 'white',
    margin: '0 0 0.5rem 0'
  },
  accountMeta: {
    display: 'flex',
    gap: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem'
  },
  accountType: {
    textTransform: 'capitalize'
  },
  institution: {
    color: '#6B7280'
  },
  balanceContainer: {
    textAlign: 'right'
  },
  balanceLabel: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem'
  },
  balance: {
    fontSize: '2rem',
    fontWeight: 'bold'
  },
  actions: {
    display: 'flex',
    gap: '1rem',
    marginBottom: '2rem'
  },
  actionButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem 1.5rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.95rem',
    fontWeight: '500',
    cursor: 'pointer',
    ':hover': {
      background: '#2563EB'
    }
  },
  actionIcon: {
    fontSize: '1.1rem'
  },
  tableContainer: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    marginBottom: '2rem',
    border: '1px solid #374151'
  },
  tableTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '1rem'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  tableHead: {
    background: '#111827'
  },
  tableHeader: {
    padding: '0.75rem 1rem',
    textAlign: 'left',
    color: '#9CA3AF',
    fontWeight: '500',
    fontSize: '0.875rem',
    borderBottom: '2px solid #374151'
  },
  tableRow: {
    borderBottom: '1px solid #374151'
  },
  tableCell: {
    padding: '0.75rem 1rem',
    color: '#F3F4F6',
    fontSize: '0.95rem'
  },
  outflow: {
    color: '#F87171'
  },
  inflow: {
    color: '#4ADE80'
  },
  category: {
    display: 'inline-block',
    padding: '0.25rem 0.5rem',
    background: '#374151',
    borderRadius: '0.25rem',
    fontSize: '0.875rem'
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer'
  },
  iconButton: {
    background: 'none',
    border: 'none',
    fontSize: '1rem',
    cursor: 'pointer',
    marginRight: '0.5rem'
  },
  noTransactions: {
    padding: '2rem',
    textAlign: 'center',
    color: '#9CA3AF'
  },
  loading: {
    padding: '2rem',
    textAlign: 'center',
    color: '#9CA3AF'
  },
  modal: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    background: '#1F2937',
    padding: '2rem',
    borderRadius: '1rem',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '80vh',
    overflowY: 'auto'
  },
  modalTitle: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: 'white'
  },
  formGroup: {
    marginBottom: '1rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem'
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: 'white',
    cursor: 'pointer'
  },
  modalActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '2rem'
  },
  saveButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '500',
    cursor: 'pointer'
  },
  cancelButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '500',
    cursor: 'pointer'
  },
  detailsCard: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    border: '1px solid #374151'
  },
  detailsTitle: {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '1rem'
  },
  detailsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem'
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  detailLabel: {
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  detailValue: {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: 'white'
  },
  errorContainer: {
    padding: '2rem',
    textAlign: 'center',
    color: '#F87171'
  }
};

export default AccountDetailView;