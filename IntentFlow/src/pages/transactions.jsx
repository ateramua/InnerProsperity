// src/pages/transactions.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import TransactionManager from '../components/TransactionManager';

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  // Define formatCurrency inside the component
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load transactions
      const transactionsResult = await window.electronAPI.getTransactions();
      if (transactionsResult.success) {
        setTransactions(transactionsResult.data);
      }

      // Load categories
      const categoriesResult = await window.electronAPI.getCategories(1);
      if (categoriesResult.success) {
        setCategories(categoriesResult.data);
      }

      // Load accounts
      const accountsResult = await window.electronAPI.getAccounts();
      if (accountsResult.success) {
        setAccounts(accountsResult.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateTransaction = async (id, updates) => {
    try {
      const result = await window.electronAPI.updateTransaction(id, updates);
      if (result.success) {
        await loadData();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      console.error('Error updating transaction:', error);
      return { success: false, error: error.message };
    }
  };

  const handleDeleteTransaction = async (id) => {
    try {
      const result = await window.electronAPI.deleteTransaction(id);
      if (result.success) {
        await loadData();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      console.error('Error deleting transaction:', error);
      return { success: false, error: error.message };
    }
  };

  const handleToggleCleared = async (id, clearedStatus) => {
    try {
      const result = await window.electronAPI.toggleTransactionCleared(id, clearedStatus);
      if (result.success) {
        await loadData();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      console.error('Error toggling cleared status:', error);
      return { success: false, error: error.message };
    }
  };

  const [showAddModal, setShowAddModal] = useState(false);
  const [transactionForm, setTransactionForm] = useState({
    date: new Date().toISOString().split('T')[0],
    payee: '',
    amount: '',
    type: 'outflow',
    accountId: '',
    categoryId: '',
    memo: '',
    cleared: false
  });

  const resetForm = () => {
    setTransactionForm({
      date: new Date().toISOString().split('T')[0],
      payee: '',
      amount: '',
      type: 'outflow',
      accountId: '',
      categoryId: '',
      memo: '',
      cleared: false
    });
  };

  const handleAddTransaction = async () => {
    try {
      // Validate amount
      const amountValue = parseFloat(transactionForm.amount);
      if (isNaN(amountValue) || amountValue === 0) {
        alert('Please enter a valid amount');
        return;
      }

      // Validate account selection
      if (!transactionForm.accountId) {
        alert('Please select an account');
        return;
      }

      // Calculate amount based on type (inflow/outflow)
      const amount = transactionForm.type === 'outflow'
        ? -Math.abs(amountValue)
        : Math.abs(amountValue);

      const transactionData = {
        accountId: transactionForm.accountId,
        date: transactionForm.date,
        payee: transactionForm.payee,
        description: transactionForm.payee,
        amount: amount,
        categoryId: transactionForm.categoryId || null,
        memo: transactionForm.memo,
        cleared: transactionForm.cleared ? 1 : 0
      };

      console.log('📝 Adding transaction:', transactionData);

      const result = await window.electronAPI.addTransaction(transactionData);
      if (result.success) {
        setShowAddModal(false);
        resetForm();
        await loadData(); // Refresh data
        alert('✅ Transaction added successfully');
      } else {
        alert('❌ Error adding transaction: ' + result.error);
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
      alert('❌ Error adding transaction: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0047AB 0%, #0047AB 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white'
      }}>
        Loading transactions...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #0047AB 0%, #0047AB 100%)',
      color: 'white'
    }}>
      {/* Navigation Header */}
      <header style={{
        background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
        padding: '1rem 1.5rem',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Money Manager</h1>
          <nav style={{ display: 'flex', gap: '1rem' }}>
            <Link href="/">Budget</Link>
            <Link href="/forecast">Forecast</Link>
            <Link href="/credit-cards">Cards</Link>
            <Link href="/reports">Reports</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/goal-reports" passHref>
              <button style={{
                background: router.pathname === '/goal-reports' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}>
                📈 Goal Reports
              </button>
            </Link>
            <Link href="/transactions" style={{ fontWeight: 'bold' }}>Transactions</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', margin: 0, color: 'white' }}>All Transactions</h2>
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              background: '#10B981',
              color: 'white',
              border: 'none',
              padding: '0.75rem 1.5rem',
              borderRadius: '0.5rem',
              fontSize: '1rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            <span style={{ fontSize: '1.2rem' }}>+</span> Add Transaction
          </button>
        </div>

        {/* Add Transaction Modal */}
        {showAddModal && (
          <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
            <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
              <h3 style={styles.modalTitle}>Add Transaction</h3>
              
              <div style={styles.formGroup}>
                <label style={styles.label}>Date</label>
                <input
                  type="date"
                  value={transactionForm.date}
                  onChange={(e) => setTransactionForm({...transactionForm, date: e.target.value})}
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Account</label>
                <select
                  value={transactionForm.accountId}
                  onChange={(e) => setTransactionForm({...transactionForm, accountId: e.target.value})}
                  style={styles.select}
                >
                  <option value="">Select Account</option>
                  {accounts.map(account => (
                    <option key={account.id} value={account.id}>
                      {account.name} ({formatCurrency(account.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Payee</label>
                <input
                  type="text"
                  value={transactionForm.payee}
                  onChange={(e) => setTransactionForm({...transactionForm, payee: e.target.value})}
                  style={styles.input}
                  placeholder="e.g., Grocery Store"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Amount</label>
                <input
                  type="number"
                  value={transactionForm.amount}
                  onChange={(e) => setTransactionForm({...transactionForm, amount: e.target.value})}
                  style={styles.input}
                  placeholder="0.00"
                  step="0.01"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Type</label>
                <select
                  value={transactionForm.type}
                  onChange={(e) => setTransactionForm({...transactionForm, type: e.target.value})}
                  style={styles.select}
                >
                  <option value="outflow">Outflow (Money Out)</option>
                  <option value="inflow">Inflow (Money In)</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Category</label>
                <select
                  value={transactionForm.categoryId}
                  onChange={(e) => setTransactionForm({...transactionForm, categoryId: e.target.value})}
                  style={styles.select}
                >
                  <option value="">Select Category</option>
                  {categories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Memo (Optional)</label>
                <input
                  type="text"
                  value={transactionForm.memo}
                  onChange={(e) => setTransactionForm({...transactionForm, memo: e.target.value})}
                  style={styles.input}
                  placeholder="Additional notes"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={transactionForm.cleared}
                    onChange={(e) => setTransactionForm({...transactionForm, cleared: e.target.checked})}
                  />
                  <span style={{ marginLeft: '0.5rem' }}>Cleared</span>
                </label>
              </div>

              <div style={styles.modalActions}>
                <button onClick={handleAddTransaction} style={styles.saveButton}>
                  Add Transaction
                </button>
                <button onClick={() => setShowAddModal(false)} style={styles.cancelButton}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <TransactionManager
          transactions={transactions}
          categories={categories}
          accounts={accounts}
          onAddTransaction={handleAddTransaction}
          onUpdateTransaction={handleUpdateTransaction}
          onDeleteTransaction={handleDeleteTransaction}
          onToggleCleared={handleToggleCleared}
        />
      </main>
    </div>
  );
}

const styles = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.7)',
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
    maxHeight: '90vh',
    overflowY: 'auto'
  },
  modalTitle: {
    fontSize: '1.5rem',
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
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    color: '#9CA3AF',
    cursor: 'pointer'
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
  modalActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '2rem'
  },
  saveButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
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
    fontWeight: '600',
    cursor: 'pointer'
  }
};