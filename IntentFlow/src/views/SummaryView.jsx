// src/views/SummaryView.jsx
import React, { useState, useEffect, useCallback } from 'react';
import PM from '../constants/pmTheme.js';

const SummaryView = ({
  totalAvailable = 0,
  totalActivity = 0,
  totalAssigned = 0,
  unassigned = 0,
  month = new Date().toLocaleString('default', { month: 'long', year: 'numeric' }),
  categories = [],
  onAutoAssign = null,
  underfundedTotal = 0,
}) => {
  const [showAutoAssignOptions, setShowAutoAssignOptions] = useState(false);
  const [selectedStrategy, setSelectedStrategy] = useState('priority_weighted');
  const [previewResults, setPreviewResults] = useState(null);
  const [isCalculating, setIsCalculating] = useState(false);
  const [priorityWeights, setPriorityWeights] = useState({
    urgency: 0.4,
    importance: 0.35,
    risk: 0.25
  });

  // Add Transaction Modal State
  const [showAddTransactionModal, setShowAddTransactionModal] = useState(false);
  const [transactionForm, setTransactionForm] = useState({
    accountId: '',
    transactionType: 'outflow',
    categoryId: '',
    amount: '',
    date: new Date().toISOString().split('T')[0],
    payee: '',
    payeeId: null,
    isTransfer: false,
    transferAccountId: null,
    memo: '',
    cleared: true
  });
  const [accounts, setAccounts] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transactionError, setTransactionError] = useState('');

  // ===================== PAYEE DROPDOWN STATE =====================
  const [payees, setPayees] = useState({ transferPayees: [], regularPayees: [] });
  const [loadingPayees, setLoadingPayees] = useState(false);

  // Add safety for categories
  const safeCategories = Array.isArray(categories) ? categories : [];

  // Format currency
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  // ===================== PAYEE DROPDOWN FUNCTIONS =====================

  // Fetch payees for dropdown (transfers + regular payees)
  const fetchPayees = async () => {
    setLoadingPayees(true);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (userResult?.success && userResult?.data) {
        const userId = userResult.data.id;

        // Get all accounts for transfer payees
        const accountsResult = await window.electronAPI.getAccountsSummary(userId);
        const allAccounts = accountsResult?.success ? (accountsResult.data || []) : [];

        // Generate transfer payees from all accounts
        const transferPayees = allAccounts.map(acc => ({
          id: `transfer_${acc.id}`,
          name: `Transfer: ${acc.name}`,
          isTransfer: true,
          transferAccountId: acc.id,
          accountType: acc.type
        }));

        // Get regular payees from payees table
        let regularPayees = [];
        try {
          const payeesResult = await window.electronAPI.getPayees(userId);
          if (payeesResult?.success) {
            regularPayees = (payeesResult.data || [])
              .filter(p => !p.is_transfer_payee)
              .map(p => ({
                id: p.id,
                name: p.name,
                isTransfer: false,
                usageCount: p.usage_count
              }));
          }
        } catch (err) {
          console.log('Payees table not yet set up, using empty list');
        }

        setPayees({ transferPayees, regularPayees });
      }
    } catch (error) {
      console.error('Error fetching payees:', error);
    } finally {
      setLoadingPayees(false);
    }
  };

  // Handle payee selection from dropdown
  const handlePayeeSelect = (payee) => {
    if (payee.isTransfer) {
      // Transfer selected - category disabled
      setTransactionForm(prev => ({
        ...prev,
        payee: payee.name,
        payeeId: payee.id,
        isTransfer: true,
        transferAccountId: payee.transferAccountId,
        categoryId: ''
      }));
    } else {
      // Regular payee selected - category enabled
      setTransactionForm(prev => ({
        ...prev,
        payee: payee.name,
        payeeId: payee.id,
        isTransfer: false,
        transferAccountId: null
      }));
    }
  };

  // Save a new regular payee to the database
  const savePayee = async (payeeName, userId) => {
    try {
      const result = await window.electronAPI.createOrUpdatePayee({
        name: payeeName,
        userId: userId,
        isTransferPayee: false
      });
      return result.success ? result.data?.id : null;
    } catch (error) {
      console.error('Error saving payee:', error);
      return null;
    }
  };

  // Render payee dropdown with two sections
  const renderPayeeDropdown = () => {
    return (
      <select
        value={transactionForm.payee}
        onChange={(e) => {
          const selectedValue = e.target.value;
          if (selectedValue === '__manual__') {
            // Allow manual entry - clear payee and show text input
            setTransactionForm(prev => ({
              ...prev,
              payee: '',
              payeeId: null,
              isTransfer: false,
              transferAccountId: null
            }));
            return;
          }
          try {
            const payee = JSON.parse(selectedValue);
            handlePayeeSelect(payee);
          } catch (err) {
            setTransactionForm(prev => ({ ...prev, payee: selectedValue, isTransfer: false }));
          }
        }}
        style={styles.select}
      >
        <option value="">-- Select or enter payee --</option>

        {/* Section 1: Payments & Transfers */}
        {payees.transferPayees.length > 0 && (
          <optgroup label="📤 PAYMENTS & TRANSFERS">
            {payees.transferPayees.map(payee => (
              <option key={payee.id} value={JSON.stringify(payee)}>
                {payee.name}
              </option>
            ))}
          </optgroup>
        )}

        {/* Section 2: Recent Payees */}
        {payees.regularPayees.length > 0 && (
          <optgroup label="📋 RECENT PAYEES">
            {payees.regularPayees.map(payee => (
              <option key={payee.id} value={JSON.stringify(payee)}>
                {payee.name}
              </option>
            ))}
          </optgroup>
        )}

        <option value="__manual__">✏️ Other (type manually)</option>
      </select>
    );
  };

  // Load accounts for dropdown - get ALL account types (checking, savings, credit, loan)
  const loadAccounts = async () => {
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (userResult?.success && userResult?.data) {
        const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
        if (accountsResult?.success) {
          const allAccounts = accountsResult.data || [];
          setAccounts(allAccounts);
          console.log('📋 Loaded all accounts for dropdown:', {
            total: allAccounts.length,
            types: allAccounts.map(a => a.type)
          });
        }
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      setAccounts([]);
    }
  };

  // Load accounts when component mounts
  useEffect(() => {
    loadAccounts();
  }, []);

  // Refresh accounts when modal closes (in case accounts were updated elsewhere)
  useEffect(() => {
    if (!showAddTransactionModal) {
      loadAccounts();
    }
  }, [showAddTransactionModal]);

  // Fetch payees when modal opens
  useEffect(() => {
    if (showAddTransactionModal) {
      fetchPayees();
    }
  }, [showAddTransactionModal]);

  // Listen for global accounts-updated events
  useEffect(() => {
    const handleAccountsUpdated = () => {
      console.log('📢 accounts-updated event received, refreshing accounts');
      loadAccounts();
    };

    window.addEventListener('accounts-updated', handleAccountsUpdated);
    return () => window.removeEventListener('accounts-updated', handleAccountsUpdated);
  }, []);

  // Fix getFilteredCategories
  const getFilteredCategories = () => {
    if (transactionForm.transactionType === 'inflow') {
      return [{ id: 'inflow_ready_to_assign', name: 'Inflow: Ready to Assign' }];
    }
    // For outflow, show all non-archived categories
    if (!safeCategories || safeCategories.length === 0) {
      return [];
    }
    return safeCategories.filter(cat => cat && !cat.archived);
  };

  // Helper function to calculate balance change
  const calculateBalanceChange = (accountType, transactionType, amount) => {
    const isCreditOrLoan = accountType === 'credit' || accountType === 'loan';
    const isExpense = transactionType === 'outflow';
    const absAmount = Math.abs(amount);

    if (isCreditOrLoan) {
      if (isExpense) {
        return -absAmount;
      } else {
        return absAmount;
      }
    } else {
      if (isExpense) {
        return -absAmount;
      } else {
        return absAmount;
      }
    }
  };

  // Handle transaction submission with proper account balance updates
  const handleAddTransaction = async () => {
    setTransactionError('');

    const amountValue = parseFloat(transactionForm.amount);
    if (isNaN(amountValue) || amountValue === 0) {
      setTransactionError('Please enter a valid amount');
      return;
    }

    if (!transactionForm.payee.trim()) {
      setTransactionError('Please select or enter a payee');
      return;
    }

    if (!transactionForm.accountId) {
      setTransactionError('Please select an account');
      return;
    }

    if (!transactionForm.isTransfer && !transactionForm.categoryId) {
      setTransactionError('Please select a category');
      return;
    }

    setIsSubmitting(true);

    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        setTransactionError('Please log in to add transaction');
        return;
      }

      const userId = userResult.data.id;
      const selectedAccount = accounts.find(a => a.id === transactionForm.accountId);

      if (!selectedAccount) {
        setTransactionError('Selected account not found');
        return;
      }

      const isCreditOrLoan = selectedAccount.type === 'credit' || selectedAccount.type === 'loan';
      const isExpense = transactionForm.transactionType === 'outflow';

      let transactionAmount = 0;

      // Calculate signed transaction amount for the ledger
      if (isCreditOrLoan) {
        if (isExpense) {
          transactionAmount = -Math.abs(amountValue);
        } else {
          transactionAmount = Math.abs(amountValue);
        }
      } else {
        if (isExpense) {
          transactionAmount = -Math.abs(amountValue);
        } else {
          transactionAmount = Math.abs(amountValue);
        }
      }

      const isReadyToAssign = transactionForm.transactionType === 'inflow' &&
        transactionForm.categoryId === 'inflow_ready_to_assign';

      // Save payee to payees table if this is a regular transaction (not a transfer)
      let finalPayeeId = transactionForm.payeeId;
      if (!transactionForm.isTransfer && transactionForm.payee && !finalPayeeId) {
        finalPayeeId = await savePayee(transactionForm.payee, userId);
      }

      // Step 1: Add the transaction
      const transactionData = {
        accountId: transactionForm.accountId,
        date: transactionForm.date,
        payee: transactionForm.payee,
        description: transactionForm.payee,
        amount: transactionAmount,
        categoryId: isReadyToAssign ? null : transactionForm.categoryId,
        memo: transactionForm.memo,
        cleared: transactionForm.cleared ? 1 : 0,
        payeeId: finalPayeeId,
        isTransfer: transactionForm.isTransfer ? 1 : 0,
        transferAccountId: transactionForm.transferAccountId
      };

      console.log('📝 Adding transaction:', transactionData);
      const transactionResult = await window.electronAPI.addTransaction(transactionData);

      if (!transactionResult.success) {
        console.error('❌ Transaction failed:', transactionResult.error);
        setTransactionError(transactionResult.error || 'Failed to add transaction');
        return;
      }

      console.log('✅ Transaction added successfully:', transactionResult.data);

      await loadAccounts();

      const verifyResult = await window.electronAPI.getAccountsSummary(userId);
      let displayedBalance = null;
      if (verifyResult?.success) {
        const updatedAccount = verifyResult.data.find(a => a.id === selectedAccount.id);
        if (updatedAccount) displayedBalance = updatedAccount.balance;
      }

      window.dispatchEvent(new CustomEvent('accounts-updated', {
        detail: { accountId: selectedAccount.id, newBalance: displayedBalance }
      }));
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));

      // Reset form and close modal
      setTransactionForm({
        accountId: '',
        transactionType: 'outflow',
        categoryId: '',
        amount: '',
        date: new Date().toISOString().split('T')[0],
        payee: '',
        payeeId: null,
        isTransfer: false,
        transferAccountId: null,
        memo: '',
        cleared: true
      });

      setShowAddTransactionModal(false);
      fetchPayees();
      const balanceLine = displayedBalance != null ? `\nNew balance: ${formatCurrency(displayedBalance)}` : '';
      alert(`✅ Transaction added successfully!\n\nAccount: ${selectedAccount.name}${balanceLine}`);

    } catch (error) {
      console.error('❌ Error in transaction flow:', error);
      setTransactionError('An unexpected error occurred: ' + error.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Add regular transaction (for today/past dates)
  const handleAddRegularTransaction = async (amountValue, userId) => {
    if (!account) throw new Error('No account loaded');

    const isCreditOrLoan = account.type === 'credit' || account.type === 'loan';
    const isExpense = transactionForm.transactionType === 'outflow';

    let transactionAmount = 0;

    // ==================== HANDLE CREDIT CARD TRANSFER (Using new linked transfer API) ====================
    if (transactionForm.isTransfer && selectedCreditCardCategory && account.type !== 'credit') {
      console.log('💳 Processing credit card transfer using linked transfer API');

      // Use the new createLinkedTransfer API
      const transferResult = await window.electronAPI.createLinkedTransfer({
        sourceAccountId: account.id,
        destinationAccountId: transactionForm.transferAccountId,
        amount: amountValue,
        date: transactionForm.date,
        sourcePayeeName: transactionForm.payee,
        memo: transactionForm.memo || `Payment to ${selectedCreditCardCategory?.name}`,
        cleared: transactionForm.cleared
      });

      if (!transferResult.success) {
        throw new Error(transferResult.error || 'Failed to create credit card transfer');
      }

      console.log('✅ Credit card transfer created:', transferResult.data);

      // Refresh account data to show updated balance
      await loadAccountData(account.id);

      // Also refresh the credit card account data (optional - will be refreshed when user navigates)
      window.dispatchEvent(new CustomEvent('accounts-updated'));

      return transferResult.data.sourceNewBalance;
    }

    // ==================== HANDLE LOAN PAYMENT (YNAB-style with interest calculation) ====================
    console.log('🔍 Loan payment check:', { isLoanPayment, selectedLoanAccount });

    if (transactionForm.isTransfer && isLoanPayment && selectedLoanAccount) {
      console.log('🏦 Processing loan payment using existing createLoanPaymentTransaction');
      const result = await createLoanPaymentTransaction(amountValue, userId);
      return result.newBalance;
    }

    // ==================== HANDLE REGULAR TRANSACTION (Non-transfer) ====================
    // Save payee to payees table if this is a regular transaction
    let finalPayeeId = transactionForm.payeeId;
    if (!transactionForm.isTransfer && transactionForm.payee && !finalPayeeId) {
      try {
        const payeeResult = await window.electronAPI.createOrUpdatePayee({
          name: transactionForm.payee,
          userId: userId,
          isTransferPayee: false
        });
        if (payeeResult?.success && payeeResult?.data?.id) {
          finalPayeeId = payeeResult.data.id;
          console.log('💾 Saved new payee:', transactionForm.payee, 'ID:', finalPayeeId);
        }
      } catch (payeeError) {
        console.warn('Failed to save payee, continuing with transaction:', payeeError);
      }
    }

    // Calculate transaction amount based on account type
    if (isCreditOrLoan) {
      if (isExpense) {
        transactionAmount = -amountValue;
      } else {
        transactionAmount = amountValue;
      }
    } else {
      if (isExpense) {
        transactionAmount = -amountValue;
      } else {
        transactionAmount = amountValue;
      }
    }

    const isReadyToAssign = transactionForm.transactionType === 'inflow' &&
      transactionForm.categoryId === 'inflow_ready_to_assign';

    const transactionData = {
      accountId: account.id,
      date: transactionForm.date,
      payee: transactionForm.payee,
      description: transactionForm.payee,
      amount: transactionAmount,
      categoryId: isReadyToAssign ? null : transactionForm.categoryId,
      memo: transactionForm.memo,
      cleared: transactionForm.cleared ? 1 : 0,
      frequency: transactionForm.frequency || null,
      // Add payee tracking
      payeeId: finalPayeeId,
      // Add transfer flags (false for regular transaction)
      isTransfer: 0,
      transferAccountId: null
    };

    console.log('📝 Creating regular transaction:', transactionData);

    const result = await window.electronAPI.addTransaction(transactionData);
    if (!result.success) {
      throw new Error(result.error || 'Failed to add transaction');
    }

    const summary = await window.electronAPI.getAccountsSummary(userId);
    const refreshed = summary?.success && summary.data
      ? summary.data.find(a => a.id === account.id)
      : null;
    const newBalance = refreshed != null ? refreshed.balance : account.balance;

    console.log(`✅ Regular transaction added. Ledger balance: ${newBalance}`);

    return newBalance;
  };

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

    if (!editFormData.categoryId) {
      alert('Please select a category');
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

      // ==================== CHECK IF THIS IS A TRANSFER ====================
      // If this transaction is part of a linked transfer, use the transfer update API
      if (originalTransaction.is_transfer === 1) {
        console.log('🔄 Updating linked transfer transaction');

        // Determine the new amount sign based on the original transaction type
        // If original amount was negative (outflow), keep negative; if positive (inflow), keep positive
        const isOriginalOutflow = originalTransaction.amount < 0;
        let newTransferAmount = amountValue;
        if (isOriginalOutflow) {
          newTransferAmount = -Math.abs(amountValue);
        } else {
          newTransferAmount = Math.abs(amountValue);
        }

        // Use the linked transfer update API
        const updateResult = await window.electronAPI.updateLinkedTransfer(transactionId, {
          date: editFormData.date,
          payee: editFormData.payee,
          amount: newTransferAmount,
          memo: editFormData.memo
        });

        if (!updateResult.success) {
          throw new Error(updateResult.error || 'Failed to update transfer');
        }

        console.log('✅ Transfer updated successfully:', updateResult.data);

        // Refresh the account data to show updated balances
        await loadAccountData(account.id);

        cancelEditing();

        window.dispatchEvent(new CustomEvent('accounts-updated'));
        window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));

        alert(`✅ Transfer updated successfully!`);
        setIsUpdating(false);
        return;
      }

      // ==================== REGULAR TRANSACTION UPDATE (Existing Logic) ====================
      const isExpense = originalTransaction.amount < 0;
      const newIsExpense = editFormData.categoryId === 'inflow_ready_to_assign' ? false :
        (editFormData.categoryId && categories.find(c => c.id === editFormData.categoryId)?.type === 'expense');

      let newAmount = amountValue;
      if (newIsExpense !== undefined) {
        newAmount = newIsExpense ? -amountValue : amountValue;
      } else {
        newAmount = isExpense ? -amountValue : amountValue;
      }

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

      await loadAccountData(account.id);

      const summary = await window.electronAPI.getAccountsSummary(userId);
      const refreshed = summary?.success && summary.data
        ? summary.data.find(a => a.id === account.id)
        : null;
      const newBalance = refreshed != null ? refreshed.balance : account.balance;

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

  // Fix calculateRequiredContribution
  const calculateRequiredContribution = useCallback((category) => {
    if (!category || !category.target_amount || category.target_amount === 0) {
      return { needed: 0, type: 'none', priority: 0 };
    }

    const assigned = category.assigned || 0;
    const activity = category.activity || 0;
    const available = assigned + activity;
    const targetAmount = category.target_amount;

    switch (category.target_type) {
      case 'monthly':
      case 'monthly_savings':
        const needed = Math.max(0, targetAmount - assigned);
        const priority = needed > 0 ? (needed / targetAmount) * 100 : 0;
        return {
          needed,
          type: 'monthly',
          priority: priority,
          targetMessage: `Monthly goal: Need ${formatCurrency(needed)} more this month`
        };

      case 'target_balance':
      case 'balance':
        const balanceNeeded = Math.max(0, targetAmount - available);
        const balancePriority = balanceNeeded > 0 ? (balanceNeeded / targetAmount) * 100 : 0;
        return {
          needed: balanceNeeded,
          type: 'balance',
          priority: balancePriority,
          targetMessage: `Savings goal: Need ${formatCurrency(balanceNeeded)} to reach ${formatCurrency(targetAmount)}`
        };

      case 'target_balance_by_date':
      case 'by_date':
        if (!category.target_date) {
          return { needed: 0, type: 'none', priority: 0 };
        }
        const today = new Date();
        const targetDate = new Date(category.target_date);
        const monthsRemaining = Math.max(1, (targetDate.getFullYear() - today.getFullYear()) * 12 +
          (targetDate.getMonth() - today.getMonth()));
        const totalNeeded = Math.max(0, targetAmount - available);
        const monthlyNeeded = totalNeeded / monthsRemaining;
        const datePriority = totalNeeded > 0 ? (totalNeeded / targetAmount) * 100 : 0;
        return {
          needed: monthlyNeeded,
          totalNeeded: totalNeeded,
          monthsRemaining: monthsRemaining,
          type: 'deadline',
          priority: datePriority,
          targetMessage: `Deadline goal: Need ${formatCurrency(monthlyNeeded)}/month for ${monthsRemaining} months`
        };

      default:
        return { needed: 0, type: 'none', priority: 0 };
    }
  }, [formatCurrency]);

  const calculatePriorityScore = useCallback((category) => {
    const constraint = calculateRequiredContribution(category);

    let urgencyScore = 0;
    let importanceScore = 0;
    let riskScore = 0;

    switch (constraint.type) {
      case 'monthly':
        urgencyScore = constraint.priority / 100;
        importanceScore = 0.8;
        riskScore = category.activity && category.activity < 0 ? 0.9 : 0.3;
        break;
      case 'deadline':
        urgencyScore = constraint.priority / 100;
        importanceScore = 0.7;
        riskScore = constraint.monthsRemaining <= 1 ? 0.95 : 0.5;
        break;
      case 'balance':
        urgencyScore = constraint.priority / 100;
        importanceScore = 0.6;
        riskScore = 0.4;
        break;
      default:
        return 0;
    }

    return (urgencyScore * priorityWeights.urgency) +
      (importanceScore * priorityWeights.importance) +
      (riskScore * priorityWeights.risk);
  }, [calculateRequiredContribution, priorityWeights]);

  // Fix generateSmartAllocation
  const generateSmartAllocation = useCallback(() => {
    setIsCalculating(true);

    let remainingFunds = unassigned;
    const results = [];

    if (!safeCategories || safeCategories.length === 0) {
      setPreviewResults({
        allocations: [],
        totalToAssign: 0,
        remainingAfter: remainingFunds,
        strategy: 'priority_weighted',
        categoriesCount: 0,
        message: 'No categories available'
      });
      setIsCalculating(false);
      return;
    }

    const categoriesToFund = safeCategories.filter(cat => {
      if (!cat || cat.archived) return false;
      const constraint = calculateRequiredContribution(cat);
      return constraint.needed > 0;
    });

    if (categoriesToFund.length === 0) {
      setPreviewResults({
        allocations: [],
        totalToAssign: 0,
        remainingAfter: remainingFunds,
        strategy: 'priority_weighted',
        categoriesCount: 0,
        message: 'All goals are fully funded! 🎉'
      });
      setIsCalculating(false);
      return;
    }

    const scoredCategories = categoriesToFund.map(cat => ({
      ...cat,
      score: calculatePriorityScore(cat),
      constraint: calculateRequiredContribution(cat)
    })).sort((a, b) => b.score - a.score);

    for (const cat of scoredCategories) {
      if (remainingFunds <= 0) break;

      let neededAmount = cat.constraint.needed;
      if (cat.constraint.type === 'deadline' && cat.constraint.monthsRemaining) {
        neededAmount = Math.min(cat.constraint.needed, cat.constraint.totalNeeded || neededAmount);
      }

      const amountToAssign = Math.min(neededAmount, remainingFunds);

      if (amountToAssign > 0) {
        results.push({
          categoryId: cat.id,
          categoryName: cat.name,
          amount: amountToAssign,
          needed: neededAmount,
          priority: Math.round(cat.score * 100),
          targetMessage: cat.constraint.targetMessage
        });
        remainingFunds -= amountToAssign;
      }
    }

    setPreviewResults({
      allocations: results,
      totalToAssign: unassigned - remainingFunds,
      remainingAfter: remainingFunds,
      strategy: 'priority_weighted',
      categoriesCount: results.length
    });

    setIsCalculating(false);
  }, [safeCategories, unassigned, calculateRequiredContribution, calculatePriorityScore]);

  // Fix generateUnderfundedAllocation
  const generateUnderfundedAllocation = useCallback(() => {
    setIsCalculating(true);

    let remainingFunds = unassigned;
    const results = [];

    if (!safeCategories || safeCategories.length === 0) {
      setPreviewResults({
        allocations: [],
        totalToAssign: 0,
        remainingAfter: remainingFunds,
        strategy: 'underfunded',
        categoriesCount: 0
      });
      setIsCalculating(false);
      return;
    }

    const underfundedCategories = safeCategories.filter(cat => {
      if (!cat || cat.archived) return false;
      const constraint = calculateRequiredContribution(cat);
      return constraint.needed > 0;
    });

    if (underfundedCategories.length === 0) {
      setPreviewResults({
        allocations: [],
        totalToAssign: 0,
        remainingAfter: remainingFunds,
        strategy: 'underfunded',
        categoriesCount: 0,
        message: 'No underfunded categories found'
      });
      setIsCalculating(false);
      return;
    }

    const sortedCategories = underfundedCategories
      .map(cat => ({
        ...cat,
        constraint: calculateRequiredContribution(cat)
      }))
      .sort((a, b) => b.constraint.needed - a.constraint.needed);

    for (const cat of sortedCategories) {
      if (remainingFunds <= 0) break;

      const amountToAssign = Math.min(cat.constraint.needed, remainingFunds);
      results.push({
        categoryId: cat.id,
        categoryName: cat.name,
        amount: amountToAssign,
        needed: cat.constraint.needed,
        targetMessage: cat.constraint.targetMessage
      });
      remainingFunds -= amountToAssign;
    }

    setPreviewResults({
      allocations: results,
      totalToAssign: unassigned - remainingFunds,
      remainingAfter: remainingFunds,
      strategy: 'underfunded',
      categoriesCount: results.length
    });

    setIsCalculating(false);
  }, [safeCategories, unassigned, calculateRequiredContribution]);

  // Fix generateDeadlineAllocation
  const generateDeadlineAllocation = useCallback(() => {
    setIsCalculating(true);

    let remainingFunds = unassigned;
    const results = [];

    if (!safeCategories || safeCategories.length === 0) {
      setPreviewResults({
        allocations: [],
        totalToAssign: 0,
        remainingAfter: remainingFunds,
        strategy: 'deadline',
        categoriesCount: 0
      });
      setIsCalculating(false);
      return;
    }

    const byDateCategories = safeCategories.filter(cat =>
      cat &&
      (cat.target_type === 'target_balance_by_date' || cat.target_type === 'by_date') &&
      cat.target_date &&
      cat.target_amount > 0
    ).sort((a, b) => new Date(a.target_date) - new Date(b.target_date));

    if (byDateCategories.length === 0) {
      setPreviewResults({
        allocations: [],
        totalToAssign: 0,
        remainingAfter: remainingFunds,
        strategy: 'deadline',
        categoriesCount: 0,
        message: 'No deadline-based goals found'
      });
      setIsCalculating(false);
      return;
    }

    for (const cat of byDateCategories) {
      if (remainingFunds <= 0) break;

      const constraint = calculateRequiredContribution(cat);
      if (constraint.needed > 0) {
        const amountToAssign = Math.min(constraint.needed, remainingFunds);
        results.push({
          categoryId: cat.id,
          categoryName: cat.name,
          amount: amountToAssign,
          needed: constraint.needed,
          targetMessage: constraint.targetMessage
        });
        remainingFunds -= amountToAssign;
      }
    }

    setPreviewResults({
      allocations: results,
      totalToAssign: unassigned - remainingFunds,
      remainingAfter: remainingFunds,
      strategy: 'deadline',
      categoriesCount: results.length
    });

    setIsCalculating(false);
  }, [safeCategories, unassigned, calculateRequiredContribution]);

  // Fix generateLastMonthAllocation
  const generateLastMonthAllocation = useCallback(() => {
    setIsCalculating(true);

    let remainingFunds = unassigned;
    const results = [];

    if (!safeCategories || safeCategories.length === 0) {
      setPreviewResults({
        allocations: [],
        totalToAssign: 0,
        remainingAfter: remainingFunds,
        strategy: 'lastMonth',
        categoriesCount: 0
      });
      setIsCalculating(false);
      return;
    }

    for (const cat of safeCategories) {
      if (!cat) continue;
      if (remainingFunds <= 0) break;

      const lastMonthAmount = cat.last_month_assigned || 0;
      const currentAssigned = cat.assigned || 0;
      const needed = Math.max(0, lastMonthAmount - currentAssigned);

      if (needed > 0 && remainingFunds >= needed) {
        results.push({
          categoryId: cat.id,
          categoryName: cat.name,
          amount: needed,
          needed: needed,
          targetMessage: `Last month: ${formatCurrency(lastMonthAmount)}`
        });
        remainingFunds -= needed;
      }
    }

    setPreviewResults({
      allocations: results,
      totalToAssign: results.reduce((sum, item) => sum + item.amount, 0),
      remainingAfter: remainingFunds,
      strategy: 'lastMonth',
      categoriesCount: results.length
    });

    setIsCalculating(false);
  }, [safeCategories, unassigned, formatCurrency]);

  // Fix generateResetAllocation
  const generateResetAllocation = useCallback(() => {
    setIsCalculating(true);

    const results = [];

    if (safeCategories && safeCategories.length > 0) {
      for (const cat of safeCategories) {
        if (!cat) continue;
        const currentAssigned = cat.assigned || 0;
        if (currentAssigned !== 0) {
          results.push({
            categoryId: cat.id,
            categoryName: cat.name,
            amount: -currentAssigned,
            targetMessage: `Reset to zero (was ${formatCurrency(currentAssigned)})`
          });
        }
      }
    }

    setPreviewResults({
      allocations: results,
      totalToAssign: -Math.abs(results.reduce((sum, item) => sum + item.amount, 0)),
      remainingAfter: unassigned + Math.abs(results.reduce((sum, item) => sum + item.amount, 0)),
      strategy: 'reset',
      categoriesCount: results.length
    });

    setIsCalculating(false);
  }, [safeCategories, unassigned, formatCurrency]);

  const strategies = [
    {
      id: 'priority_weighted',
      name: '🎯 Smart Priority',
      description: 'AI-powered allocation based on urgency, importance, and risk',
      color: '#8B5CF6',
      action: generateSmartAllocation
    },
    {
      id: 'underfunded',
      name: '⚠️ Underfunded First',
      description: 'Focus on categories with the largest funding gaps',
      color: '#F59E0B',
      action: generateUnderfundedAllocation
    },
    {
      id: 'deadline',
      name: '⏰ Deadline Driven',
      description: 'Prioritize time-sensitive goals and upcoming expenses',
      color: '#EF4444',
      action: generateDeadlineAllocation
    },
    {
      id: 'lastMonth',
      name: '📅 Last Month\'s Budget',
      description: 'Match previous month\'s assigned amounts',
      color: '#3B82F6',
      action: generateLastMonthAllocation
    },
    {
      id: 'reset',
      name: '🔄 Reset All Assigned',
      description: 'Set all categories to $0 assigned',
      color: '#38BDF8',
      action: generateResetAllocation
    }
  ];

  const handleStrategySelect = (strategyId) => {
    setSelectedStrategy(strategyId);
    const strategy = strategies.find(s => s.id === strategyId);
    if (strategy && strategy.action) {
      strategy.action();
    }
  };

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

      // Delete transactions (main process syncs ledger + budget)
      for (const transaction of selectedTransactionsList) {
        let deleteResult;

        // Check if this is a transfer transaction
        if (transaction.is_transfer === 1) {
          // Use linked delete API for transfers (deletes both sides)
          console.log('🔄 Deleting linked transfer:', transaction.id);
          deleteResult = await window.electronAPI.deleteLinkedTransfer(transaction.id);
        } else {
          // Regular delete for normal transactions
          deleteResult = await window.electronAPI.deleteTransaction(transaction.id);
        }

        if (!deleteResult.success) {
          throw new Error(`Failed to delete transaction ${transaction.id}: ${deleteResult.error}`);
        }
      }

      await loadAccountData(account.id);

      const summary = await window.electronAPI.getAccountsSummary(userId);
      const refreshed = summary?.success && summary.data
        ? summary.data.find(a => a.id === account.id)
        : null;
      const newBalance = refreshed != null ? refreshed.balance : account.balance;

      setSelectedTransactions(new Set());
      setShowDeleteModal(false);

      window.dispatchEvent(new CustomEvent('accounts-updated'));
      window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));

      alert(`✅ Successfully deleted ${selectedTransactionsList.length} transaction(s)!\nNew balance: ${formatCurrency(newBalance)}`);
    } catch (error) {
      console.error('Error deleting transactions:', error);
      alert('Error deleting transactions: ' + error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleAutoAssign = () => {
    if (previewResults && onAutoAssign) {
      if (previewResults.strategy === 'reset') {
        const totalResetAmount = Math.abs(previewResults.totalToAssign);
        const confirmation = confirm(
          `⚠️ RESET ALL ASSIGNED AMOUNTS ⚠️\n\n` +
          `This will reset ${previewResults.allocations.length} categories to $0 assigned.\n` +
          `Total amount freed up: ${formatCurrency(totalResetAmount)}\n\n` +
          `This action will:\n` +
          `• Set all category assigned amounts to $0\n` +
          `• Increase Ready to Assign by ${formatCurrency(totalResetAmount)}\n` +
          `• NOT affect transaction history or activity\n\n` +
          `Are you sure you want to continue?`
        );
        if (!confirmation) return;
      }
      onAutoAssign(previewResults.allocations);
      setShowAutoAssignOptions(false);
      setPreviewResults(null);
    }
  };

  // Fix getCategoryStats
  const getCategoryStats = () => {
    if (!safeCategories || safeCategories.length === 0) {
      return { totalCategories: 0, fundedCategories: 0, overspentCategories: 0, onTrackCategories: 0 };
    }

    const totalCategories = safeCategories.length;
    const fundedCategories = safeCategories.filter(c => c && (c.assigned || 0) > 0).length;
    const overspentCategories = safeCategories.filter(c => c && (c.available || 0) < 0).length;
    const onTrackCategories = safeCategories.filter(c => {
      if (!c) return false;
      const constraint = calculateRequiredContribution(c);
      return constraint.needed === 0;
    }).length;

    return { totalCategories, fundedCategories, overspentCategories, onTrackCategories };
  };

  const assignedPercentage = totalAvailable > 0 ? (totalAssigned / totalAvailable) * 100 : 0;
  const stats = getCategoryStats();

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <h2 style={styles.title}>Budget Summary</h2>
        <div style={styles.month}>{month}</div>
      </div>

      {/* Main Metrics */}
      <div style={styles.metricsContainer}>
        <div style={styles.metricCard}>
          <div style={styles.metricIcon}>💰</div>
          <div style={styles.metricContent}>
            <div style={styles.metricLabel}>Ready to Assign</div>
            <div style={{
              ...styles.metricValue,
              color: unassigned >= 0 ? '#4ADE80' : '#F87171'
            }}>
              {formatCurrency(unassigned)}
            </div>
            <div style={styles.metricSubtext}>
              {unassigned >= 0 ? 'Available to budget' : 'Overspending detected'}
            </div>
          </div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricIcon}>📊</div>
          <div style={styles.metricContent}>
            <div style={styles.metricLabel}>Total Activity</div>
            <div style={styles.metricValue}>{formatCurrency(totalActivity)}</div>
            <div style={styles.metricSubtext}>{totalActivity >= 0 ? 'Income' : 'Spending'}</div>
          </div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricIcon}>📋</div>
          <div style={styles.metricContent}>
            <div style={styles.metricLabel}>Total Assigned</div>
            <div style={styles.metricValue}>{formatCurrency(totalAssigned)}</div>
            <div style={styles.metricSubtext}>{assignedPercentage.toFixed(1)}% of available</div>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div style={styles.progressSection}>
        <div style={styles.progressHeader}>
          <span style={styles.progressTitle}>Budget Utilization</span>
          <span style={styles.progressPercentage}>{assignedPercentage.toFixed(1)}%</span>
        </div>
        <div style={styles.progressBarBackground}>
          <div
            style={{
              ...styles.progressBarFill,
              width: `${Math.min(assignedPercentage, 100)}%`,
              backgroundColor: assignedPercentage > 100 ? '#F87171' : '#3B82F6'
            }}
          />
        </div>
      </div>

      {/* Quick Stats */}
      <div style={styles.statsGrid}>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Goals On Track</span>
          <span style={{ ...styles.statValue, color: '#4ADE80' }}>
            {stats.onTrackCategories}/{stats.totalCategories}
          </span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Categories Funded</span>
          <span style={styles.statValue}>{stats.fundedCategories}/{stats.totalCategories}</span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Overspent</span>
          <span style={{ ...styles.statValue, color: stats.overspentCategories > 0 ? '#F87171' : '#4ADE80' }}>
            {stats.overspentCategories}
          </span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Underfunded</span>
          <span style={{ ...styles.statValue, color: underfundedTotal > 0 ? '#F59E0B' : '#4ADE80' }}>
            {formatCurrency(underfundedTotal)}
          </span>
        </div>
        <div style={styles.statItem}>
          <span style={styles.statLabel}>Budget Health</span>
          <span style={{
            ...styles.statValue,
            color: assignedPercentage <= 100 && stats.overspentCategories === 0 && underfundedTotal === 0 ? '#4ADE80' : '#F87171'
          }}>
            {assignedPercentage <= 100 && stats.overspentCategories === 0 && underfundedTotal === 0 ? 'Healthy' : 'Needs Attention'}
          </span>
        </div>
      </div>

      {/* Smart Auto-Assign Section */}
      <div style={styles.autoAssignSection}>
        <div style={styles.autoAssignHeader}>
          <h3 style={styles.autoAssignTitle}>🧠 Smart Auto-Assign</h3>
          <button
            style={styles.autoAssignToggle}
            onClick={() => setShowAutoAssignOptions(!showAutoAssignOptions)}
          >
            {showAutoAssignOptions ? '▼' : '▶'}
            {unassigned > 0
              ? `${formatCurrency(unassigned)} to assign`
              : unassigned < 0
                ? `Overspent ${formatCurrency(Math.abs(unassigned))}`
                : 'No funds to assign'}
            {underfundedTotal > 0 && unassigned > 0 && (
              <span style={{ color: '#F59E0B', marginLeft: '8px', fontSize: '0.7rem' }}>
                (${underfundedTotal.toFixed(0)} needed)
              </span>
            )}
          </button>
        </div>

        {showAutoAssignOptions && (
          <div style={styles.autoAssignOptions}>
            <div style={styles.strategyGrid}>
              {strategies.map(strategy => (
                <button
                  key={strategy.id}
                  style={{
                    ...styles.strategyCard,
                    borderColor: selectedStrategy === strategy.id ? strategy.color : PM.border,
                    background: selectedStrategy === strategy.id ? `${strategy.color}20` : PM.bg
                  }}
                  onClick={() => handleStrategySelect(strategy.id)}
                >
                  <span style={styles.strategyIcon}>{strategy.icon}</span>
                  <div style={styles.strategyContent}>
                    <div style={styles.strategyName}>{strategy.name}</div>
                    <div style={styles.strategyDescription}>{strategy.description}</div>
                  </div>
                </button>
              ))}
            </div>

            {selectedStrategy === 'priority_weighted' && (
              <div style={styles.weightControls}>
                <div style={styles.weightLabel}>Priority Weights:</div>
                <div style={styles.sliderGroup}>
                  <label>Urgency: {(priorityWeights.urgency * 100).toFixed(0)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={priorityWeights.urgency}
                    onChange={(e) => setPriorityWeights({
                      ...priorityWeights,
                      urgency: parseFloat(e.target.value),
                      importance: 1 - parseFloat(e.target.value) - priorityWeights.risk
                    })}
                    style={styles.slider}
                  />
                </div>
                <div style={styles.sliderGroup}>
                  <label>Importance: {(priorityWeights.importance * 100).toFixed(0)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={priorityWeights.importance}
                    onChange={(e) => setPriorityWeights({
                      ...priorityWeights,
                      importance: parseFloat(e.target.value),
                      urgency: 1 - parseFloat(e.target.value) - priorityWeights.risk
                    })}
                    style={styles.slider}
                  />
                </div>
                <div style={styles.sliderGroup}>
                  <label>Risk: {(priorityWeights.risk * 100).toFixed(0)}%</label>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={priorityWeights.risk}
                    onChange={(e) => setPriorityWeights({
                      ...priorityWeights,
                      risk: parseFloat(e.target.value),
                      urgency: 1 - priorityWeights.importance - parseFloat(e.target.value)
                    })}
                    style={styles.slider}
                  />
                </div>
              </div>
            )}

            {isCalculating && (
              <div style={styles.calculating}>
                <div style={styles.spinner}></div>
                <span>Analyzing goals and creating optimal funding plan...</span>
              </div>
            )}

            {previewResults && !isCalculating && (
              <div style={styles.previewContainer}>
                <div style={styles.previewHeader}>
                  <div>
                    <div style={styles.previewTitle}>
                      🎯 Funding Plan: {strategies.find(s => s.id === previewResults.strategy)?.name}
                    </div>
                    <div style={styles.previewMessage}>
                      {previewResults.message || `${previewResults.categoriesCount} categories will receive funding`}
                    </div>
                  </div>
                  <div style={styles.previewSummary}>
                    <div>Total: {formatCurrency(previewResults.totalToAssign)}</div>
                    <div style={{ fontSize: '0.65rem', color: PM.textMuted }}>
                      Remaining: {formatCurrency(previewResults.remainingAfter)}
                    </div>
                  </div>
                </div>

                {previewResults.allocations.length > 0 && (
                  <div style={styles.previewList}>
                    {previewResults.allocations.slice(0, 8).map((alloc, idx) => (
                      <div key={idx} style={styles.previewItem}>
                        <div style={styles.previewItemInfo}>
                          <span style={styles.previewItemName}>{alloc.categoryName}</span>
                          <span style={styles.previewItemReason}>{alloc.targetMessage}</span>
                          {alloc.priority && (
                            <span style={styles.priorityBadge}>Priority: {alloc.priority}%</span>
                          )}
                          <div style={styles.previewProgressBar}>
                            <div style={{
                              ...styles.previewProgressFill,
                              width: `${Math.min(100, (alloc.amount / alloc.needed) * 100)}%`,
                              backgroundColor: alloc.amount >= alloc.needed ? '#4ADE80' : '#8B5CF6'
                            }} />
                          </div>
                        </div>
                        <div style={{
                          ...styles.previewItemAmount,
                          color: alloc.amount >= 0 ? '#4ADE80' : '#F87171'
                        }}>
                          {alloc.amount >= 0 ? '+' : ''}{formatCurrency(alloc.amount)}
                        </div>
                      </div>
                    ))}
                    {previewResults.allocations.length > 8 && (
                      <div style={styles.previewMore}>
                        +{previewResults.allocations.length - 8} more categories
                      </div>
                    )}
                  </div>
                )}

                <div style={styles.previewActions}>
                  <button style={styles.applyButton} onClick={handleAutoAssign}>
                    Apply Funding Plan
                  </button>
                  <button style={styles.cancelPreviewButton} onClick={() => setPreviewResults(null)}>
                    Cancel
                  </button>
                </div>

                {previewResults.strategy === 'reset' && (
                  <div style={styles.warningMessage}>
                    ⚠️ This will reset ALL category assigned amounts to $0
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Transaction Card */}
      <div style={styles.addTransactionCard}>
        <div style={styles.addTransactionHeader}>
          <span style={styles.addTransactionIcon}>➕</span>
          <h3 style={styles.addTransactionTitle}>Add Transaction</h3>
        </div>
        <button
          style={styles.addTransactionButton}
          onClick={() => setShowAddTransactionModal(true)}
        >
          + New Transaction
        </button>
      </div>

      {/* Add Transaction Modal */}
      {showAddTransactionModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddTransactionModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h3 style={styles.modalTitle}>Add Transaction</h3>
              <button
                style={styles.closeButton}
                onClick={() => setShowAddTransactionModal(false)}
              >
                ✕
              </button>
            </div>

            <div style={styles.modalBody}>
              {/* Payee Dropdown with Transfer Options */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Payee *</label>
                {loadingPayees ? (
                  <div style={styles.loadingPayees}>Loading payees...</div>
                ) : (
                  <select
                    value={transactionForm.payee}
                    onChange={(e) => {
                      const selectedValue = e.target.value;
                      if (selectedValue === '__manual__') {
                        // Allow manual entry - clear payee and show text input
                        setTransactionForm(prev => ({
                          ...prev,
                          payee: '',
                          payeeId: null,
                          isTransfer: false,
                          transferAccountId: null
                        }));
                        return;
                      }
                      try {
                        const payee = JSON.parse(selectedValue);
                        handlePayeeSelect(payee);
                      } catch (err) {
                        setTransactionForm(prev => ({ ...prev, payee: selectedValue, isTransfer: false }));
                      }
                    }}
                    style={styles.select}
                  >
                    <option value="">-- Select or enter payee --</option>

                    {/* Section 1: Payments & Transfers */}
                    {payees.transferPayees.length > 0 && (
                      <optgroup label="📤 PAYMENTS & TRANSFERS">
                        {payees.transferPayees.map(payee => (
                          <option key={payee.id} value={JSON.stringify(payee)}>
                            {payee.name}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    {/* Section 2: Recent Payees */}
                    {payees.regularPayees.length > 0 && (
                      <optgroup label="📋 RECENT PAYEES">
                        {payees.regularPayees.map(payee => (
                          <option key={payee.id} value={JSON.stringify(payee)}>
                            {payee.name}
                          </option>
                        ))}
                      </optgroup>
                    )}

                    <option value="__manual__">✏️ Other (type manually)</option>
                  </select>
                )}
                {transactionForm.isTransfer && (
                  <div style={styles.payeeHint}>
                    💡 Transfer selected. Category will be auto-managed.
                  </div>
                )}
              </div>

              {/* Manual Payee Input (shown when "Other" is selected or payee needs manual entry) */}
              {(transactionForm.payee === '' || (transactionForm.payee && !payees.transferPayees.some(p => p.name === transactionForm.payee) &&
                !payees.regularPayees.some(p => p.name === transactionForm.payee))) && (
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Enter Payee Name</label>
                    <input
                      type="text"
                      value={transactionForm.payee}
                      onChange={(e) => setTransactionForm(prev => ({ ...prev, payee: e.target.value, isTransfer: false }))}
                      style={styles.input}
                      placeholder="Enter payee name (e.g., Starbucks, Rent, Amazon)"
                    />
                  </div>
                )}

              <div style={styles.formGroup}>
                <label style={styles.label}>Transaction Type *</label>
                <select
                  value={transactionForm.transactionType}
                  onChange={(e) => {
                    setTransactionForm({
                      ...transactionForm,
                      transactionType: e.target.value,
                      categoryId: ''
                    });
                  }}
                  style={styles.select}
                  disabled={transactionForm.isTransfer}
                >
                  <option value="outflow">Outflow (Expense)</option>
                  <option value="inflow">Inflow (Income)</option>
                </select>
              </div>

              {/* Payee Dropdown with Transfer Options */}
              <div style={styles.formGroup}>
                <label style={styles.label}>Payee *</label>
                {loadingPayees ? (
                  <div style={styles.loadingPayees}>Loading payees...</div>
                ) : (
                  renderPayeeDropdown()
                )}
                {transactionForm.isTransfer && (
                  <div style={styles.payeeHint}>
                    💡 Transfer selected. Category will be auto-managed.
                  </div>
                )}
              </div>

              {/* Manual Payee Input (shown when "Other" is selected) */}
              {transactionForm.payee && !payees.transferPayees.some(p => p.name === transactionForm.payee) &&
                !payees.regularPayees.some(p => p.name === transactionForm.payee) && (
                  <div style={styles.formGroup}>
                    <label style={styles.label}>Enter Payee Name</label>
                    <input
                      type="text"
                      value={transactionForm.payee}
                      onChange={(e) => setTransactionForm(prev => ({ ...prev, payee: e.target.value, isTransfer: false }))}
                      style={styles.input}
                      placeholder="Enter payee name"
                    />
                  </div>
                )}

              <div style={styles.formGroup}>
                <label style={{ ...styles.label, ...(transactionForm.isTransfer ? styles.disabledLabel : {}) }}>
                  Category {transactionForm.isTransfer && <span style={styles.autoManagedBadge}>(Auto-managed for transfer)</span>}
                </label>
                {transactionForm.isTransfer ? (
                  <div style={styles.transferPaymentInfo}>
                    <div style={styles.transferPaymentBadge}>🔄 Account Transfer</div>
                    <div style={styles.transferPaymentMessage}>
                      This is a transfer to another account. No category is needed.
                    </div>
                  </div>
                ) : (
                  <select
                    value={transactionForm.categoryId}
                    onChange={(e) => setTransactionForm({ ...transactionForm, categoryId: e.target.value })}
                    style={styles.select}
                  >
                    <option value="">Select a category</option>
                    {getFilteredCategories().map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Amount *</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    value={transactionForm.amount}
                    onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                    style={styles.modalInput}
                    placeholder="0.00"
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Date *</label>
                <input
                  type="date"
                  value={transactionForm.date}
                  onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })}
                  style={styles.input}
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Memo (Optional)</label>
                <input
                  type="text"
                  value={transactionForm.memo}
                  onChange={(e) => setTransactionForm({ ...transactionForm, memo: e.target.value })}
                  style={styles.input}
                  placeholder="Additional notes"
                />
              </div>

              <div style={styles.checkboxGroup}>
                <label style={styles.checkboxLabel}>
                  <input
                    type="checkbox"
                    checked={transactionForm.cleared}
                    onChange={(e) => setTransactionForm({ ...transactionForm, cleared: e.target.checked })}
                    style={styles.checkbox}
                  />
                  Mark as cleared
                </label>
              </div>

              {transactionError && (
                <div style={styles.errorMessage}>
                  ⚠️ {transactionError}
                </div>
              )}
            </div>

            <div style={styles.modalFooter}>
              <button
                style={styles.cancelModalButton}
                onClick={() => setShowAddTransactionModal(false)}
              >
                Cancel
              </button>
              <button
                style={styles.submitButton}
                onClick={handleAddTransaction}
                disabled={isSubmitting}
              >
                {isSubmitting ? 'Adding...' : 'Add Transaction'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==================== STYLES ====================
const styles = {
  container: {
    width: '100%',
    maxWidth: '400px',
    background: PM.fg,
    borderRadius: '1rem',
    padding: '1.5rem',
    border: '1px solid ' + PM.border,
    position: 'sticky',
    top: '2rem'
  },
  header: { marginBottom: '1.5rem' },
  title: { fontSize: '1.25rem', fontWeight: '600', color: 'white', margin: '0 0 0.25rem 0' },
  month: { fontSize: '0.875rem', color: PM.textMuted },
  metricsContainer: { display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' },
  metricCard: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: PM.bg, borderRadius: '0.75rem', border: '1px solid ' + PM.border },
  metricIcon: { fontSize: '2rem' },
  metricContent: { flex: 1 },
  metricLabel: { fontSize: '0.875rem', color: PM.textMuted, marginBottom: '0.25rem' },
  metricValue: { fontSize: '1.5rem', fontWeight: 'bold', color: 'white', lineHeight: '1.2' },
  metricSubtext: { fontSize: '0.75rem', color: PM.textMuted, marginTop: '0.25rem' },
  progressSection: { marginBottom: '1.5rem' },
  progressHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' },
  progressTitle: { fontSize: '0.875rem', color: PM.textMuted },
  progressPercentage: { fontSize: '0.875rem', fontWeight: '600', color: 'white' },
  progressBarBackground: { height: '8px', background: PM.bg, borderRadius: '4px', overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: '4px', transition: 'width 0.3s ease' },
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' },
  statItem: { padding: '0.75rem', background: PM.bg, borderRadius: '0.5rem', textAlign: 'center' },
  statLabel: { display: 'block', fontSize: '0.75rem', color: PM.textMuted, marginBottom: '0.25rem' },
  statValue: { fontSize: '1rem', fontWeight: '600', color: 'white' },
  autoAssignSection: { marginBottom: '1.5rem', background: PM.bg, borderRadius: '0.75rem', border: '1px solid ' + PM.border, overflow: 'hidden' },
  autoAssignHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: PM.bg, borderBottom: '1px solid ' + PM.border, cursor: 'pointer' },
  autoAssignTitle: { fontSize: '1rem', fontWeight: '600', color: 'white', margin: 0 },
  autoAssignToggle: { background: PM.bg, border: 'none', color: PM.textMuted, fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' },
  autoAssignOptions: { padding: '1rem' },
  strategyGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', marginBottom: '1rem' },
  strategyCard: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: PM.bg, border: '2px solid ' + PM.border, borderRadius: '0.5rem', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s ease' },
  strategyIcon: { fontSize: '1.5rem' },
  strategyContent: { flex: 1 },
  strategyName: { fontSize: '0.95rem', fontWeight: '600', color: 'white', marginBottom: '0.25rem' },
  strategyDescription: { fontSize: '0.75rem', color: PM.textMuted },
  weightControls: { background: PM.bg, padding: '12px', borderRadius: '8px', marginBottom: '12px' },
  weightLabel: { fontSize: '12px', color: PM.textMuted, marginBottom: '8px' },
  sliderGroup: { marginBottom: '8px' },
  slider: { width: '100%', margin: '4px 0' },
  calculating: { padding: '1rem', textAlign: 'center', color: PM.textMuted, fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' },
  spinner: { width: '16px', height: '16px', border: '2px solid ' + PM.border, borderTopColor: '#8B5CF6', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  previewContainer: { marginTop: '1rem', padding: '1rem', background: PM.bg, borderRadius: '0.5rem', border: '1px solid ' + PM.border },
  previewHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' },
  previewTitle: { fontSize: '0.9rem', fontWeight: '600', color: '#8B5CF6' },
  previewMessage: { fontSize: '0.7rem', color: '#4ADE80', marginTop: '0.25rem' },
  previewSummary: { fontSize: '0.7rem', color: PM.textMuted },
  previewList: { maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' },
  previewItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid ' + PM.border },
  previewItemInfo: { flex: 1, marginRight: '1rem' },
  previewItemName: { fontSize: '0.85rem', fontWeight: '500', color: 'white', display: 'block' },
  previewItemReason: { fontSize: '0.65rem', color: PM.textMuted, display: 'block' },
  priorityBadge: { fontSize: '0.6rem', color: '#8B5CF6', marginTop: '2px' },
  previewProgressBar: { marginTop: '0.25rem', height: '3px', background: PM.fg, borderRadius: '2px', overflow: 'hidden' },
  previewProgressFill: { height: '100%', borderRadius: '2px', transition: 'width 0.2s ease' },
  previewItemAmount: { fontSize: '0.85rem', fontWeight: '600', whiteSpace: 'nowrap' },
  previewMore: { textAlign: 'center', padding: '0.5rem', color: PM.textMuted, fontSize: '0.7rem', fontStyle: 'italic' },
  previewActions: { display: 'flex', gap: '0.5rem' },
  applyButton: { flex: 1, padding: '0.5rem', background: '#8B5CF6', color: 'white', border: 'none', borderRadius: '0.25rem', fontSize: '0.8rem', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' },
  cancelPreviewButton: { flex: 1, padding: '0.5rem', background: '#4B5563', color: 'white', border: 'none', borderRadius: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' },
  warningMessage: { marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #EF4444', borderRadius: '0.25rem', color: '#EF4444', fontSize: '0.7rem', textAlign: 'center' },
  addTransactionCard: {
    marginTop: '1rem',
    padding: '1rem',
    background: PM.bg,
    borderRadius: '0.75rem',
    border: '1px solid ' + PM.border
  },
  addTransactionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.75rem'
  },
  addTransactionIcon: { fontSize: '1.25rem' },
  addTransactionTitle: { fontSize: '1rem', fontWeight: '600', color: 'white', margin: 0 },
  addTransactionButton: {
    width: '100%',
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: PM.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    backdropFilter: 'blur(4px)'
  },
  modalContent: {
    background: PM.fg,
    borderRadius: '1rem',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: PM.shadow,
    border: '1px solid ' + PM.border
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem',
    borderBottom: '1px solid ' + PM.border
  },
  modalTitle: { fontSize: '1.25rem', fontWeight: '600', color: 'white', margin: 0 },
  closeButton: {
    background: 'none',
    border: 'none',
    color: PM.textMuted,
    fontSize: '1.25rem',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    transition: 'all 0.2s'
  },
  modalBody: { padding: '1.5rem', overflowY: 'auto', flex: 1 },
  modalFooter: { display: 'flex', gap: '1rem', padding: '1.5rem', borderTop: '1px solid ' + PM.border },
  formGroup: { marginBottom: '1rem' },
  label: { display: 'block', marginBottom: '0.5rem', color: PM.textMuted, fontSize: '0.875rem', fontWeight: '500' },
  disabledLabel: { opacity: 0.6 },
  autoManagedBadge: { fontSize: '0.7rem', color: '#F59E0B', marginLeft: '0.5rem' },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: PM.well,
    border: '1px solid ' + PM.border,
    borderRadius: '0.5rem',
    color: PM.text,
    fontSize: '0.875rem'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: PM.well,
    border: '1px solid ' + PM.border,
    borderRadius: '0.5rem',
    color: PM.text,
    fontSize: '0.875rem',
    cursor: 'pointer'
  },
  hint: { display: 'block', marginTop: '0.5rem', color: '#F87171', fontSize: '0.75rem' },
  payeeHint: { marginTop: '0.25rem', fontSize: '0.65rem', color: PM.textMuted },
  inputWrapper: { position: 'relative' },
  currencySymbol: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: PM.textMuted,
    zIndex: 1
  },
  modalInput: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 2rem',
    background: PM.well,
    border: '1px solid ' + PM.border,
    borderRadius: '0.5rem',
    color: PM.text,
    fontSize: '0.875rem'
  },
  checkboxGroup: { marginTop: '0.5rem' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '0.5rem', color: PM.textMuted, fontSize: '0.875rem', cursor: 'pointer' },
  checkbox: { width: '1rem', height: '1rem', cursor: 'pointer' },
  errorMessage: {
    marginTop: '0.75rem',
    padding: '0.5rem',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #EF4444',
    borderRadius: '0.25rem',
    color: '#F87171',
    fontSize: '0.75rem',
    textAlign: 'center'
  },
  cancelModalButton: {
    flex: 1,
    padding: '0.75rem',
    background: PM.bg,
    color: PM.text,
    border: '1px solid ' + PM.border,
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer'
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
    cursor: 'pointer'
  },
  transferPaymentInfo: {
    background: PM.bg,
    padding: '1rem',
    borderRadius: '0.75rem',
    border: '1px solid #F59E0B',
  },
  transferPaymentBadge: {
    fontSize: '0.7rem',
    color: '#F59E0B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.5rem',
    fontWeight: 'bold',
  },
  transferPaymentMessage: {
    fontSize: '0.875rem',
    color: PM.textMuted,
    marginBottom: '0.75rem',
  },
  loadingPayees: {
    padding: '0.75rem',
    textAlign: 'center',
    color: PM.textMuted,
    fontSize: '0.875rem',
  },
};

// Add keyframe animation
if (typeof document !== 'undefined') {
  const styleId = 'summary-spinner';
  if (!document.getElementById(styleId)) {
    const styleSheet = document.createElement('style');
    styleSheet.id = styleId;
    styleSheet.textContent = '@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }';
    document.head.appendChild(styleSheet);
  }
}

export default SummaryView;