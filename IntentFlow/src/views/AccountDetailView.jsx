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
  
  // ===================== LOAN/CREDIT CARD PAYMENT STATE =====================
  const [isLoanPayment, setIsLoanPayment] = useState(false);
  const [selectedLoanAccount, setSelectedLoanAccount] = useState(null);
  const [loanAccounts, setLoanAccounts] = useState([]);
  const [paymentBreakdown, setPaymentBreakdown] = useState(null);
  
  // Edit transaction states
  const [editingTransactionId, setEditingTransactionId] = useState(null);
  const [editFormData, setEditFormData] = useState({
    date: '',
    payee: '',
    amount: '',
    categoryId: '',
    memo: ''
  });
  const [isUpdating, setIsUpdating] = useState(false);
  
  // Delete transaction states
  const [selectedTransactions, setSelectedTransactions] = useState(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Helper function to get today's date in local timezone without timezone offset
  const getTodayLocalDate = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Helper function to format date for display without timezone conversion
  const formatDisplayDate = (dateString) => {
    if (!dateString) return '';
    const [year, month, day] = dateString.split('-');
    return new Date(year, month - 1, day).toLocaleDateString();
  };
  
  // Helper function to format date for input (YYYY-MM-DD)
  const formatDateForInput = (dateString) => {
    if (!dateString) return getTodayLocalDate();
    if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) return dateString;
    const date = new Date(dateString);
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Helper function to check if a date is in the future (local timezone)
  const isFutureLocalDate = (dateString) => {
    const today = getTodayLocalDate();
    return dateString > today;
  };
  
  // Transaction form with Transaction Type and Frequency
  const [newTransaction, setNewTransaction] = useState({
    date: getTodayLocalDate(),
    payee: '',
    amount: '',
    transactionType: 'outflow',
    categoryId: '',
    memo: '',
    cleared: true,
    frequency: ''
  });

  // Frequency options for the dropdown
  const frequencyOptions = [
    { value: '', label: 'No recurrence (one-time)' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'bi-weekly', label: 'Bi-Weekly (every 2 weeks)' },
    { value: 'monthly', label: 'Monthly' }
  ];

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

  // Get all categories for editing
  const getAllCategories = () => {
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

  // Calculate balance change for a transaction (for deletion)
  const calculateBalanceChangeForTransaction = (transaction) => {
    const isCreditOrLoan = account.type === 'credit' || account.type === 'loan';
    
    if (isCreditOrLoan) {
      return transaction.amount > 0 ? transaction.amount : transaction.amount;
    } else {
      return transaction.amount > 0 ? -transaction.amount : Math.abs(transaction.amount);
    }
  };

  // ===================== LOAN PAYMENT HELPER FUNCTIONS =====================
  
  // Calculate how payment splits between interest and principal (YNAB-style)
  const calculatePaymentBreakdown = (loanAccount, paymentAmount, isFirstPaymentOfMonth = true) => {
    if (!loanAccount || !paymentAmount || paymentAmount <= 0) return null;
    
    const balance = Math.abs(loanAccount.balance || 0);
    const apr = loanAccount.interest_rate || loanAccount.apr || 0;
    const monthlyRate = apr / 100 / 12;
    
    // YNAB: Interest is calculated monthly on the current balance
    const monthlyInterest = balance * monthlyRate;
    
    let interestPortion = 0;
    let principalPortion = 0;
    
    if (isFirstPaymentOfMonth) {
      // First payment of the month: interest is deducted first
      interestPortion = Math.min(monthlyInterest, paymentAmount);
      principalPortion = paymentAmount - interestPortion;
    } else {
      // Subsequent payments in same month: entire payment goes to principal
      interestPortion = 0;
      principalPortion = paymentAmount;
    }
    
    // Ensure principal doesn't exceed balance
    if (principalPortion > balance) {
      principalPortion = balance;
      interestPortion = paymentAmount - principalPortion;
    }
    
    const newBalance = balance - principalPortion;
    
    return {
      paymentAmount,
      interestPortion: Math.max(0, interestPortion),
      principalPortion: Math.max(0, principalPortion),
      oldBalance: balance,
      newBalance: Math.max(0, newBalance),
      interestRate: apr,
      monthlyRate: monthlyRate * 100,
      monthlyInterest: monthlyInterest,
      isFirstPaymentOfMonth
    };
  };

  // Check if payee matches a loan/credit card account
  const checkIfLoanPayment = (payeeValue) => {
    if (!payeeValue || !loanAccounts.length) {
      setIsLoanPayment(false);
      setSelectedLoanAccount(null);
      setPaymentBreakdown(null);
      return false;
    }
    
    // Check for "Payment: [Account Name]" or "Transfer: [Account Name]" pattern
    const paymentPattern = /^(payment|transfer):\s*(.+)$/i;
    const match = payeeValue.match(paymentPattern);
    
    let accountName = match ? match[2].trim() : payeeValue.trim();
    
    // Find matching account - EXCLUDE the current account (can't pay yourself)
    const matchedAccount = loanAccounts.find(acc => 
      acc.id !== account?.id &&  // Don't pay the same account
      (acc.name.toLowerCase() === accountName.toLowerCase() ||
       acc.name.toLowerCase().includes(accountName.toLowerCase()))
    );
    
    if (matchedAccount) {
      setIsLoanPayment(true);
      setSelectedLoanAccount(matchedAccount);
      
      // Calculate initial payment breakdown if amount is entered
      if (newTransaction.amount && parseFloat(newTransaction.amount) > 0) {
        const breakdown = calculatePaymentBreakdown(matchedAccount, parseFloat(newTransaction.amount), true);
        setPaymentBreakdown(breakdown);
      }
      return true;
    } else {
      setIsLoanPayment(false);
      setSelectedLoanAccount(null);
      setPaymentBreakdown(null);
      return false;
    }
  };

  // ===================== CREDIT CARD AUTO TRANSFER HELPER =====================
  
  // Automatically move money from spending category to credit card payment category
  const handleCreditCardAutoTransfer = async (amount, spendingCategoryId, creditCardAccountName) => {
    try {
      console.log(`🔄 Auto-transfer triggered: $${amount} from category ${spendingCategoryId} to ${creditCardAccountName} payment category`);
      
      if (window.moveMoneyForCreditCardTransaction) {
        const result = await window.moveMoneyForCreditCardTransaction(amount, spendingCategoryId, creditCardAccountName);
        if (result) {
          console.log('✅ Auto-transfer completed successfully');
          return true;
        } else {
          console.warn('⚠️ Auto-transfer failed');
          return false;
        }
      } else {
        console.warn('⚠️ moveMoneyForCreditCardTransaction function not available. Make sure PropertyMapView is loaded.');
        return false;
      }
    } catch (error) {
      console.error('❌ Error in auto-transfer:', error);
      return false;
    }
  };

  // Load loan and credit card accounts for payment detection
  const loadLoanAccounts = async () => {
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (userResult?.success && userResult?.data) {
        const userId = userResult.data.id;
        
        const accountsResult = await window.electronAPI.getAccountsSummary(userId);
        console.log('📊 Accounts loaded via getAccountsSummary:', accountsResult);
        
        if (accountsResult?.success) {
          const allAccounts = accountsResult.data || [];
          console.log('✅ Total accounts loaded:', allAccounts.length);
          console.log('📋 Account names:', allAccounts.map(a => ({ name: a.name, type: a.type })));
          
          // Filter for credit cards and loans only
          const loanAndCreditAccounts = allAccounts.filter(acc => 
            acc.type === 'credit' || acc.type === 'loan'
          );
          
          setLoanAccounts(loanAndCreditAccounts);
          console.log('🏦 Credit/Loan accounts found:', loanAndCreditAccounts.length);
          console.log('🏦 Account names:', loanAndCreditAccounts.map(a => a.name));
        } else {
          console.error('❌ Failed to load accounts:', accountsResult.error);
        }
      }
    } catch (error) {
      console.error('Error loading loan accounts:', error);
    }
  };

  // Start editing a transaction
  const startEditing = (transaction) => {
    setEditingTransactionId(transaction.id);
    setEditFormData({
      date: formatDateForInput(transaction.date),
      payee: transaction.payee || '',
      amount: Math.abs(transaction.amount).toString(),
      categoryId: transaction.category_id || '',
      memo: transaction.memo || ''
    });
  };

  // Cancel editing
  const cancelEditing = () => {
    setEditingTransactionId(null);
    setEditFormData({
      date: '',
      payee: '',
      amount: '',
      categoryId: '',
      memo: ''
    });
  };

  // Handle edit form changes
  const handleEditChange = (field, value) => {
    setEditFormData(prev => ({ ...prev, [field]: value }));
  };

  // Save edited transaction
  const saveEditedTransaction = async (transactionId) => {
    const amountValue = parseFloat(editFormData.amount);
    
    if (isNaN(amountValue) || amountValue === 0) {
      alert('Please enter a valid amount');
      return;
    }
    
    if (!editFormData.payee.trim()) {
      alert('Please enter a payee');
      return;
    }
    
    setIsUpdating(true);
    
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('Please log in to update transaction');
        return;
      }
      
      const userId = userResult.data.id;
      const originalTransaction = transactions.find(t => t.id === transactionId);
      
      if (!originalTransaction) {
        throw new Error('Transaction not found');
      }
      
      const isExpense = originalTransaction.amount < 0;
      
      let newAmount = amountValue;
      const selectedCategory = getAllCategories().find(c => c.id === editFormData.categoryId);
      const newIsExpense = editFormData.categoryId === 'inflow_ready_to_assign' ? false : 
        (selectedCategory?.type === 'expense');
      
      if (newIsExpense !== undefined) {
        newAmount = newIsExpense ? -amountValue : amountValue;
      } else {
        newAmount = isExpense ? -amountValue : amountValue;
      }
      
      const oldAmount = originalTransaction.amount;
      const amountDifference = newAmount - oldAmount;
      
      const updateData = {
        date: editFormData.date,
        payee: editFormData.payee,
        amount: newAmount,
        categoryId: editFormData.categoryId === 'inflow_ready_to_assign' ? null : editFormData.categoryId,
        memo: editFormData.memo
      };
      
      const updateResult = await window.electronAPI.updateTransaction(transactionId, updateData);
      if (!updateResult.success) {
        throw new Error(updateResult.error || 'Failed to update transaction');
      }
      
      const currentBalance = account.balance || 0;
      const newBalance = currentBalance + amountDifference;
      await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });
      
      await loadTransactions(account.id);
      await loadAccountData(account.id);
      
      cancelEditing();
      
      window.dispatchEvent(new CustomEvent('accounts-updated'));
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
      
      alert(`✅ Transaction updated successfully!\nNew balance: ${formatCurrency(newBalance)}`);
    } catch (error) {
      console.error('Error updating transaction:', error);
      alert('Error updating transaction: ' + error.message);
    } finally {
      setIsUpdating(false);
    }
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

  // Approve a scheduled transaction
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

      const transactionData = {
        accountId: account.id,
        date: getTodayLocalDate(),
        payee: scheduledTx.payee,
        description: scheduledTx.payee,
        amount: transactionAmount,
        categoryId: isReadyToAssign ? null : scheduledTx.categoryId,
        memo: scheduledTx.memo,
        cleared: 1,
        frequency: scheduledTx.frequency || null
      };

      const addResult = await window.electronAPI.addTransaction(transactionData);
      if (!addResult.success) {
        alert('Failed to add transaction: ' + addResult.error);
        return;
      }

      const currentBalance = account.balance || 0;
      const newBalance = currentBalance + balanceChange;
      await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });

      if (window.electronAPI.deleteScheduledTransaction) {
        await window.electronAPI.deleteScheduledTransaction(scheduledTx.id);
      }

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

  // Load regular transactions
  const loadTransactions = async (id) => {
    const targetId = id || account?.id;
    if (!targetId) return;
    try {
      if (window.electronAPI?.getAccountTransactions) {
        const result = await window.electronAPI.getAccountTransactions(targetId);
        if (result.success) {
          const today = getTodayLocalDate();
          const regularTransactions = result.data.filter(tx => {
            return tx.date <= today || tx.cleared === 1;
          });
          setTransactions(regularTransactions);
        }
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
    }
  };

  // Handle transaction selection
  const handleSelectTransaction = (transactionId) => {
    const newSelected = new Set(selectedTransactions);
    if (newSelected.has(transactionId)) {
      newSelected.delete(transactionId);
    } else {
      newSelected.add(transactionId);
    }
    setSelectedTransactions(newSelected);
  };

  // Handle select all
  const handleSelectAll = () => {
    if (selectedTransactions.size === transactions.length && transactions.length > 0) {
      setSelectedTransactions(new Set());
    } else {
      const allIds = transactions.map(t => t.id);
      setSelectedTransactions(new Set(allIds));
    }
  };

  // Handle delete selected transactions
  const handleDeleteSelected = () => {
    if (selectedTransactions.size === 0) {
      alert('Please select at least one transaction to delete.');
      return;
    }
    setShowDeleteModal(true);
  };

  // Confirm deletion
  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('Please log in to delete transactions');
        return;
      }

      const userId = userResult.data.id;
      const selectedTransactionsList = transactions.filter(t => selectedTransactions.has(t.id));
      
      let totalBalanceChange = 0;
      for (const transaction of selectedTransactionsList) {
        totalBalanceChange += calculateBalanceChangeForTransaction(transaction);
      }

      for (const transaction of selectedTransactionsList) {
        const deleteResult = await window.electronAPI.deleteTransaction(transaction.id);
        if (!deleteResult.success) {
          throw new Error(`Failed to delete transaction ${transaction.id}: ${deleteResult.error}`);
        }
      }

      const currentBalance = account.balance || 0;
      const newBalance = currentBalance + totalBalanceChange;
      await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });

      await loadTransactions(account.id);
      await loadAccountData(account.id);
      
      setSelectedTransactions(new Set());
      setShowDeleteModal(false);
      
      window.dispatchEvent(new CustomEvent('accounts-updated'));
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
      
      alert(`✅ Successfully deleted ${selectedTransactionsList.length} transaction(s)!\nNew balance: ${formatCurrency(Math.abs(newBalance))}${newBalance < 0 ? ' (owed)' : ''}`);
    } catch (error) {
      console.error('Error deleting transactions:', error);
      alert('Error deleting transactions: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  // Load categories when modal opens
  useEffect(() => {
    if (showAddTransaction) {
      loadCategories();
      loadLoanAccounts();
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

  // Add regular transaction
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

    // If this is a loan payment, we need to handle it differently
    if (isLoanPayment && selectedLoanAccount) {
      // For loan payments, we create a special transaction record
      const paymentData = {
        accountId: account.id,
        date: newTransaction.date,
        payee: newTransaction.payee,
        description: newTransaction.payee,
        amount: transactionAmount,
        categoryId: null,
        memo: newTransaction.memo || `Payment to ${selectedLoanAccount.name}`,
        cleared: newTransaction.cleared ? 1 : 0,
        frequency: newTransaction.frequency || null,
        isLoanPayment: true,
        loanAccountId: selectedLoanAccount.id,
        paymentBreakdown: paymentBreakdown
      };

      const result = await window.electronAPI.addLoanPayment(paymentData);
      if (!result.success) {
        throw new Error(result.error || 'Failed to add loan payment');
      }

      const currentBalance = account.balance || 0;
      const newBalance = currentBalance + balanceChange;
      await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });
      
      if (paymentBreakdown && paymentBreakdown.principalPortion > 0) {
        const loanAccount = selectedLoanAccount;
        const newLoanBalance = loanAccount.balance + paymentBreakdown.principalPortion;
        await window.electronAPI.updateAccount(selectedLoanAccount.id, userId, { balance: newLoanBalance });
      }
      
      return newBalance;
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
      cleared: newTransaction.cleared ? 1 : 0,
      frequency: newTransaction.frequency || null
    };

    const result = await window.electronAPI.addTransaction(transactionData);
    if (!result.success) {
      throw new Error(result.error || 'Failed to add transaction');
    }

    const currentBalance = account.balance || 0;
    const newBalance = currentBalance + balanceChange;

    await window.electronAPI.updateAccount(account.id, userId, { balance: newBalance });
    
    // Auto-transfer for credit card transactions
    if (account.type === 'credit' && !isLoanPayment && isExpense && transactionData.categoryId) {
      console.log('💳 Credit card transaction detected - initiating auto-transfer to payment category');
      const creditCardName = account.name;
      await handleCreditCardAutoTransfer(amountValue, transactionData.categoryId, creditCardName);
    }
    
    return newBalance;
  };

  // Add scheduled transaction
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
      status: 'pending',
      frequency: newTransaction.frequency || null,
      isLoanPayment: isLoanPayment,
      loanAccountId: selectedLoanAccount?.id,
      paymentBreakdown: paymentBreakdown
    };

    if (!window.electronAPI.addScheduledTransaction) {
      throw new Error('Scheduled transactions not supported yet');
    }

    const result = await window.electronAPI.addScheduledTransaction(scheduledData);
    if (!result.success) {
      throw new Error(result.error || 'Failed to add scheduled transaction');
    }
    
    return null;
  };

  // Main handler for adding transactions
  const handleAddTransaction = async () => {
    setAddTransactionError(null);
    
    const amountValue = parseFloat(newTransaction.amount);
    const isFuture = isFutureLocalDate(newTransaction.date);
    
    if (isNaN(amountValue) || amountValue === 0) {
      setAddTransactionError('Please enter a valid amount');
      return;
    }
    if (!newTransaction.payee.trim()) {
      setAddTransactionError('Please enter a payee');
      return;
    }
    
    if (!isLoanPayment && !newTransaction.categoryId) {
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

      if (isFuture) {
        await handleAddScheduledTransaction(amountValue, userId);
        await loadScheduledTransactions();
        const [year, month, day] = newTransaction.date.split('-');
        const displayDate = new Date(year, month - 1, day).toLocaleDateString();
        let frequencyMessage = '';
        if (newTransaction.frequency) {
          frequencyMessage = `\n\n🔄 This is a ${newTransaction.frequency} recurring transaction.`;
        }
        let loanMessage = '';
        if (isLoanPayment && selectedLoanAccount) {
          loanMessage = `\n\n🏦 This is a payment to ${selectedLoanAccount.name}. Interest will be calculated on the approval date.`;
        }
        alert(`📅 Scheduled transaction added for ${displayDate}${frequencyMessage}${loanMessage}\n\nThis will NOT affect your balance until approved on that date.`);
      } else {
        const newBalance = await handleAddRegularTransaction(amountValue, userId);
        await loadTransactions(account.id);
        let frequencyMessage = '';
        if (newTransaction.frequency) {
          frequencyMessage = `\n\n🔄 This is a ${newTransaction.frequency} recurring transaction.`;
        }
        let loanMessage = '';
        if (isLoanPayment && selectedLoanAccount && paymentBreakdown) {
          loanMessage = `\n\n🏦 Payment to ${selectedLoanAccount.name}:\n   • Total Payment: ${formatCurrency(paymentBreakdown.paymentAmount)}\n   • Interest: ${formatCurrency(paymentBreakdown.interestPortion)}\n   • Principal: ${formatCurrency(paymentBreakdown.principalPortion)}\n   • New Balance: ${formatCurrency(paymentBreakdown.newBalance)}`;
          if (paymentBreakdown.isFirstPaymentOfMonth && paymentBreakdown.interestPortion > 0) {
            loanMessage += `\n\n💡 Interest calculated at ${paymentBreakdown.interestRate}% APR (${paymentBreakdown.monthlyRate.toFixed(2)}% monthly)`;
          } else if (!paymentBreakdown.isFirstPaymentOfMonth && paymentBreakdown.interestPortion === 0) {
            loanMessage += `\n\n💡 Since you've already made a payment this month, the entire payment goes to principal (no additional interest).`;
          }
        }
        
        let autoTransferMessage = '';
        if (account.type === 'credit' && !isLoanPayment && newTransaction.transactionType === 'outflow' && newTransaction.categoryId) {
          autoTransferMessage = `\n\n💳 Auto-transfer: $${amountValue.toFixed(2)} moved from "${categories.find(c => c.id === newTransaction.categoryId)?.name || 'spending category'}" to "${account.name} Payment" category.`;
        }
        
        alert(`✅ Transaction added successfully!${frequencyMessage}${loanMessage}${autoTransferMessage}\n\nNew balance: ${formatCurrency(newBalance)}`);
      }
      
      await loadAccountData(account.id);
      
      window.dispatchEvent(new CustomEvent('accounts-updated'));
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));

      setShowAddTransaction(false);
      setNewTransaction({
        date: getTodayLocalDate(),
        payee: '',
        amount: '',
        transactionType: 'outflow',
        categoryId: '',
        memo: '',
        cleared: true,
        frequency: ''
      });
      setIsLoanPayment(false);
      setSelectedLoanAccount(null);
      setPaymentBreakdown(null);
      
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
  const isFutureDate = isFutureLocalDate(newTransaction.date);

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
  
  // Check if this is a loan account for special display
  const isLoanAccount = account.type === 'loan';
  
  // Calculate loan statistics if this is a loan account
  const loanStats = isLoanAccount ? (() => {
    const originalBalance = account.original_balance || Math.abs(account.balance);
    const progress = originalBalance > 0 ? ((originalBalance - Math.abs(account.balance)) / originalBalance) * 100 : 0;
    return { progress: Math.min(100, Math.max(0, progress)), originalBalance };
  })() : null;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={onBack} style={styles.backButton}>← Back</button>
        <div style={styles.headerTitle}>
          <h2 style={styles.title}>{account.name}</h2>
          <span style={styles.accountType}>
            {isCreditCard ? '💳 Credit Card' : isLoanAccount ? '🏦 Loan' : account.type || 'Account'}
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
          {isLoanAccount && loanStats && (
            <>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Original Balance</div>
                <div style={styles.summaryValue}>{formatCurrency(loanStats.originalBalance)}</div>
              </div>
              <div style={styles.summaryItem}>
                <div style={styles.summaryLabel}>Progress</div>
                <div style={styles.summaryValue}>{loanStats.progress.toFixed(1)}%</div>
              </div>
            </>
          )}
        </div>
        {isLoanAccount && loanStats && (
          <div style={styles.progressSection}>
            <div style={styles.progressBar}>
              <div style={{ ...styles.progressFill, width: `${loanStats.progress}%` }} />
            </div>
          </div>
        )}
      </div>

      {/* Scheduled Transactions Section */}
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
                      {formatDisplayDate(tx.date)}
                    </div>
                    <div style={styles.scheduledInfo}>
                      <div style={styles.scheduledPayee}>{tx.payee}</div>
                      <div style={styles.scheduledCategory}>
                        {tx.isLoanPayment ? '🏦 Loan Payment (Auto)' : (category?.name || 'Uncategorized')}
                      </div>
                      {tx.frequency && (
                        <div style={styles.scheduledFrequency}>
                          🔄 {tx.frequency}
                        </div>
                      )}
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
        <div style={styles.headerButtons}>
          {selectedTransactions.size > 0 && (
            <button 
              onClick={handleDeleteSelected} 
              style={styles.deleteSelectedButton}
            >
              🗑️ Delete Selected ({selectedTransactions.size})
            </button>
          )}
          <button onClick={() => setShowAddTransaction(true)} style={styles.addButton}>
            + Add Transaction
          </button>
        </div>
      </div>

      {/* Regular Transactions List */}
      <div style={styles.transactionsList}>
        {transactions.length === 0 ? (
          <div style={styles.emptyState}>
            <p>No transactions yet</p>
            <button onClick={() => setShowAddTransaction(true)} style={styles.emptyAddButton}>
              + Add Your First Transaction
            </button>
          </div>
        ) : (
          <>
            {/* Header Row with Select All */}
            <div style={styles.transactionHeaderRow}>
              <div style={styles.checkboxCell}>
                <input
                  type="checkbox"
                  checked={selectedTransactions.size === transactions.length && transactions.length > 0}
                  onChange={handleSelectAll}
                  style={styles.checkbox}
                />
              </div>
              <div style={styles.transactionDateHeader}>Date</div>
              <div style={styles.transactionDescriptionHeader}>Description</div>
              <div style={styles.transactionAmountHeader}>Amount</div>
              <div style={styles.transactionActionsHeader}>Actions</div>
            </div>
            
            {/* Transaction Rows with Inline Editing */}
            {transactions.map((tx) => {
              const isEditing = editingTransactionId === tx.id;
              const category = categories.find(c => c.id === tx.category_id);
              
              // Determine transaction type display
              const isInflowToLoan = isLoanAccount && tx.amount > 0 && tx.isLoanPaymentInflow;
              const isInterestCharge = tx.isInterestCharge;
              const isPrincipalPayment = tx.isPrincipalPayment;
              
              if (isEditing) {
                const editCategories = getAllCategories();
                
                return (
                  <div key={tx.id} style={styles.transactionRowEditing}>
                    <div style={styles.checkboxCell}>
                      <input
                        type="checkbox"
                        checked={selectedTransactions.has(tx.id)}
                        onChange={() => handleSelectTransaction(tx.id)}
                        style={styles.checkbox}
                        disabled={true}
                      />
                    </div>
                    <div style={styles.transactionDate}>
                      <input
                        type="date"
                        value={editFormData.date}
                        onChange={(e) => handleEditChange('date', e.target.value)}
                        style={styles.editInput}
                      />
                    </div>
                    <div style={styles.transactionDescription}>
                      <input
                        type="text"
                        value={editFormData.payee}
                        onChange={(e) => handleEditChange('payee', e.target.value)}
                        style={styles.editInput}
                        placeholder="Payee"
                      />
                    </div>
                    <div style={styles.transactionAmount}>
                      <div style={styles.editAmountWrapper}>
                        <span style={styles.currencySymbolSmall}>$</span>
                        <input
                          type="number"
                          value={editFormData.amount}
                          onChange={(e) => handleEditChange('amount', e.target.value)}
                          style={styles.editAmountInput}
                          step="0.01"
                          min="0"
                        />
                      </div>
                    </div>
                    <div style={styles.transactionActions}>
                      <button 
                        onClick={() => saveEditedTransaction(tx.id)} 
                        style={styles.saveButton}
                        disabled={isUpdating}
                      >
                        {isUpdating ? '💾 Saving...' : '💾 Save'}
                      </button>
                      <button 
                        onClick={cancelEditing} 
                        style={styles.cancelButton}
                        disabled={isUpdating}
                      >
                        ✕ Cancel
                      </button>
                    </div>
                  </div>
                );
              } else {
                return (
                  <div key={tx.id} style={styles.transactionItem}>
                    <div style={styles.checkboxCell}>
                      <input
                        type="checkbox"
                        checked={selectedTransactions.has(tx.id)}
                        onChange={() => handleSelectTransaction(tx.id)}
                        style={styles.checkbox}
                      />
                    </div>
                    <div style={styles.transactionDate}>{formatDisplayDate(tx.date)}</div>
                    <div style={styles.transactionDescription}>
                      <div>{tx.payee || tx.description || 'Transaction'}</div>
                      {isInterestCharge && (
                        <div style={styles.interestBadgeSmall}>💰 Interest Charge</div>
                      )}
                      {isPrincipalPayment && (
                        <div style={styles.principalBadgeSmall}>📉 Principal Payment</div>
                      )}
                      {isInflowToLoan && !isInterestCharge && !isPrincipalPayment && (
                        <div style={styles.paymentBadgeSmall}>💵 Payment Received</div>
                      )}
                      {tx.isLoanPayment && !isInflowToLoan && !isInterestCharge && (
                        <div style={styles.loanPaymentBadgeSmall}>🏦 Loan Payment</div>
                      )}
                    </div>
                    <div style={{ ...styles.transactionAmount, color: tx.amount < 0 ? '#EF4444' : '#10B981' }}>
                      {formatCurrency(tx.amount)}
                      {isInterestCharge && tx.interestRate && (
                        <div style={styles.interestRateSmall}>@{tx.interestRate}% APR</div>
                      )}
                    </div>
                    <div style={styles.transactionActions}>
                      <button 
                        onClick={() => startEditing(tx)} 
                        style={styles.editButton}
                      >
                        ✏️ Edit
                      </button>
                    </div>
                  </div>
                );
              }
            })}
          </>
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
                  {account.name} ({account.type}) - Balance: {formatCurrency(Math.abs(account.balance))}{account.balance < 0 ? ' (owed)' : ''}
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
                    if (newTransaction.payee) {
                      checkIfLoanPayment(newTransaction.payee);
                    }
                  }}
                  style={styles.select}
                  disabled={isLoanPayment}
                >
                  <option value="outflow">Outflow (Expense)</option>
                  <option value="inflow">Inflow (Income/Payment)</option>
                </select>
              </div>

              {/* Category Dropdown - Grayed out for loan payments */}
              <div style={styles.formGroup}>
                <label style={{ ...styles.label, ...(isLoanPayment ? styles.disabledLabel : {}) }}>
                  Category {isLoanPayment && <span style={styles.autoManagedBadge}>(Auto-managed for loan payment)</span>}
                </label>
                {isLoanPayment ? (
                  <div style={styles.loanPaymentInfo}>
                    <div style={styles.loanPaymentBadge}>
                      🏦 Loan Payment (YNAB-style)
                    </div>
                    <div style={styles.loanPaymentMessage}>
                      This is a payment to <strong>{selectedLoanAccount?.name}</strong>.
                      The payment will be split: interest first, then principal.
                      A corresponding inflow will appear in your loan account.
                    </div>
                    {paymentBreakdown && paymentBreakdown.paymentAmount > 0 && (
                      <div style={styles.paymentBreakdown}>
                        <div style={styles.breakdownTitle}>Payment Breakdown (YNAB-style):</div>
                        <div style={styles.breakdownRow}>
                          <span>Total Payment:</span>
                          <strong>${paymentBreakdown.paymentAmount.toFixed(2)}</strong>
                        </div>
                        <div style={styles.breakdownRow}>
                          <span>Interest Portion:</span>
                          <strong style={{ color: '#F59E0B' }}>${paymentBreakdown.interestPortion.toFixed(2)}</strong>
                        </div>
                        <div style={styles.breakdownRow}>
                          <span>Principal Reduction:</span>
                          <strong style={{ color: '#10B981' }}>${paymentBreakdown.principalPortion.toFixed(2)}</strong>
                        </div>
                        <div style={styles.breakdownRow}>
                          <span>Remaining Balance:</span>
                          <strong>${paymentBreakdown.newBalance.toFixed(2)}</strong>
                        </div>
                        <div style={styles.breakdownNote}>
                          ℹ️ Interest calculated at {paymentBreakdown.interestRate}% APR ({paymentBreakdown.monthlyRate.toFixed(2)}% monthly)
                          {paymentBreakdown.isFirstPaymentOfMonth ? 
                            ' - First payment of the month (interest applied)' : 
                            ' - Subsequent payment this month (no additional interest)'}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
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
                )}
              </div>

              {/* Amount */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Amount *</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    value={newTransaction.amount}
                    onChange={(e) => {
                      const newAmount = e.target.value;
                      setNewTransaction({ ...newTransaction, amount: newAmount });
                      if (isLoanPayment && selectedLoanAccount && newAmount && parseFloat(newAmount) > 0) {
                        const breakdown = calculatePaymentBreakdown(selectedLoanAccount, parseFloat(newAmount), true);
                        setPaymentBreakdown(breakdown);
                      }
                    }}
                    style={styles.modalInput}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>

              {/* Date */}
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
                    📅 Future date detected. This will be saved as a <strong>scheduled transaction</strong> and will NOT affect your balance until approved on {formatDisplayDate(newTransaction.date)}.
                  </div>
                )}
              </div>

              {/* Payee */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Payee *</label>
                <input
                  type="text"
                  value={newTransaction.payee}
                  onChange={(e) => {
                    const newPayee = e.target.value;
                    setNewTransaction({ ...newTransaction, payee: newPayee });
                    checkIfLoanPayment(newPayee);
                  }}
                  style={styles.input}
                  placeholder={isLoanPayment ? `Payment/Transfer: ${selectedLoanAccount?.name || 'Loan'}` : "e.g., Starbucks, Rent, Paycheck"}
                />
                {!isLoanPayment && (
                  <div style={styles.payeeHint}>
                    💡 For loan payments, enter "Payment: [Loan Name]" or "Transfer: [Loan Name]" (e.g., "Payment: Car Loan")
                  </div>
                )}
              </div>

              {/* Frequency Field */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Frequency (Optional)</label>
                <select
                  value={newTransaction.frequency}
                  onChange={(e) => setNewTransaction({ ...newTransaction, frequency: e.target.value })}
                  style={styles.select}
                >
                  {frequencyOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <div style={styles.hint}>
                  💡 Set how often this transaction repeats. Leave as "No recurrence" for one-time transactions.
                </div>
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

              {/* Cleared Checkbox */}
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

              {/* Balance Preview */}
              {!isFutureDate && newTransaction.amount && parseFloat(newTransaction.amount) > 0 && !isLoanPayment && (
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

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div style={styles.modalOverlay} onClick={() => !isDeleting && setShowDeleteModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Confirm Delete</h3>
              <button style={styles.closeButton} onClick={() => !isDeleting && setShowDeleteModal(false)}>✕</button>
            </div>
            
            <div style={styles.modalBody}>
              <p style={styles.confirmText}>
                Are you sure you want to delete <strong>{selectedTransactions.size}</strong> transaction(s)?
              </p>
              <div style={styles.confirmDetails}>
                <div style={styles.confirmDetailItem}>
                  <span>Current Balance:</span>
                  <strong>{formatCurrency(Math.abs(account.balance))}{account.balance < 0 ? ' (owed)' : ''}</strong>
                </div>
                {(() => {
                  const selectedTransactionsList = transactions.filter(t => selectedTransactions.has(t.id));
                  const totalImpact = selectedTransactionsList.reduce((sum, t) => sum + calculateBalanceChangeForTransaction(t), 0);
                  return (
                    <div style={styles.confirmDetailItem}>
                      <span>Balance Change:</span>
                      <strong style={{ color: totalImpact >= 0 ? '#4ADE80' : '#F87171' }}>
                        {totalImpact >= 0 ? '+' : ''}{formatCurrency(Math.abs(totalImpact))}
                      </strong>
                    </div>
                  );
                })()}
                <div style={styles.confirmDetailItem}>
                  <span>New Balance:</span>
                  <strong style={{ color: '#4ADE80' }}>
                    {formatCurrency(Math.abs(account.balance + transactions.filter(t => selectedTransactions.has(t.id)).reduce((sum, t) => sum + calculateBalanceChangeForTransaction(t), 0)))}
                  </strong>
                </div>
              </div>
              <p style={styles.confirmWarning}>
                ⚠️ This action cannot be undone.
              </p>
            </div>
            
            <div style={styles.modalFooter}>
              <button 
                style={styles.cancelModalButton} 
                onClick={() => setShowDeleteModal(false)}
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button 
                style={styles.deleteConfirmButton} 
                onClick={confirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : `Delete ${selectedTransactions.size} Transaction(s)`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Styles
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
  progressSection: {
    marginTop: '1rem',
    paddingTop: '0.5rem',
  },
  progressBar: {
    height: '0.5rem',
    background: '#374151',
    borderRadius: '0.25rem',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
    transition: 'width 0.3s ease',
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
  scheduledFrequency: {
    fontSize: '0.6rem',
    color: '#F59E0B',
    marginTop: '0.25rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem',
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
  headerButtons: {
    display: 'flex',
    gap: '1rem',
    alignItems: 'center',
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
  deleteSelectedButton: {
    padding: '0.5rem 1rem',
    background: '#EF4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
  },
  transactionsList: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    overflow: 'hidden',
  },
  transactionHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #374151',
    background: '#111827',
    fontWeight: '600',
    color: '#9CA3AF',
    fontSize: '0.75rem',
  },
  checkboxCell: {
    width: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  transactionDateHeader: {
    width: '100px',
  },
  transactionDescriptionHeader: {
    flex: 1,
  },
  transactionAmountHeader: {
    width: '100px',
    textAlign: 'right',
  },
  transactionActionsHeader: {
    width: '100px',
    textAlign: 'center',
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
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #374151',
    transition: 'background-color 0.2s',
  },
  transactionRowEditing: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.75rem 1rem',
    borderBottom: '1px solid #374151',
    background: 'rgba(16, 185, 129, 0.1)',
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
    width: '100px',
    textAlign: 'right',
  },
  transactionActions: {
    width: '100px',
    display: 'flex',
    justifyContent: 'center',
    gap: '0.5rem',
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer',
  },
  editButton: {
    padding: '0.25rem 0.75rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  saveButton: {
    padding: '0.25rem 0.75rem',
    background: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  cancelButton: {
    padding: '0.25rem 0.75rem',
    background: '#6B7280',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.7rem',
    cursor: 'pointer',
  },
  editInput: {
    width: '90%',
    padding: '0.4rem',
    background: '#111827',
    border: '1px solid #10B981',
    borderRadius: '0.375rem',
    color: 'white',
    fontSize: '0.875rem',
  },
  editAmountWrapper: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
  },
  currencySymbolSmall: {
    position: 'absolute',
    left: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.7rem',
  },
  editAmountInput: {
    width: '100%',
    padding: '0.4rem 0.4rem 0.4rem 1.5rem',
    background: '#111827',
    border: '1px solid #10B981',
    borderRadius: '0.375rem',
    color: 'white',
    fontSize: '0.875rem',
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
  disabledLabel: {
    opacity: 0.6,
  },
  autoManagedBadge: {
    fontSize: '0.7rem',
    color: '#F59E0B',
    marginLeft: '0.5rem',
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
  hint: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.7rem',
    color: '#6B7280',
  },
  payeeHint: {
    marginTop: '0.25rem',
    fontSize: '0.65rem',
    color: '#6B7280',
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
  deleteConfirmButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#EF4444',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
  },
  confirmText: {
    color: 'white',
    marginBottom: '1rem',
    fontSize: '1rem',
  },
  confirmDetails: {
    background: '#111827',
    padding: '1rem',
    borderRadius: '0.5rem',
    marginBottom: '1rem',
  },
  confirmDetailItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    borderBottom: '1px solid #374151',
  },
  confirmWarning: {
    color: '#F87171',
    fontSize: '0.875rem',
    textAlign: 'center',
    marginTop: '1rem',
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
  // Loan payment specific styles
  loanPaymentInfo: {
    background: 'linear-gradient(135deg, #1E3A5F, #0F172A)',
    padding: '1rem',
    borderRadius: '0.75rem',
    border: '1px solid #F59E0B',
  },
  loanPaymentBadge: {
    fontSize: '0.7rem',
    color: '#F59E0B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
    fontWeight: 'bold',
  },
  loanPaymentMessage: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginBottom: '0.75rem',
  },
  loanPaymentBadgeSmall: {
    fontSize: '0.6rem',
    color: '#F59E0B',
    marginTop: '0.25rem',
    display: 'inline-block',
    background: 'rgba(245, 158, 11, 0.1)',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
  },
  interestBadgeSmall: {
    fontSize: '0.6rem',
    color: '#F59E0B',
    marginTop: '0.25rem',
    display: 'inline-block',
    background: 'rgba(245, 158, 11, 0.1)',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
  },
  principalBadgeSmall: {
    fontSize: '0.6rem',
    color: '#10B981',
    marginTop: '0.25rem',
    display: 'inline-block',
    background: 'rgba(16, 185, 129, 0.1)',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
  },
  paymentBadgeSmall: {
    fontSize: '0.6rem',
    color: '#3B82F6',
    marginTop: '0.25rem',
    display: 'inline-block',
    background: 'rgba(59, 130, 246, 0.1)',
    padding: '0.125rem 0.375rem',
    borderRadius: '0.25rem',
  },
  interestRateSmall: {
    fontSize: '0.55rem',
    color: '#9CA3AF',
    marginTop: '0.125rem',
    textAlign: 'right',
  },
  paymentBreakdown: {
    background: '#111827',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    marginTop: '0.75rem',
  },
  breakdownTitle: {
    fontSize: '0.75rem',
    fontWeight: 'bold',
    color: '#9CA3AF',
    marginBottom: '0.5rem',
    textTransform: 'uppercase',
  },
  breakdownRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.25rem 0',
    fontSize: '0.875rem',
    borderBottom: '1px solid #374151',
  },
  breakdownNote: {
    fontSize: '0.65rem',
    color: '#6B7280',
    marginTop: '0.5rem',
    textAlign: 'center',
  },
};

export default AccountDetailView;