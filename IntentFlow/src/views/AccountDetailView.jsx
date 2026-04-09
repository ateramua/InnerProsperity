// src/views/AccountDetailView.jsx
import React, { useState, useEffect } from 'react';

function AccountDetailView({ account: propAccount, accountId, onBack, onMakePayment }) {
  console.log('🔥 AccountDetailView mounted – timestamp', Date.now());
  console.log('🔵 Props:', { propAccount, accountId, onBack: !!onBack, onMakePayment: !!onMakePayment });

  // ----- Normalize to a single source of truth for the account ID -----
  const definitiveAccountId = accountId || propAccount?.id;
  console.log('🔍 definitiveAccountId:', definitiveAccountId);

  const [account, setAccount] = useState(propAccount || null);
  const [loading, setLoading] = useState(!propAccount && !!definitiveAccountId);
  const [error, setError] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [scheduledTransactions, setScheduledTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [showAddTransaction, setShowAddTransaction] = useState(false);
  const [addTransactionError, setAddTransactionError] = useState(null);
  const [refreshCounter, setRefreshCounter] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showScheduledSection, setShowScheduledSection] = useState(true);
  
  // Transaction form with Transaction Type
  const [newTransaction, setNewTransaction] = useState({
    date: new Date().toISOString().split('T')[0],
    payee: '',
    amount: '',
    transactionType: 'outflow',
    categoryId: '',
    memo: '',
    cleared: true
  });

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  // Get filtered categories based on transaction type
  const getFilteredCategories = () => {
    if (newTransaction.transactionType === 'inflow') {
      return [{ id: 'inflow_ready_to_assign', name: '💰 Inflow: Ready to Assign' }];
    }
    if (!categories || categories.length === 0) {
      return [];
    }
    return categories.filter(cat => cat && !cat.archived);
  };

  // Calculate balance change
  const calculateBalanceChange = (accountType, transactionType, amount) => {
    const isCreditOrLoan = accountType === 'credit' || accountType === 'loan';
    const isExpense = transactionType === 'outflow';
    const absAmount = Math.abs(amount);
    
    let change = 0;
    
    if (isCreditOrLoan) {
      change = isExpense ? -absAmount : absAmount;
    } else {
      change = isExpense ? -absAmount : absAmount;
    }
    
    return change;
  };

  // Load categories
  const loadCategories = async () => {
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (userResult?.success && userResult?.data) {
        const categoriesResult = await window.electronAPI.getCategories(userResult.data.id);
        if (categoriesResult?.success) {
          setCategories(categoriesResult.data);
          console.log('✅ Categories loaded:', categoriesResult.data.length);
        }
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  // Load scheduled transactions for this account
  const loadScheduledTransactions = async () => {
    try {
      if (window.electronAPI.getScheduledTransactions && account?.id) {
        const result = await window.electronAPI.getScheduledTransactions(account.id);
        if (result?.success) {
          setScheduledTransactions(result.data || []);
          console.log('📅 Scheduled transactions loaded:', result.data?.length);
        }
      }
    } catch (error) {
      console.error('Error loading scheduled transactions:', error);
    }
  };

  // Approve a scheduled transaction - THIS MOVES IT TO REGULAR TRANSACTIONS AND UPDATES BALANCE
  const handleApproveScheduled = async (scheduledTx) => {
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('Please log in to approve transaction');
        return;
      }

      const userId = userResult.data.id;
      const isExpense = scheduledTx.transactionType === 'outflow';
      const amountValue = Math.abs(parseFloat(scheduledTx.amount));

      let transactionAmount = isExpense ? -amountValue : amountValue;
      let balanceChange = isExpense ? -amountValue : amountValue;

      const isReadyToAssign = scheduledTx.transactionType === 'inflow' &&
        scheduledTx.categoryId === 'inflow_ready_to_assign';

      // Step 1: Add to regular transactions
      const transactionData = {
        accountId: account.id,
        date: new Date().toISOString().split('T')[0], // Use today's date for approval
        payee: scheduledTx.payee,
        description: scheduledTx.payee,
        amount: transactionAmount,
        categoryId: isReadyToAssign ? null : scheduledTx.categoryId,
        memo: scheduledTx.memo,
        cleared: 1
      };

      const addResult = await window.electronAPI.addTransaction(transactionData);
      if (!addResult.success) {
        alert('Failed to add transaction: ' + addResult.error);
        return;
      }

      // Step 2: Update account balance
      const currentBalance = account.balance || 0;
      const newBalance = currentBalance + balanceChange;
      await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });

      // Step 3: Delete the scheduled transaction
      if (window.electronAPI.deleteScheduledTransaction) {
        await window.electronAPI.deleteScheduledTransaction(scheduledTx.id);
      }

      // Step 4: Refresh all data
      await loadTransactions(account.id);
      await loadScheduledTransactions();
      await loadAccountData(account.id);
      
      window.dispatchEvent(new CustomEvent('accounts-updated'));
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
      
      alert(`✅ Transaction approved and added!\nNew balance: ${formatCurrency(newBalance)}`);
    } catch (error) {
      console.error('Error approving scheduled transaction:', error);
      alert('Error approving transaction: ' + error.message);
    }
  };

  // Reject/Delete a scheduled transaction
  const handleRejectScheduled = async (scheduledTx) => {
    if (!window.confirm(`Are you sure you want to delete this scheduled transaction?\n\nPayee: ${scheduledTx.payee}\nAmount: ${formatCurrency(scheduledTx.amount)}`)) {
      return;
    }

    try {
      if (window.electronAPI.deleteScheduledTransaction) {
        const result = await window.electronAPI.deleteScheduledTransaction(scheduledTx.id);
        if (result.success) {
          await loadScheduledTransactions();
          alert('✅ Scheduled transaction deleted');
        } else {
          alert('Failed to delete: ' + result.error);
        }
      }
    } catch (error) {
      console.error('Error deleting scheduled transaction:', error);
      alert('Error deleting transaction: ' + error.message);
    }
  };

  // Load regular transactions (only past and today, NOT future)
  const loadTransactions = async (id) => {
    const targetId = id || account?.id;
    if (!targetId) return;
    try {
      if (window.electronAPI?.getAccountTransactions) {
        const result = await window.electronAPI.getAccountTransactions(targetId);
        if (result.success) {
          // Only show transactions with date <= today OR cleared
          const today = new Date();
          today.setHours(0, 0, 0, 0);
          const regularTransactions = result.data.filter(tx => {
            const txDate = new Date(tx.date);
            return txDate <= today || tx.cleared === 1;
          });
          setTransactions(regularTransactions);
        }
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  // Load categories when modal opens
  useEffect(() => {
    if (showAddTransaction) {
      loadCategories();
    }
  }, [showAddTransaction]);

  // Listen for account updates
  useEffect(() => {
    const handleAccountsUpdated = () => {
      console.log('🔄 AccountDetailView received accounts-updated event');
      if (definitiveAccountId) {
        setRefreshCounter(prev => prev + 1);
      }
    };
    window.addEventListener('accounts-updated', handleAccountsUpdated);
    return () => window.removeEventListener('accounts-updated', handleAccountsUpdated);
  }, [definitiveAccountId]);

  // Fetch account
  useEffect(() => {
    console.log('🟢 Account fetch effect running', { propAccount, accountId, definitiveAccountId, refreshCounter });
    if (propAccount) {
      setAccount(propAccount);
      setLoading(false);
      return;
    }
    if (definitiveAccountId) {
      let isMounted = true;
      const fetchAccount = async () => {
        setLoading(true);
        setError(null);
        try {
          const userResult = await window.electronAPI?.getCurrentUser?.();
          const userId = userResult?.data?.id || 2;
          const result = await window.electronAPI?.getAccountById?.(definitiveAccountId, userId);
          if (result?.success && result.data) {
            if (isMounted) setAccount(result.data);
          } else {
            if (isMounted) setError('Account not found');
          }
        } catch (err) {
          console.error('❌ Fetch error:', err);
          if (isMounted) setError('Failed to load account');
        } finally {
          if (isMounted) setLoading(false);
        }
      };
      fetchAccount();
      return () => {
        isMounted = false;
      };
    } else {
      setLoading(false);
    }
  }, [propAccount, definitiveAccountId, refreshCounter]);

  // Load transactions and scheduled transactions when account is available
  useEffect(() => {
    if (account?.id) {
      loadTransactions(account.id);
      loadScheduledTransactions();
    }
  }, [account]);

  const loadAccountData = async (id) => {
    const targetId = id || account?.id;
    if (!targetId) return;
    try {
      const userResult = await window.electronAPI?.getCurrentUser?.();
      const userId = userResult?.data?.id || 2;
      const result = await window.electronAPI?.getAccountById?.(targetId, userId);
      if (result?.success && result.data) {
        setAccount(result.data);
      }
    } catch (error) {
      console.error('Error loading account data:', error);
    }
  };

  // Add regular transaction (for today/past dates) - AFFECTS BALANCE IMMEDIATELY
  const handleAddRegularTransaction = async (amountValue, userId) => {
    const isCreditOrLoan = account.type === 'credit' || account.type === 'loan';
    const isExpense = newTransaction.transactionType === 'outflow';

    let transactionAmount = 0;
    let balanceChange = 0;

    if (isCreditOrLoan) {
      if (isExpense) {
        transactionAmount = -amountValue;
        balanceChange = -amountValue;
      } else {
        transactionAmount = amountValue;
        balanceChange = amountValue;
      }
    } else {
      if (isExpense) {
        transactionAmount = -amountValue;
        balanceChange = -amountValue;
      } else {
        transactionAmount = amountValue;
        balanceChange = amountValue;
      }
    }

    const isReadyToAssign = newTransaction.transactionType === 'inflow' &&
      newTransaction.categoryId === 'inflow_ready_to_assign';

    const transactionData = {
      accountId: account.id,
      date: newTransaction.date,
      payee: newTransaction.payee,
      description: newTransaction.payee,
      amount: transactionAmount,
      categoryId: isReadyToAssign ? null : newTransaction.categoryId,
      memo: newTransaction.memo,
      cleared: newTransaction.cleared ? 1 : 0
    };

    const result = await window.electronAPI.addTransaction(transactionData);
    if (!result.success) {
      throw new Error(result.error || 'Failed to add transaction');
    }

    const currentBalance = account.balance || 0;
    const newBalance = currentBalance + balanceChange;

    await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });
    
    return newBalance;
  };

  // Add scheduled transaction (for future dates) - DOES NOT AFFECT BALANCE
  const handleAddScheduledTransaction = async (amountValue, userId) => {
    const scheduledData = {
      accountId: account.id,
      date: newTransaction.date,
      payee: newTransaction.payee,
      amount: amountValue,
      transactionType: newTransaction.transactionType,
      categoryId: newTransaction.categoryId,
      memo: newTransaction.memo,
      userId: userId,
      status: 'pending'
    };

    if (!window.electronAPI.addScheduledTransaction) {
      throw new Error('Scheduled transactions not supported yet');
    }

    const result = await window.electronAPI.addScheduledTransaction(scheduledData);
    if (!result.success) {
      throw new Error(result.error || 'Failed to add scheduled transaction');
    }
    
    return null; // No balance change for scheduled transactions
  };

  // Main handler for adding transactions - decides between regular and scheduled
  const handleAddTransaction = async () => {
    setAddTransactionError(null);
    
    const amountValue = parseFloat(newTransaction.amount);
    const transactionDate = new Date(newTransaction.date);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    if (isNaN(amountValue) || amountValue === 0) {
      setAddTransactionError('Please enter a valid amount');
      return;
    }
    if (!newTransaction.payee.trim()) {
      setAddTransactionError('Please enter a payee');
      return;
    }
    if (!newTransaction.categoryId) {
      setAddTransactionError('Please select a category');
      return;
    }

    setIsSubmitting(true);

    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        setAddTransactionError('Please log in to add transaction');
        return;
      }

      const userId = userResult.data.id;
      const isFutureDate = transactionDate > today;

      let newBalance = null;
      
      if (isFutureDate) {
        // FUTURE DATE: Save as scheduled transaction - DOES NOT affect balance
        await handleAddScheduledTransaction(amountValue, userId);
        await loadScheduledTransactions();
        alert(`📅 Scheduled transaction added for ${new Date(newTransaction.date).toLocaleDateString()}\n\nThis will NOT affect your balance until approved on that date.`);
      } else {
        // TODAY/PAST DATE: Add as regular transaction - AFFECTS balance immediately
        newBalance = await handleAddRegularTransaction(amountValue, userId);
        await loadTransactions(account.id);
        alert(`✅ Transaction added successfully!\n\nNew balance: ${formatCurrency(newBalance)}`);
      }
      
      // Refresh account data
      await loadAccountData(account.id);
      
      // Dispatch events to refresh other parts of the app
      window.dispatchEvent(new CustomEvent('accounts-updated'));
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));

      // Reset form and close modal
      setShowAddTransaction(false);
      setNewTransaction({
        date: new Date().toISOString().split('T')[0],
        payee: '',
        amount: '',
        transactionType: 'outflow',
        categoryId: '',
        memo: '',
        cleared: true
      });
      
    } catch (error) {
      console.error('Error adding transaction:', error);
      setAddTransactionError(error.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const formatAccountNumber = (number) => {
    if (!number) return 'Not provided';
    const last4 = number.slice(-4);
    return `•••• •••• •••• ${last4}`;
  };

  const filteredCategories = getFilteredCategories();
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const selectedDate = new Date(newTransaction.date);
  const isFutureDate = selectedDate > today;

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
  const availableCredit = isCreditCard ? creditLimit + (account.balance || 0) : 0;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
        <div style={styles.headerTitle}>
          <h2 style={styles.title}>{account.name}</h2>
          <span style={styles.accountType}>
            {isCreditCard ? '💳 Credit Card' : account.type || 'Account'}
            {account.institution && ` • ${account.institution}`}
          </span>
        </div>
        <button onClick={() => setRefreshCounter(prev => prev + 1)} style={styles.refreshButton}>
          🔄 Refresh
        </button>
        {isCreditCard && (
          <button onClick={() => onMakePayment && onMakePayment(account.id)} style={styles.paymentButton}>
            💰 Make Payment
          </button>
        )}
      </div>

      {/* Account Summary */}
      <div style={styles.summaryCard}>
        <div style={styles.summaryRow}>
          <div style={styles.summaryItem}>
            <div style={styles.summaryLabel}>Current Balance</div>
            <div style={{ ...styles.summaryValue, color: account.balance < 0 ? '#EF4444' : '#10B981' }}>
              {formatCurrency(Math.abs(account.balance || 0))}
              {account.balance < 0 && <span style={styles.negativeIndicator}> (you owe)</span>}
            </div>
          </div>
          {isCreditCard && (
            <>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Credit Limit</div>
                <div style={styles.summaryValue}>{formatCurrency(creditLimit)}</div>
              </div>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Available Credit</div>
                <div style={styles.summaryValue}>{formatCurrency(availableCredit)}</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Scheduled Transactions Section - ONLY for future dated transactions */}
      {scheduledTransactions.length > 0 && (
        <div style={styles.scheduledSection}>
          <div 
            style={styles.scheduledHeader} 
            onClick={() => setShowScheduledSection(!showScheduledSection)}
          >
            <span style={styles.scheduledHeaderLeft}>
              <span style={styles.scheduledIcon}>📅</span>
              <span style={styles.scheduledTitle}>Scheduled Transactions</span>
              <span style={styles.scheduledCount}>({scheduledTransactions.length})</span>
            </span>
            <span style={styles.scheduledToggle}>{showScheduledSection ? '▼' : '▶'}</span>
          </div>
          
          {showScheduledSection && (
            <div style={styles.scheduledList}>
              {scheduledTransactions.map(tx => {
                const category = categories.find(c => c.id === tx.categoryId);
                return (
                  <div key={tx.id} style={styles.scheduledItem}>
                    <div style={styles.scheduledDate}>
                      {new Date(tx.date).toLocaleDateString()}
                    </div>
                    <div style={styles.scheduledInfo}>
                      <div style={styles.scheduledPayee}>{tx.payee}</div>
                      <div style={styles.scheduledCategory}>
                        {category?.name || 'Uncategorized'}
                      </div>
                    </div>
                    <div style={{
                      ...styles.scheduledAmount,
                      color: tx.transactionType === 'outflow' ? '#F87171' : '#4ADE80'
                    }}>
                      {tx.transactionType === 'outflow' ? '-' : '+'}{formatCurrency(tx.amount)}
                    </div>
                    <div style={styles.scheduledActions}>
                      <button 
                        onClick={() => handleApproveScheduled(tx)} 
                        style={styles.approveButton}
                        title="Approve and move to transactions"
                      >
                        ✅ Approve
                      </button>
                      <button 
                        onClick={() => handleRejectScheduled(tx)} 
                        style={styles.rejectButton}
                        title="Delete scheduled transaction"
                      >
                        ❌ Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Regular Transactions Header */}
      <div style={styles.transactionsHeader}>
        <h3 style={styles.transactionsTitle}>Recent Transactions</h3>
        <button onClick={() => setShowAddTransaction(true)} style={styles.addButton}>
          + Add Transaction
        </button>
      </div>

      {/* Regular Transactions List - ONLY current and past transactions */}
      <div style={styles.transactionsList}>
        {transactions.length === 0 ? (
          <div style={styles.emptyState}>
            <p>No transactions yet</p>
            <button onClick={() => setShowAddTransaction(true)} style={styles.emptyAddButton}>
              + Add Your First Transaction
            </button>
          </div>
        ) : (
          transactions.map((tx) => (
            <div key={tx.id} style={styles.transactionItem}>
              <div style={styles.transactionDate}>{new Date(tx.date).toLocaleDateString()}</div>
              <div style={styles.transactionDescription}>
                <div>{tx.payee || tx.description || 'Transaction'}</div>
              </div>
              <div style={{ ...styles.transactionAmount, color: tx.amount < 0 ? '#EF4444' : '#10B981' }}>
                {formatCurrency(tx.amount)}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add Transaction Modal */}
      {showAddTransaction && (
        <div style={styles.modalOverlay} onClick={() => setShowAddTransaction(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Add Transaction</h3>
              <button style={styles.closeButton} onClick={() => setShowAddTransaction(false)}>✕</button>
            </div>

            <div style={styles.modalBody}>
              {addTransactionError && <div style={styles.errorMessage}>⚠️ {addTransactionError}</div>}

              {/* Account Display */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Account</label>
                <div style={styles.accountDisplay}>
                  {account.name} ({account.type}) - Balance: {formatCurrency(account.balance)}
                </div>
              </div>

              {/* Transaction Type Dropdown */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Transaction Type *</label>
                <select
                  value={newTransaction.transactionType}
                  onChange={(e) => {
                    setNewTransaction({
                      ...newTransaction,
                      transactionType: e.target.value,
                      categoryId: ''
                    });
                  }}
                  style={styles.select}
                >
                  <option value="outflow">Outflow (Expense)</option>
                  <option value="inflow">Inflow (Income/Payment)</option>
                </select>
              </div>

              {/* Category Dropdown */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Category *</label>
                <select
                  value={newTransaction.categoryId}
                  onChange={(e) => setNewTransaction({ ...newTransaction, categoryId: e.target.value })}
                  style={styles.select}
                >
                  <option value="">Select a category</option>
                  {filteredCategories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Amount */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Amount *</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    value={newTransaction.amount}
                    onChange={(e) => setNewTransaction({ ...newTransaction, amount: e.target.value })}
                    style={styles.modalInput}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>

              {/* Date - CRITICAL: Shows warning for future dates */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Date *</label>
                <input
                  type="date"
                  value={newTransaction.date}
                  onChange={(e) => setNewTransaction({ ...newTransaction, date: e.target.value })}
                  style={styles.input}
                />
                {isFutureDate && (
                  <div style={styles.futureDateWarning}>
                    📅 Future date detected. This will be saved as a <strong>scheduled transaction</strong> and will NOT affect your balance until approved on {new Date(newTransaction.date).toLocaleDateString()}.
                  </div>
                )}
              </div>

              {/* Payee */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Payee *</label>
                <input
                  type="text"
                  value={newTransaction.payee}
                  onChange={(e) => setNewTransaction({ ...newTransaction, payee: e.target.value })}
                  style={styles.input}
                  placeholder="e.g., Starbucks, Rent, Paycheck"
                />
              </div>

              {/* Memo */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Memo (Optional)</label>
                <input
                  type="text"
                  value={newTransaction.memo}
                  onChange={(e) => setNewTransaction({ ...newTransaction, memo: e.target.value })}
                  style={styles.input}
                  placeholder="Additional notes"
                />
              </div>

              {/* Cleared Checkbox - only show for non-future dates */}
              {!isFutureDate && (
                <div style={styles.checkboxGroup}>
                  <label style={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={newTransaction.cleared}
                      onChange={(e) => setNewTransaction({ ...newTransaction, cleared: e.target.checked })}
                      style={styles.checkbox}
                    />
                    Mark as cleared
                  </label>
                </div>
              )}

              {/* Balance Preview - only for non-future dates */}
              {!isFutureDate && newTransaction.amount && parseFloat(newTransaction.amount) > 0 && (
                (() => {
                  const currentBalance = account.balance;
                  const amountValue = parseFloat(newTransaction.amount) || 0;
                  const balanceChange = calculateBalanceChange(account.type, newTransaction.transactionType, amountValue);
                  const newBalance = currentBalance + balanceChange;
                  
                  const isCreditOrLoan = account.type === 'credit' || account.type === 'loan';
                  const isInflow = newTransaction.transactionType === 'inflow';
                  
                  let actionText = '';
                  if (isCreditOrLoan) {
                    actionText = isInflow ? 'Payment' : 'Purchase';
                  } else {
                    actionText = isInflow ? 'Income' : 'Expense';
                  }
                  
                  return (
                    <div style={styles.balancePreview}>
                      <div style={styles.balancePreviewLabel}>New Balance after transaction:</div>
                      <div style={{
                        ...styles.balancePreviewValue,
                        color: newBalance < 0 ? '#F87171' : '#4ADE80'
                      }}>
                        {formatCurrency(Math.abs(newBalance))}
                        {newBalance < 0 && <span style={styles.balancePreviewOwed}> (you owe)</span>}
                      </div>
                      <div style={styles.balancePreviewDetail}>
                        Current: {formatCurrency(Math.abs(currentBalance))}
                        {currentBalance < 0 && ' (owed)'} → 
                        {actionText}: {formatCurrency(amountValue)} → 
                        New: {formatCurrency(Math.abs(newBalance))}
                        {newBalance < 0 && ' (owed)'}
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            <div style={styles.modalFooter}>
              <button onClick={() => setShowAddTransaction(false)} style={styles.cancelModalButton}>
                Cancel
              </button>
              <button onClick={handleAddTransaction} style={styles.submitButton} disabled={isSubmitting}>
                {isSubmitting ? 'Adding...' : (isFutureDate ? '📅 Schedule Transaction' : 'Add Transaction')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles (same as before, keeping all existing styles)
const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1000px',
    margin: '0 auto',
    color: 'white',
  },
  refreshButton: {
    padding: '0.5rem 1rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    marginBottom: '2rem',
    flexWrap: 'wrap',
  },
  backButton: {
    padding: '0.5rem 1rem',
    background: '#374151',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  headerTitle: {
    flex: 1,
  },
  title: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    margin: '0 0 0.25rem 0',
    color: 'white',
  },
  accountType: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
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
  },
  summaryCard: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    marginBottom: '2rem',
  },
  summaryRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
    gap: '1rem',
  },
  summaryItem: {
    textAlign: 'center',
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    lineHeight: '1.2',
  },
  negativeIndicator: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    display: 'block',
    fontWeight: 'normal',
  },
  scheduledSection: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    marginBottom: '2rem',
    overflow: 'hidden',
  },
  scheduledHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem 1.5rem',
    background: '#111827',
    cursor: 'pointer',
    borderBottom: '1px solid #374151',
  },
  scheduledHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  scheduledIcon: {
    fontSize: '1.25rem',
  },
  scheduledTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#F59E0B',
  },
  scheduledCount: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
  },
  scheduledToggle: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
  },
  scheduledList: {
    padding: '0.5rem',
  },
  scheduledItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #374151',
    gap: '1rem',
    ':last-child': {
      borderBottom: 'none',
    },
  },
  scheduledDate: {
    width: '90px',
    fontSize: '0.75rem',
    color: '#9CA3AF',
  },
  scheduledInfo: {
    flex: 2,
  },
  scheduledPayee: {
    fontSize: '0.875rem',
    color: 'white',
    fontWeight: '500',
  },
  scheduledCategory: {
    fontSize: '0.7rem',
    color: '#6B7280',
  },
  scheduledAmount: {
    fontSize: '0.875rem',
    fontWeight: '600',
    minWidth: '80px',
    textAlign: 'right',
  },
  scheduledActions: {
    display: 'flex',
    gap: '0.5rem',
  },
  approveButton: {
    padding: '0.25rem 0.75rem',
    background: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  rejectButton: {
    padding: '0.25rem 0.75rem',
    background: '#EF4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  transactionsHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1rem',
  },
  transactionsTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: 0,
    color: 'white',
  },
  addButton: {
    padding: '0.5rem 1rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  transactionsList: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    overflow: 'hidden',
  },
  emptyState: {
    padding: '3rem',
    textAlign: 'center',
    color: '#9CA3AF',
  },
  emptyAddButton: {
    marginTop: '1rem',
    padding: '0.5rem 1rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
  },
  transactionItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '1rem',
    borderBottom: '1px solid #374151',
  },
  transactionDate: {
    width: '100px',
    fontSize: '0.875rem',
    color: '#9CA3AF',
  },
  transactionDescription: {
    flex: 1,
    margin: '0 1rem',
  },
  transactionAmount: {
    fontSize: '1rem',
    fontWeight: '600',
    minWidth: '100px',
    textAlign: 'right',
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    backdropFilter: 'blur(4px)',
  },
  modalContent: {
    background: '#1F2937',
    borderRadius: '1rem',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem',
    borderBottom: '1px solid #374151',
  },
  modalTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: 'white',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '1.25rem',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
  },
  modalBody: {
    padding: '1.5rem',
    overflowY: 'auto',
    flex: 1,
  },
  modalFooter: {
    display: 'flex',
    gap: '1rem',
    padding: '1.5rem',
    borderTop: '1px solid #374151',
  },
  formGroup: {
    marginBottom: '1rem',
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    fontWeight: '500',
  },
  accountDisplay: {
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem',
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  futureDateWarning: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    background: 'rgba(245, 158, 11, 0.1)',
    border: '1px solid #F59E0B',
    borderRadius: '0.25rem',
    fontSize: '0.7rem',
    color: '#F59E0B',
  },
  inputWrapper: {
    position: 'relative',
  },
  currencySymbol: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9CA3AF',
    zIndex: 1,
  },
  modalInput: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 2rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem',
  },
  checkboxGroup: {
    marginTop: '0.5rem',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    cursor: 'pointer',
  },
  checkbox: {
    width: '1rem',
    height: '1rem',
    cursor: 'pointer',
  },
  balancePreview: {
    marginTop: '1rem',
    padding: '0.75rem',
    background: '#111827',
    borderRadius: '0.5rem',
    border: '1px solid #374151',
    textAlign: 'center',
  },
  balancePreviewLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem',
  },
  balancePreviewValue: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
  },
  balancePreviewOwed: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    display: 'inline',
    marginLeft: '0.25rem',
  },
  balancePreviewDetail: {
    fontSize: '0.65rem',
    color: '#6B7280',
    marginTop: '0.5rem',
  },
  errorMessage: {
    marginTop: '0.75rem',
    padding: '0.5rem',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #EF4444',
    borderRadius: '0.25rem',
    color: '#F87171',
    fontSize: '0.75rem',
    textAlign: 'center',
  },
  cancelModalButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
  },
  submitButton: {
    flex: 1,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
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