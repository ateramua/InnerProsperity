// src/views/AccountDetailView.jsx
import React, { useState, useEffect } from 'react';

export default function AccountDetailView({ account, onBack, onMakePayment }) {
  const [transactions, setTransactions] = useState([]);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    category: '',
    memo: ''
  });

  // Load transactions for this account
  useEffect(() => {
    loadTransactions();
  }, [account.id]);

  const loadTransactions = async () => {
    try {
      if (window.electronAPI?.getAccountTransactions) {
        const result = await window.electronAPI.getAccountTransactions(account.id);
        if (result.success) {
          setTransactions(result.data);
        }
      } else {
        // Mock transactions for demo
        setTransactions([
          { id: 1, date: '2024-03-15', description: 'Grocery Store', amount: -125.32, category: 'Groceries' },
          { id: 2, date: '2024-03-14', description: 'Gas Station', amount: -45.67, category: 'Transportation' },
          { id: 3, date: '2024-03-10', description: 'Payment Received', amount: 500.00, category: 'Payment' },
          { id: 4, date: '2024-03-05', description: 'Restaurant', amount: -78.50, category: 'Dining' },
          { id: 5, date: '2024-03-01', description: 'Online Subscription', amount: -14.99, category: 'Entertainment' }
        ]);
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  const handleAddTransaction = async () => {
    try {
      const transactionData = {
        accountId: account.id,
        date: newTransaction.date,
        description: newTransaction.description,
        amount: parseFloat(newTransaction.amount),
        category: newTransaction.category,
        memo: newTransaction.memo
      };

      if (window.electronAPI?.addTransaction) {
        const result = await window.electronAPI.addTransaction(transactionData);
        if (result.success) {
          await loadTransactions();
          setShowAddTransaction(false);
          setNewTransaction({
            date: new Date().toISOString().split('T')[0],
            description: '',
            amount: '',
            category: '',
            memo: ''
          });
        }
      } else {
        // Mock adding transaction
        setTransactions([
          ...transactions,
          { ...transactionData, id: Date.now() }
        ]);
        setShowAddTransaction(false);
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  // Determine if this is a credit card
  const isCreditCard = account.type === 'credit' || account.balance < 0;

  return (
    <div style={styles.container}>
      {/* Header with Navigation */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>
          ← Back
        </button>
        <div style={styles.headerTitle}>
          <h2 style={styles.title}>
            {account.institution ? `${account.name} - ${account.institution}` : account.name}
          </h2>
          <span style={styles.accountType}>
            {isCreditCard ? '💳 Credit Card' : account.type || 'Account'}
          </span>
        </div>
        {isCreditCard && (
          <button
            onClick={() => onMakePayment && onMakePayment(account.id)}
            style={styles.paymentButton}
          >
            💰 Make Payment
          </button>
        )}
      </div>

      {/* Account Summary */}
      <div style={styles.summaryCard}>
        <div style={styles.summaryRow}>
          <div style={styles.summaryItem}>
            <div style={styles.summaryLabel}>Current Balance</div>
            <div style={{
              ...styles.summaryValue,
              color: account.balance < 0 ? '#EF4444' : '#10B981'
            }}>
              {formatCurrency(account.balance || 0)}
            </div>
          </div>
          {isCreditCard && (
            <>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Credit Limit</div>
                <div style={styles.summaryValue}>
                  {formatCurrency(account.limit || 0)}
                </div>
              </div>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Available Credit</div>
                <div style={styles.summaryValue}>
                  {formatCurrency((account.limit || 0) - Math.abs(account.balance || 0))}
                </div>
              </div>
            </>
          )}
        </div>
        {isCreditCard && account.dueDate && (
          <div style={styles.dueDateBadge}>
            Due: {new Date(account.dueDate).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Transactions Header */}
      <div style={styles.transactionsHeader}>
        <h3 style={styles.transactionsTitle}>Transactions</h3>
        <button
          onClick={() => setShowAddTransaction(true)}
          style={styles.addButton}
        >
          + Add Transaction
        </button>
      </div>

      {/* Transactions List */}
      <div style={styles.transactionsList}>
        {transactions.length === 0 ? (
          <div style={styles.emptyState}>
            <p>No transactions yet</p>
            <button onClick={() => setShowAddTransaction(true)} style={styles.emptyAddButton}>
              + Add Your First Transaction
            </button>
          </div>
        ) : (
          transactions.map(tx => (
            <div key={tx.id} style={styles.transactionItem}>
              <div style={styles.transactionDate}>
                {new Date(tx.date).toLocaleDateString()}
              </div>
              <div style={styles.transactionDescription}>
                <div>{tx.description || 'Transaction'}</div>
                {tx.category && <span style={styles.transactionCategory}>{tx.category}</span>}
              </div>
              <div style={{
                ...styles.transactionAmount,
                color: tx.amount < 0 ? '#EF4444' : '#10B981'
              }}>
                {formatCurrency(tx.amount)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Transaction Modal */}
      {showAddTransaction && (
        <div style={styles.modalOverlay} onClick={() => setShowAddTransaction(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Transaction</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Date</label>
              <input
                type="date"
                value={newTransaction.date}
                onChange={(e) => setNewTransaction({...newTransaction, date: e.target.value})}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Description</label>
              <input
                type="text"
                value={newTransaction.description}
                onChange={(e) => setNewTransaction({...newTransaction, description: e.target.value})}
                placeholder="e.g., Grocery Store"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Amount</label>
              <div style={styles.inputWrapper}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  value={newTransaction.amount}
                  onChange={(e) => setNewTransaction({...newTransaction, amount: e.target.value})}
                  placeholder="0.00"
                  step="0.01"
                  style={styles.inputWithSymbol}
                />
              </div>
              <div style={styles.amountHint}>
                Negative for purchases, positive for payments
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Category (Optional)</label>
              <input
                type="text"
                value={newTransaction.category}
                onChange={(e) => setNewTransaction({...newTransaction, category: e.target.value})}
                placeholder="e.g., Groceries, Dining"
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Memo (Optional)</label>
              <input
                type="text"
                value={newTransaction.memo}
                onChange={(e) => setNewTransaction({...newTransaction, memo: e.target.value})}
                placeholder="Additional notes"
                style={styles.input}
              />
            </div>

            <div style={styles.modalActions}>
              <button
                onClick={handleAddTransaction}
                style={styles.submitButton}
              >
                Add Transaction
              </button>
              <button
                onClick={() => setShowAddTransaction(false)}
                style={styles.cancelButton}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1000px',
    margin: '0 auto',
    color: 'white'
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '2rem',
    flexWrap: 'wrap'
  },
  backButton: {
    padding: '0.5rem 1rem',
    background: '#374151',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem'
  },
  headerTitle: {
    flex: 1
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    margin: '0 0 0.25rem 0',
    color: 'white'
  },
  accountType: {
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  paymentButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  summaryCard: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    marginBottom: '2rem'
  },
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1rem'
  },
  summaryItem: {
    textAlign: 'center'
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem',
    textTransform: 'uppercase'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold'
  },
  dueDateBadge: {
    marginTop: '1rem',
    padding: '0.5rem',
    background: '#F59E0B20',
    color: '#F59E0B',
    borderRadius: '0.5rem',
    textAlign: 'center',
    fontSize: '0.875rem'
  },
  transactionsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem'
  },
  transactionsTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: 0,
    color: 'white'
  },
  addButton: {
    padding: '0.5rem 1rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer'
  },
  transactionsList: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    overflow: 'hidden'
  },
  emptyState: {
    padding: '3rem',
    textAlign: 'center',
    color: '#9CA3AF'
  },
  emptyAddButton: {
    marginTop: '1rem',
    padding: '0.5rem 1rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer'
  },
  transactionItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '1rem',
    borderBottom: '1px solid #374151',
    ':last-child': {
      borderBottom: 'none'
    }
  },
  transactionDate: {
    width: '100px',
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  transactionDescription: {
    flex: 1,
    margin: '0 1rem'
  },
  transactionCategory: {
    fontSize: '0.75rem',
    color: '#6B7280',
    marginLeft: '0.5rem'
  },
  transactionAmount: {
    fontSize: '1rem',
    fontWeight: '600',
    minWidth: '100px',
    textAlign: 'right'
  },
  modalOverlay: {
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
    maxWidth: '400px',
    width: '90%'
  },
  modalTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: '0 0 1.5rem 0',
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
  inputWrapper: {
    position: 'relative'
  },
  currencySymbol: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9CA3AF'
  },
  inputWithSymbol: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 2rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  amountHint: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginTop: '0.25rem'
  },
  modalActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '2rem'
  },
  submitButton: {
    flex: 2,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer'
  },
  cancelButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#6B7280',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer'
  }
};