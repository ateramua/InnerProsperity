// src/views/SummaryView.jsx
import React, { useState, useEffect, useCallback } from 'react';

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
    memo: '',
    cleared: true
  });
  const [accounts, setAccounts] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [transactionError, setTransactionError] = useState('');

  // Add safety for categories
  const safeCategories = Array.isArray(categories) ? categories : [];

  // Load accounts for dropdown - get ALL account types (checking, savings, credit, loan)
  const loadAccounts = async () => {
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (userResult?.success && userResult?.data) {
        const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
        if (accountsResult?.success) {
          // Show ALL accounts - no filtering by type
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

  // Handle transaction submission
// Handle transaction submission with proper account balance updates
const handleAddTransaction = async () => {
  setTransactionError('');

  const amountValue = parseFloat(transactionForm.amount);
  if (isNaN(amountValue) || amountValue === 0) {
    setTransactionError('Please enter a valid amount');
    return;
  }

  if (!transactionForm.payee.trim()) {
    setTransactionError('Please enter a payee');
    return;
  }

  if (!transactionForm.accountId) {
    setTransactionError('Please select an account');
    return;
  }

  if (!transactionForm.categoryId) {
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
    let balanceChange = 0;

    // Calculate transaction amount and balance change
    if (isCreditOrLoan) {
      if (isExpense) {
        // Spending on credit/loan - INCREASES debt (more negative)
        transactionAmount = -Math.abs(amountValue);
        balanceChange = -Math.abs(amountValue);
        console.log(`💳 Credit/Loan EXPENSE: Adding ${formatCurrency(transactionAmount)} to transactions, balance will change by ${balanceChange}`);
      } else {
        // Payment on credit/loan - DECREASES debt (less negative)
        transactionAmount = Math.abs(amountValue);
        balanceChange = Math.abs(amountValue);
        console.log(`💳 Credit/Loan PAYMENT: Adding ${formatCurrency(transactionAmount)} to transactions, balance will change by +${balanceChange}`);
      }
    } else {
      if (isExpense) {
        // Spending from checking/savings - DECREASES balance
        transactionAmount = -Math.abs(amountValue);
        balanceChange = -Math.abs(amountValue);
        console.log(`💰 Cash EXPENSE: Adding ${formatCurrency(transactionAmount)} to transactions, balance will change by ${balanceChange}`);
      } else {
        // Income to checking/savings - INCREASES balance
        transactionAmount = Math.abs(amountValue);
        balanceChange = Math.abs(amountValue);
        console.log(`💰 Cash INCOME: Adding ${formatCurrency(transactionAmount)} to transactions, balance will change by +${balanceChange}`);
      }
    }

    const isReadyToAssign = transactionForm.transactionType === 'inflow' &&
      transactionForm.categoryId === 'inflow_ready_to_assign';

    // Step 1: Add the transaction
    const transactionData = {
      accountId: transactionForm.accountId,
      date: transactionForm.date,
      payee: transactionForm.payee,
      description: transactionForm.payee,
      amount: transactionAmount,
      categoryId: isReadyToAssign ? null : transactionForm.categoryId,
      memo: transactionForm.memo,
      cleared: transactionForm.cleared ? 1 : 0
    };

    console.log('📝 Adding transaction:', transactionData);
    const transactionResult = await window.electronAPI.addTransaction(transactionData);

    if (!transactionResult.success) {
      console.error('❌ Transaction failed:', transactionResult.error);
      setTransactionError(transactionResult.error || 'Failed to add transaction');
      return;
    }

    console.log('✅ Transaction added successfully:', transactionResult.data);

    // Step 2: Calculate new balance
    const currentBalance = selectedAccount.balance || 0;
    const newBalance = currentBalance + balanceChange;
    
    console.log(`💰 Account balance update:`);
    console.log(`   Account: ${selectedAccount.name} (${selectedAccount.type})`);
    console.log(`   Current balance: ${formatCurrency(currentBalance)}`);
    console.log(`   Change: ${balanceChange > 0 ? '+' : ''}${formatCurrency(balanceChange)}`);
    console.log(`   New balance: ${formatCurrency(newBalance)}`);

    // Step 3: Update the account balance in the database
    const updateResult = await window.electronAPI.updateAccount(
      selectedAccount.id,
      userId,
      { balance: newBalance }
    );

    if (!updateResult.success) {
      console.error('❌ Account balance update failed:', updateResult.error);
      setTransactionError('Transaction added but failed to update account balance. Please refresh the page.');
      return;
    }

    console.log('✅ Account balance updated successfully:', updateResult.data);

    // Step 4: Verify the update by fetching the account again
    const verifyResult = await window.electronAPI.getAccountsSummary(userId);
    if (verifyResult?.success) {
      const updatedAccount = verifyResult.data.find(a => a.id === selectedAccount.id);
      if (updatedAccount) {
        console.log(`✅ Verification - New balance from DB: ${formatCurrency(updatedAccount.balance)}`);
        if (Math.abs(updatedAccount.balance - newBalance) > 0.01) {
          console.warn(`⚠️ Balance mismatch! Expected: ${formatCurrency(newBalance)}, Got: ${formatCurrency(updatedAccount.balance)}`);
        }
      }
    }
    
    // Step 5: Refresh all UI components
    await loadAccounts(); // Refresh accounts in this component
    
    // Force a refresh of the accounts in the parent component
    window.dispatchEvent(new CustomEvent('accounts-updated', { 
      detail: { accountId: selectedAccount.id, newBalance: newBalance }
    }));
    window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
    
    // Step 6: Reset form and close modal
    setTransactionForm({
      accountId: '',
      transactionType: 'outflow',
      categoryId: '',
      amount: '',
      date: new Date().toISOString().split('T')[0],
      payee: '',
      memo: '',
      cleared: true
    });
    
    setShowAddTransactionModal(false);
    alert(`✅ Transaction added successfully!\n\nAccount: ${selectedAccount.name}\nNew balance: ${formatCurrency(newBalance)}`);
    
  } catch (error) {
    console.error('❌ Error in transaction flow:', error);
    setTransactionError('An unexpected error occurred: ' + error.message);
  } finally {
    setIsSubmitting(false);
  }
};

  // Format currency helper
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
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


    // src/views/SummaryView.jsx (only showing the changed parts - replace your existing handleAddTransaction and add the helper function)

    // Add this helper function to calculate balance change
    const calculateBalanceChange = (accountType, transactionType, amount) => {
      const isCreditOrLoan = accountType === 'credit' || accountType === 'loan';
      const isExpense = transactionType === 'outflow';
      const absAmount = Math.abs(amount);

      if (isCreditOrLoan) {
        // Credit/Loan accounts
        if (isExpense) {
          return -absAmount; // Spending increases debt (more negative)
        } else {
          return absAmount; // Payment decreases debt (less negative)
        }
      } else {
        // Checking/Savings accounts
        if (isExpense) {
          return -absAmount; // Spending decreases balance
        } else {
          return absAmount; // Income increases balance
        }
      }
    };

    // Replace your existing handleAddTransaction with this one
    const handleAddTransaction = async () => {
      setTransactionError('');

      const amountValue = parseFloat(transactionForm.amount);
      if (isNaN(amountValue) || amountValue === 0) {
        setTransactionError('Please enter a valid amount');
        return;
      }

      if (!transactionForm.payee.trim()) {
        setTransactionError('Please enter a payee');
        return;
      }

      if (!transactionForm.accountId) {
        setTransactionError('Please select an account');
        return;
      }

      if (!transactionForm.categoryId) {
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

        const selectedAccount = accounts.find(a => a.id === transactionForm.accountId);
        if (!selectedAccount) {
          setTransactionError('Selected account not found');
          return;
        }

        // Calculate the transaction amount (for the transactions table)
        const isCreditOrLoan = selectedAccount.type === 'credit' || selectedAccount.type === 'loan';
        const isExpense = transactionForm.transactionType === 'outflow';

        let transactionAmount = 0;
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

        // Step 1: Add the transaction
        const transactionData = {
          accountId: transactionForm.accountId,
          date: transactionForm.date,
          payee: transactionForm.payee,
          description: transactionForm.payee,
          amount: transactionAmount,
          categoryId: isReadyToAssign ? null : transactionForm.categoryId,
          memo: transactionForm.memo,
          cleared: transactionForm.cleared ? 1 : 0
        };

        console.log('📝 Adding transaction:', transactionData);
        const transactionResult = await window.electronAPI.addTransaction(transactionData);

        if (!transactionResult.success) {
          setTransactionError(transactionResult.error || 'Failed to add transaction');
          return;
        }

        // Step 2: Calculate and update account balance
        const balanceChange = calculateBalanceChange(
          selectedAccount.type,
          transactionForm.transactionType,
          amountValue
        );

        const currentBalance = selectedAccount.balance || 0;
        const newBalance = currentBalance + balanceChange;

        console.log(`💰 Updating account "${selectedAccount.name}" balance:`, {
          current: formatCurrency(currentBalance),
          change: balanceChange,
          new: formatCurrency(newBalance),
          transactionType: transactionForm.transactionType,
          accountType: selectedAccount.type
        });

        const updateResult = await window.electronAPI.updateAccount(
          selectedAccount.id,
          userResult.data.id,
          { balance: newBalance }
        );

        if (!updateResult.success) {
          console.error('Failed to update account balance:', updateResult.error);
          setTransactionError('Transaction added but failed to update account balance. Please refresh the page.');
          return;
        }

        console.log('✅ Transaction and account balance updated successfully');

        // Step 3: Refresh all UI components
        await loadAccounts(); // Refresh accounts in this component

        // Dispatch events to refresh other parts of the app
        window.dispatchEvent(new CustomEvent('refresh-prosperity-map'));
        window.dispatchEvent(new CustomEvent('accounts-updated'));

        // Step 4: Reset form and close modal
        setTransactionForm({
          accountId: '',
          transactionType: 'outflow',
          categoryId: '',
          amount: '',
          date: new Date().toISOString().split('T')[0],
          payee: '',
          memo: '',
          cleared: true
        });

        setShowAddTransactionModal(false);
        alert('✅ Transaction added and account balance updated successfully');

      } catch (error) {
        console.error('Error adding transaction:', error);
        setTransactionError('An unexpected error occurred: ' + error.message);
      } finally {
        setIsSubmitting(false);
      }
    };
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
      color: '#6B7280',
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
                    borderColor: selectedStrategy === strategy.id ? strategy.color : '#374151',
                    background: selectedStrategy === strategy.id ? `${strategy.color}20` : '#111827'
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
                    <div style={{ fontSize: '0.65rem', color: '#6B7280' }}>
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
              <div style={styles.formGroup}>
                <label style={styles.label}>Account *</label>
                <select
                  value={transactionForm.accountId}
                  onChange={(e) => setTransactionForm({ ...transactionForm, accountId: e.target.value })}
                  style={styles.select}
                >
                  <option value="">Select an account</option>
                  {accounts.map(account => {
                    const balance = account.balance || 0;
                    const absBalance = formatCurrency(Math.abs(balance));
                    const balanceDisplay = (account.type === 'credit' || account.type === 'loan')
                      ? `(${absBalance})`
                      : absBalance;

                    let typeLabel = account.type;
                    if (account.type === 'credit') typeLabel = '💳 Credit Card';
                    else if (account.type === 'loan') typeLabel = '🏦 Loan';
                    else if (account.type === 'savings') typeLabel = '💰 Savings';
                    else if (account.type === 'checking') typeLabel = '💵 Checking';

                    return (
                      <option key={account.id} value={account.id}>
                        {account.name} ({typeLabel}) - Balance: {balanceDisplay}
                      </option>
                    );
                  })}
                </select>
                {accounts.length === 0 && (
                  <small style={styles.hint}>No accounts found. Please create an account first.</small>
                )}
              </div>

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
                >
                  <option value="outflow">Outflow (Expense)</option>
                  <option value="inflow">Inflow (Income)</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Category *</label>
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
                <label style={styles.label}>Payee *</label>
                <input
                  type="text"
                  value={transactionForm.payee}
                  onChange={(e) => setTransactionForm({ ...transactionForm, payee: e.target.value })}
                  style={styles.input}
                  placeholder="e.g., Starbucks, Rent, Paycheck"
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
    background: '#0047AB',
    borderRadius: '1rem',
    padding: '1.5rem',
    border: '1px solid #374151',
    position: 'sticky',
    top: '2rem'
  },
  header: { marginBottom: '1.5rem' },
  title: { fontSize: '1.25rem', fontWeight: '600', color: 'white', margin: '0 0 0.25rem 0' },
  month: { fontSize: '0.875rem', color: '#000000' },
  metricsContainer: { display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '1.5rem' },
  metricCard: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '1rem', background: '#0A2472', borderRadius: '0.75rem', border: '1px solid #0A2472' },
  metricIcon: { fontSize: '2rem' },
  metricContent: { flex: 1 },
  metricLabel: { fontSize: '0.875rem', color: '#9CA3AF', marginBottom: '0.25rem' },
  metricValue: { fontSize: '1.5rem', fontWeight: 'bold', color: 'white', lineHeight: '1.2' },
  metricSubtext: { fontSize: '0.75rem', color: '#6B7280', marginTop: '0.25rem' },
  progressSection: { marginBottom: '1.5rem' },
  progressHeader: { display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' },
  progressTitle: { fontSize: '0.875rem', color: '#0A2472' },
  progressPercentage: { fontSize: '0.875rem', fontWeight: '600', color: 'white' },
  progressBarBackground: { height: '8px', background: '#0A2472', borderRadius: '4px', overflow: 'hidden' },
  progressBarFill: { height: '100%', borderRadius: '4px', transition: 'width 0.3s ease' },
  statsGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' },
  statItem: { padding: '0.75rem', background: '#0A2472', borderRadius: '0.5rem', textAlign: 'center' },
  statLabel: { display: 'block', fontSize: '0.75rem', color: '#9CA3AF', marginBottom: '0.25rem' },
  statValue: { fontSize: '1rem', fontWeight: '600', color: 'white' },
  autoAssignSection: { marginBottom: '1.5rem', background: '#0A2472', borderRadius: '0.75rem', border: '1px solid #374151', overflow: 'hidden' },
  autoAssignHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', background: '#0A2472', borderBottom: '1px solid #0A2472', cursor: 'pointer' },
  autoAssignTitle: { fontSize: '1rem', fontWeight: '600', color: 'white', margin: 0 },
  autoAssignToggle: { background: '#0A2472', border: 'none', color: '#9CA3AF', fontSize: '0.9rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' },
  autoAssignOptions: { padding: '1rem' },
  strategyGrid: { display: 'grid', gridTemplateColumns: '1fr', gap: '0.75rem', marginBottom: '1rem' },
  strategyCard: { display: 'flex', alignItems: 'center', gap: '1rem', padding: '0.75rem', background: '#111827', border: '2px solid #374151', borderRadius: '0.5rem', cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s ease' },
  strategyIcon: { fontSize: '1.5rem' },
  strategyContent: { flex: 1 },
  strategyName: { fontSize: '0.95rem', fontWeight: '600', color: 'white', marginBottom: '0.25rem' },
  strategyDescription: { fontSize: '0.75rem', color: '#9CA3AF' },
  weightControls: { background: '#0F172A', padding: '12px', borderRadius: '8px', marginBottom: '12px' },
  weightLabel: { fontSize: '12px', color: '#94A3B8', marginBottom: '8px' },
  sliderGroup: { marginBottom: '8px' },
  slider: { width: '100%', margin: '4px 0' },
  calculating: { padding: '1rem', textAlign: 'center', color: '#9CA3AF', fontStyle: 'italic', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' },
  spinner: { width: '16px', height: '16px', border: '2px solid #374151', borderTopColor: '#8B5CF6', borderRadius: '50%', animation: 'spin 1s linear infinite' },
  previewContainer: { marginTop: '1rem', padding: '1rem', background: '#111827', borderRadius: '0.5rem', border: '1px solid #374151' },
  previewHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem', flexWrap: 'wrap', gap: '0.5rem' },
  previewTitle: { fontSize: '0.9rem', fontWeight: '600', color: '#8B5CF6' },
  previewMessage: { fontSize: '0.7rem', color: '#4ADE80', marginTop: '0.25rem' },
  previewSummary: { fontSize: '0.7rem', color: '#9CA3AF' },
  previewList: { maxHeight: '300px', overflowY: 'auto', marginBottom: '1rem' },
  previewItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #374151' },
  previewItemInfo: { flex: 1, marginRight: '1rem' },
  previewItemName: { fontSize: '0.85rem', fontWeight: '500', color: 'white', display: 'block' },
  previewItemReason: { fontSize: '0.65rem', color: '#9CA3AF', display: 'block' },
  priorityBadge: { fontSize: '0.6rem', color: '#8B5CF6', marginTop: '2px' },
  previewProgressBar: { marginTop: '0.25rem', height: '3px', background: '#374151', borderRadius: '2px', overflow: 'hidden' },
  previewProgressFill: { height: '100%', borderRadius: '2px', transition: 'width 0.2s ease' },
  previewItemAmount: { fontSize: '0.85rem', fontWeight: '600', whiteSpace: 'nowrap' },
  previewMore: { textAlign: 'center', padding: '0.5rem', color: '#9CA3AF', fontSize: '0.7rem', fontStyle: 'italic' },
  previewActions: { display: 'flex', gap: '0.5rem' },
  applyButton: { flex: 1, padding: '0.5rem', background: '#8B5CF6', color: 'white', border: 'none', borderRadius: '0.25rem', fontSize: '0.8rem', fontWeight: '500', cursor: 'pointer', transition: 'all 0.2s ease' },
  cancelPreviewButton: { flex: 1, padding: '0.5rem', background: '#4B5563', color: 'white', border: 'none', borderRadius: '0.25rem', fontSize: '0.8rem', cursor: 'pointer' },
  warningMessage: { marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(239, 68, 68, 0.1)', border: '1px solid #EF4444', borderRadius: '0.25rem', color: '#EF4444', fontSize: '0.7rem', textAlign: 'center' },
  addTransactionCard: {
    marginTop: '1rem',
    padding: '1rem',
    background: '#0A2472',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
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
    background: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2000,
    backdropFilter: 'blur(4px)'
  },
  modalContent: {
    background: '#1F2937',
    borderRadius: '1rem',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1.5rem',
    borderBottom: '1px solid #374151'
  },
  modalTitle: { fontSize: '1.25rem', fontWeight: '600', color: 'white', margin: 0 },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '1.25rem',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    transition: 'all 0.2s'
  },
  modalBody: { padding: '1.5rem', overflowY: 'auto', flex: 1 },
  modalFooter: { display: 'flex', gap: '1rem', padding: '1.5rem', borderTop: '1px solid #374151' },
  formGroup: { marginBottom: '1rem' },
  label: { display: 'block', marginBottom: '0.5rem', color: '#9CA3AF', fontSize: '0.875rem', fontWeight: '500' },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem',
    cursor: 'pointer'
  },
  hint: { display: 'block', marginTop: '0.5rem', color: '#F87171', fontSize: '0.75rem' },
  inputWrapper: { position: 'relative' },
  currencySymbol: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9CA3AF',
    zIndex: 1
  },
  modalInput: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 2rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem'
  },
  checkboxGroup: { marginTop: '0.5rem' },
  checkboxLabel: { display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#9CA3AF', fontSize: '0.875rem', cursor: 'pointer' },
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
    background: '#4B5563',
    color: 'white',
    border: 'none',
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
  }
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