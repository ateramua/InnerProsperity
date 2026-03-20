// src/views/AccountDetailView.jsx
import React, { useState, useEffect } from 'react';

 function AccountDetailView({ account: propAccount, accountId, onBack, onMakePayment }) {
  console.log('🔥🔥🔥🔥🔥 NEW ACCOUNT DETAIL VIEW LOADED – TIMESTAMP', Date.now());
  console.log('🔵 AccountDetailView props:', { propAccount, accountId, onBack: !!onBack, onMakePayment: !!onMakePayment });

  // ----- STEP 1: Normalize to a single source of truth for the account ID -----
  const definitiveAccountId = accountId || propAccount?.id;
  console.log('🔍 definitiveAccountId:', definitiveAccountId);

  const [account, setAccount] = useState(propAccount || null);
  const [loading, setLoading] = useState(!propAccount && !!definitiveAccountId);
  const [error, setError] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [newTransaction, setNewTransaction] = useState({
    date: new Date().toISOString().split('T')[0],
    description: '',
    amount: '',
    category: '',
    memo: ''
  });

  // ----- STEP 2: Fetch account using definitiveAccountId -----
  useEffect(() => {
    console.log('🟢 Account fetch effect running', { propAccount, accountId, definitiveAccountId });
    if (propAccount) {
      setAccount(propAccount);
      setLoading(false);
      return;
    }
    if (definitiveAccountId) {
      const fetchAccount = async () => {
        setLoading(true);
        setError(null);
        console.log('🔍 Fetching account with ID:', definitiveAccountId);
        try {
          const userResult = await window.electronAPI?.getCurrentUser?.();
          const userId = userResult?.data?.id || 2;
          const result = await window.electronAPI?.getAccountById?.(definitiveAccountId, userId);
          console.log('🔍 Fetch result:', result);
          if (result?.success && result.data) {
            setAccount(result.data);
          } else {
            setError('Account not found');
          }
        } catch (err) {
          console.error('❌ Fetch error:', err);
          setError('Failed to load account');
        } finally {
          setLoading(false);
        }
      };
      fetchAccount();
    } else {
      setLoading(false);
    }
  }, [propAccount, definitiveAccountId]);

  // ----- STEP 3: Modified loadTransactions that accepts an optional ID -----
  const loadTransactions = async (id) => {
    const targetId = id || account?.id;
    if (!targetId) {
      console.log('📥 No account ID available to load transactions');
      return;
    }
    console.log('📥 Loading transactions for account:', targetId);
    try {
      if (window.electronAPI?.getAccountTransactions) {
        const result = await window.electronAPI.getAccountTransactions(targetId);
        console.log('📥 getAccountTransactions result:', result);
        if (result.success) {
          console.log('✅ Transactions data:', result.data);
          setTransactions(result.data);
        } else {
          console.error('❌ Failed to load transactions:', result.error);
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
      console.error('❌ Error loading transactions:', error);
    }
  };

  // ----- STEP 4: Trigger loadTransactions when account becomes available, using its id -----
  useEffect(() => {
    console.log('🟢 Transaction effect running, account:', account);
    if (account?.id) {
      loadTransactions(account.id);
    }
  }, [account]);

  // ----- STEP 5: handleAddTransaction already calls loadTransactions(account.id) -----
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
          await loadTransactions(account.id);  // explicit id ensures correct account
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
    }).format(amount || 0);
  };

  const formatAccountNumber = (number) => {
    if (!number) return 'Not provided';
    const last4 = number.slice(-4);
    return `•••• •••• •••• ${last4}`;
  };

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loading}>Loading account details...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>{error}</div>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
      </div>
    );
  }

  if (!account) {
    return (
      <div style={styles.container}>
        <div style={styles.error}>Account not found</div>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
      </div>
    );
  }

  const isCreditCard = account.type === 'credit';
  const creditLimit = account.credit_limit || account.limit || 0;
  const availableCredit = isCreditCard && creditLimit ? creditLimit - Math.abs(account.balance || 0) : 0;
  const interestRate = account.interest_rate || account.apr || null;

  // ---------- YOUR EXISTING JSX (UNCHANGED) ----------
  return (
    <div style={styles.container}>
      {/* Header with Navigation */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>
          ← Back
        </button>
        <div style={styles.headerTitle}>
          <h2 style={styles.title}>
            {account.name}
          </h2>
          <span style={styles.accountType}>
            {isCreditCard ? '💳 Credit Card' : account.type || 'Account'}
            {account.institution && ` • ${account.institution}`}
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
              {formatCurrency(Math.abs(account.balance || 0))}
              {account.balance < 0 && <span style={styles.negativeIndicator}> (you owe)</span>}
            </div>
          </div>
          
          {isCreditCard && (
            <>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Credit Limit</div>
                <div style={styles.summaryValue}>
                  {formatCurrency(creditLimit)}
                </div>
              </div>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Available Credit</div>
                <div style={styles.summaryValue}>
                  {formatCurrency(availableCredit)}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Credit Card Specific Details */}
        {isCreditCard && (
          <div style={styles.creditDetails}>
            <div style={styles.creditDetailsGrid}>
              {interestRate && (
                <div style={styles.creditDetailItem}>
                  <span style={styles.creditDetailLabel}>Interest Rate</span>
                  <span style={styles.creditDetailValue}>{interestRate}% APR</span>
                </div>
              )}
              {account.due_date && (
                <div style={styles.creditDetailItem}>
                  <span style={styles.creditDetailLabel}>Payment Due</span>
                  <span style={styles.creditDetailValue}>
                    {new Date(account.due_date).toLocaleDateString()}
                  </span>
                </div>
              )}
              {account.cardHolderName && (
                <div style={styles.creditDetailItem}>
                  <span style={styles.creditDetailLabel}>Card Holder</span>
                  <span style={styles.creditDetailValue}>{account.cardHolderName}</span>
                </div>
              )}
              {account.accountNumber && (
                <div style={styles.creditDetailItem}>
                  <span style={styles.creditDetailLabel}>Account Number</span>
                  <span style={styles.creditDetailValue}>
                    {formatAccountNumber(account.accountNumber)}
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Due Date Badge for Credit Cards */}
        {isCreditCard && account.due_date && (
          <div style={styles.dueDateBadge}>
            💳 Payment due by {new Date(account.due_date).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Transactions Header */}
      <div style={styles.transactionsHeader}>
        <h3 style={styles.transactionsTitle}>Recent Transactions</h3>
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
    fontSize: '0.875rem',
    transition: 'background 0.2s',
    ':hover': {
      background: '#4B5563'
    }
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
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
    }
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
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    lineHeight: '1.2'
  },
  negativeIndicator: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    display: 'block',
    fontWeight: 'normal'
  },
  creditDetails: {
    marginTop: '1.5rem',
    paddingTop: '1.5rem',
    borderTop: '1px solid #374151'
  },
  creditDetailsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem'
  },
  creditDetailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  creditDetailLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  creditDetailValue: {
    fontSize: '1rem',
    fontWeight: '500',
    color: 'white'
  },
  dueDateBadge: {
    marginTop: '1rem',
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #F59E0B20, #F59E0B10)',
    color: '#F59E0B',
    borderRadius: '0.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    fontWeight: '500',
    border: '1px solid #F59E0B40'
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
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
    }
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
    cursor: 'pointer',
    transition: 'background 0.2s',
    ':hover': {
      background: '#2563EB'
    }
  },
  transactionItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '1rem',
    borderBottom: '1px solid #374151',
    transition: 'background 0.2s',
    ':hover': {
      background: '#2D3748'
    },
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
    width: '90%',
    maxHeight: '90vh',
    overflowY: 'auto'
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
    fontSize: '1rem',
    transition: 'border-color 0.2s',
    ':focus': {
      outline: 'none',
      borderColor: '#3B82F6'
    }
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
    fontSize: '1rem',
    transition: 'border-color 0.2s',
    ':focus': {
      outline: 'none',
      borderColor: '#3B82F6'
    }
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
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
    }
  },
  cancelButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#6B7280',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'background 0.2s',
    ':hover': {
      background: '#4B5563'
    }
  },
  loading: {
    textAlign: 'center',
    padding: '2rem',
    color: '#9CA3AF',
  },
  error: {
    textAlign: 'center',
    padding: '2rem',
    color: '#F87171',
    marginBottom: '1rem',
  },
};

export default AccountDetailView;