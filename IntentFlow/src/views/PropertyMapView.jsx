// src/views/PropertyMapView.jsx
import React, { useState, useEffect, useRef } from 'react';
import SummaryView from './SummaryView';
import AutoAssignView from './AutoAssignView';
import FutureMonthsView from './FutureMonthsView';
import useRealtimeUpdates from '../hooks/useRealtimeUpdates';
import BudgetEngine from "../shared/budgetEngine.mjs";

const PropertyMapView = () => {
  const [categoryGroups, setCategoryGroups] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showAddIncomeModal, setShowAddIncomeModal] = useState(false);
  const [showRecordPaymentModal, setShowRecordPaymentModal] = useState(false);
  const [showMoveMoneyModal, setShowMoveMoneyModal] = useState(false);
  const [selectedGroupForCategory, setSelectedGroupForCategory] = useState(null);
  const [editingGroup, setEditingGroup] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [editGroupName, setEditGroupName] = useState('');
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [newCategoryData, setNewCategoryData] = useState({
    name: '',
    assigned: 0,
    groupId: null
  });

  // Initialize BudgetEngine with empty data first
  const [budgetEngine] = useState(() => new BudgetEngine());
  const hasLoadedCategories = useRef(false);

  const [incomeData, setIncomeData] = useState({
    amount: '',
    date: new Date().toISOString().split('T')[0],
    memo: ''
  });
  const [paymentData, setPaymentData] = useState({
    amount: '',
    categoryId: '',
    payee: '',
    date: new Date().toISOString().split('T')[0],
    memo: ''
  });

  // Add with your other state declarations (around line 50-60)
  const [editingCategory, setEditingCategory] = useState(null);
  const [editCategoryData, setEditCategoryData] = useState({
    name: '',
    assigned: 0,
    target_amount: 0,
    target_type: 'monthly'
  });

  const [moveMoneyData, setMoveMoneyData] = useState({
    amount: '',
    fromCategoryId: '',
    toCategoryId: ''
  });
  const [userId, setUserId] = useState(2); // Default to user 2 for now

  // Track total cash in budget accounts (checking, savings, cash)
  const [totalCashInAccounts, setTotalCashInAccounts] = useState(0);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // Budget summary data
  const [budgetSummary, setBudgetSummary] = useState({
    totalAvailable: 0,      // This is Ready to Assign
    totalActivity: 0,
    totalAssigned: 0,
    unassigned: 0           // This should be Ready to Assign
  });

  // ==================== BUDGET DATA STATE ====================
  const [budgetData, setBudgetData] = useState({
    categories: []
  });

  // Add this right after your other state declarations
  useEffect(() => {
    console.log('🔍 COMPONENT MOUNTED - checking electronAPI:', {
      hasGetCategories: !!window.electronAPI?.getCategories,
      hasGetCategoryGroups: !!window.electronAPI?.getCategoryGroups,
      userId: userId
    });
  }, []);

  // ==================== TARGET CALCULATIONS ====================
  const calculateTargetProgress = (category) => {
    if (!category.target_amount || category.target_amount === 0) {
      return { progress: null, status: 'no-target', needed: 0 };
    }

    switch (category.target_type) {
      case 'monthly':
        // Monthly target: progress based on assigned amount
        const progress = (category.assigned / category.target_amount) * 100;
        const needed = Math.max(0, category.target_amount - category.assigned);
        return {
          progress,
          status: progress >= 100 ? 'funded' : progress > 0 ? 'partial' : 'unfunded',
          needed,
          targetAmount: category.target_amount,
          currentAmount: category.assigned
        };

      case 'balance':
        // Balance target: progress based on available amount
        const balanceProgress = ((category.available || 0) / category.target_amount) * 100;
        const balanceNeeded = Math.max(0, category.target_amount - (category.available || 0));
        return {
          progress: balanceProgress,
          status: balanceProgress >= 100 ? 'completed' : balanceProgress > 0 ? 'in-progress' : 'not-started',
          needed: balanceNeeded,
          targetAmount: category.target_amount,
          currentAmount: category.available || 0
        };

      case 'by_date':
        // Date-based target: calculate monthly contribution needed
        if (!category.target_date) return { progress: null, status: 'no-date', needed: 0 };

        const today = new Date();
        const targetDate = new Date(category.target_date);
        const monthsRemaining = (targetDate.getFullYear() - today.getFullYear()) * 12 +
          (targetDate.getMonth() - today.getMonth());

        const totalNeeded = category.target_amount - (category.available || 0);
        const monthlyNeeded = monthsRemaining > 0 ? totalNeeded / monthsRemaining : totalNeeded;
        const dateProgress = ((category.available || 0) / category.target_amount) * 100;

        return {
          progress: dateProgress,
          status: dateProgress >= 100 ? 'completed' : 'in-progress',
          needed: totalNeeded,
          monthlyNeeded: Math.max(0, monthlyNeeded),
          targetAmount: category.target_amount,
          currentAmount: category.available || 0,
          monthsRemaining: Math.max(0, monthsRemaining)
        };

      default:
        return { progress: null, status: 'no-target', needed: 0 };
    }
  };

  const calculateUnderfundedCategories = () => {
    return budgetData.categories.filter(cat => {
      const targetInfo = calculateTargetProgress(cat);
      return targetInfo.status === 'partial' ||
        targetInfo.status === 'unfunded' ||
        targetInfo.status === 'in-progress';
    });
  };

  const getTotalUnderfunded = () => {
    let total = 0;
    budgetData.categories.forEach(cat => {
      const targetInfo = calculateTargetProgress(cat);
      if (targetInfo.needed && targetInfo.needed > 0) {
        total += targetInfo.needed;
      }
    });
    return total;
  };

  // Update progress for all categories
  const updateAllProgress = () => {
    setBudgetData(prev => ({
      ...prev,
      categories: prev.categories.map(cat => ({
        ...cat,
        progress: calculateTargetProgress(cat).progress || 0
      }))
    }));
  };

  // ==================== READY TO ASSIGN CALCULATION ====================
  const calculateReadyToAssign = () => {
    const categories = budgetData.categories;

    // Total assigned (sum of all assigned amounts)
    const totalAssigned = categories.reduce((sum, cat) => sum + (cat.assigned || 0), 0);

    // Total activity (sum of all activity)
    const totalActivity = categories.reduce((sum, cat) => sum + (cat.activity || 0), 0);

    let readyToAssign = 0;

    if (budgetEngine && typeof budgetEngine.calculateReadyToAssign === 'function') {
      try {
        readyToAssign = budgetEngine.calculateReadyToAssign(
          totalCashInAccounts,
          totalAssigned
        );
      } catch (error) {
        console.error('Error calculating ready to assign with budgetEngine:', error);
        readyToAssign = totalCashInAccounts - totalAssigned;
      }
    } else {
      readyToAssign = totalCashInAccounts - totalAssigned;
    }

    setBudgetSummary({
      totalAvailable: readyToAssign,
      totalActivity,
      totalAssigned,
      unassigned: readyToAssign
    });

    console.log('📊 Budget Summary Calculated:', {
      totalCashInAccounts,
      totalAssigned,
      readyToAssign,
      totalActivity
    });
  };

  // Calculate Ready to Assign whenever categories or cash changes
  useEffect(() => {
    calculateReadyToAssign();
  }, [budgetData.categories, totalCashInAccounts]);

  // 👇 ADD THE DEBUG EFFECT HERE 👇
  useEffect(() => {
    console.log('🔍 CURRENT STATE AFTER LOAD:');
    console.log('- budgetData.categories:', budgetData.categories);
    console.log('- categories state:', categories);
    console.log('- categoryGroups:', categoryGroups);
    console.log('- totalCashInAccounts:', totalCashInAccounts);
    console.log('- userId:', userId);
  }, [budgetData, categories, categoryGroups, totalCashInAccounts, userId]);

  // Debug useEffect for categories updates
  useEffect(() => {
    console.log('📊 budgetData.categories UPDATED:', {
      count: budgetData.categories.length,
      categories: budgetData.categories.map(c => ({
        id: c.id,
        name: c.name,
        assigned: c.assigned
      }))
    });
  }, [budgetData.categories]);

  // // Sync BudgetEngine with categories
  // useEffect(() => {
  //   if (budgetData && budgetData.categories) {
  //     try {
  //       console.log('🔄 Syncing budgetEngine with categories:', budgetData.categories.length);

  //       if (Array.isArray(budgetData.categories)) {
  //         budgetEngine.setCategories(budgetData.categories);
  //         console.log('✅ BudgetEngine synced successfully');
  //       } else {
  //         console.error('❌ budgetData.categories is not an array:', budgetData.categories);
  //       }
  //     } catch (error) {
  //       console.error('❌ Error syncing BudgetEngine:', error);
  //     }
  //   }
  // }, [budgetData, budgetEngine]);

  // Debug useEffect for initial data
  useEffect(() => {
    console.log('🔍 Initial categories loaded:', budgetData.categories.map(c => ({ id: c.id, name: c.name })));
    console.log('🔍 Total cash in accounts:', totalCashInAccounts);
  }, []);

  // ==================== REALTIME UPDATES ====================
  const { lastUpdate } = useRealtimeUpdates(['prosperity:updated'], () => {
    // Refresh data
    loadCategoryGroups();
    loadCategoriesFromDB();
    calculateReadyToAssign();
  });

  // Also listen for manual refresh events
  useEffect(() => {
    const handleRefresh = () => {
      loadCategoryGroups();
      loadCategoriesFromDB();
      calculateReadyToAssign();
    };

    window.addEventListener('refresh-prosperity-map', handleRefresh);

    return () => {
      window.removeEventListener('refresh-prosperity-map', handleRefresh);
    };
  }, []);

  // Calculate progress whenever relevant data changes
  useEffect(() => {
    updateAllProgress();
  }, [budgetData.categories.map(cat => cat.available + cat.assigned + (cat.activity || 0)).join(',')]);

  // ==================== WINDOW HANDLERS FOR QUICK ACTIONS ====================
  useEffect(() => {
    window.onAddIncomeClick = () => {
      console.log('💰 Add Income clicked - opening modal');
      setShowAddIncomeModal(true);
    };

    window.onRecordPaymentClick = () => {
      console.log('💳 Record Payment clicked - opening modal');
      setShowRecordPaymentModal(true);
    };

    window.onMoveMoneyClick = () => {
      console.log('🔄 Move Money clicked - opening modal');
      setShowMoveMoneyModal(true);
    };

    console.log('✅ Quick Action handlers registered');

    return () => {
      window.onAddIncomeClick = null;
      window.onRecordPaymentClick = null;
      window.onMoveMoneyClick = null;
    };
  }, []);

  // ==================== QUICK ASSIGN FUNCTIONS ====================
  const handleQuickAssign = (method) => {
    if (budgetSummary.unassigned <= 0) {
      alert('No funds available to assign');
      return;
    }

    let allocations = [];
    let remainingFunds = budgetSummary.unassigned;

    switch (method) {
      case 'underfunded':
        // Prioritize: overspent → monthly targets → savings goals
        const overspent = budgetData.categories.filter(c => (c.available || 0) < 0);
        const monthlyTargets = budgetData.categories.filter(c =>
          c.target_type === 'monthly' && (c.assigned || 0) < (c.target_amount || 0)
        );
        const savingsGoals = budgetData.categories.filter(c =>
          c.target_type === 'balance' && (c.available || 0) < (c.target_amount || 0)
        );

        // First, fix overspent categories
        overspent.forEach(cat => {
          const needed = Math.abs(cat.available || 0);
          if (remainingFunds >= needed) {
            allocations.push({ categoryId: cat.id, amount: needed });
            remainingFunds -= needed;
          }
        });

        // Then fund monthly targets
        monthlyTargets.forEach(cat => {
          const needed = (cat.target_amount || 0) - (cat.assigned || 0);
          if (needed > 0 && remainingFunds >= needed) {
            allocations.push({ categoryId: cat.id, amount: needed });
            remainingFunds -= needed;
          }
        });

        // Finally, contribute to savings goals
        savingsGoals.forEach(cat => {
          const needed = (cat.target_amount || 0) - (cat.available || 0);
          if (needed > 0 && remainingFunds >= needed) {
            allocations.push({ categoryId: cat.id, amount: needed });
            remainingFunds -= needed;
          }
        });
        break;

      case 'last-month':
        // Use last month's assigned amounts
        budgetData.categories.forEach(cat => {
          const lastMonthAmount = cat.last_month_assigned || cat.assigned || 0;
          const currentAssigned = cat.assigned || 0;
          const needed = Math.max(0, lastMonthAmount - currentAssigned);

          if (needed > 0 && remainingFunds >= needed) {
            allocations.push({ categoryId: cat.id, amount: needed });
            remainingFunds -= needed;
          }
        });
        break;

      case 'average':
        // Use average spending
        budgetData.categories.forEach(cat => {
          const avgSpend = cat.average_spending || cat.assigned || 0;
          const currentAssigned = cat.assigned || 0;
          const needed = Math.max(0, avgSpend - currentAssigned);

          if (needed > 0 && remainingFunds >= needed) {
            allocations.push({ categoryId: cat.id, amount: needed });
            remainingFunds -= needed;
          }
        });
        break;
    }

    // Apply allocations if any
    if (allocations.length > 0) {
      setBudgetData(prev => ({
        ...prev,
        categories: prev.categories.map(cat => {
          const allocation = allocations.find(a => a.categoryId === cat.id);
          if (allocation) {
            return {
              ...cat,
              assigned: (cat.assigned || 0) + allocation.amount,
              available: (cat.available || 0) + allocation.amount
            };
          }
          return cat;
        })
      }));

      alert(`✅ Assigned $${allocations.reduce((sum, a) => sum + a.amount, 0).toFixed(2)} to ${allocations.length} categories`);
    } else {
      alert('No categories need funding');
    }
  };

  // ==================== ADD INCOME FUNCTIONALITY ====================
  const handleAddIncome = () => {
    const amount = parseFloat(incomeData.amount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    // Add to total cash in accounts (increases Ready to Assign)
    setTotalCashInAccounts(prev => prev + amount);

    console.log('Income added to Ready to Assign:', {
      amount,
      date: incomeData.date,
      memo: incomeData.memo,
      newReadyToAssign: totalCashInAccounts + amount - budgetSummary.totalAssigned
    });

    // Reset form and close modal
    setIncomeData({
      amount: '',
      date: new Date().toISOString().split('T')[0],
      memo: ''
    });
    setShowAddIncomeModal(false);

    alert(`✅ $${amount.toFixed(2)} added to Ready to Assign`);
  };

  // ==================== RECORD PAYMENT FUNCTIONALITY ====================
  const handleRecordPayment = async () => {
    const amount = parseFloat(paymentData.amount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (!paymentData.categoryId) {
      alert('Please select a category');
      return;
    }

    const selectedCategory = budgetData.categories.find(c => c.id === paymentData.categoryId);
    if (!selectedCategory) return;

    // Check if category has enough available
    if (selectedCategory.available < amount) {
      if (!confirm(`Warning: This category only has ${formatCurrency(selectedCategory.available)} available. Overspending will make it negative. Continue?`)) {
        return;
      }
    }

    try {
      // Get current user
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('Please log in to record payments');
        return;
      }

      // Get default account (first checking/savings account)
      const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
      const defaultAccount = accountsResult?.data?.find(a => a.type === 'checking' || a.type === 'savings');

      if (!defaultAccount) {
        alert('No account found to record payment from');
        return;
      }

      // Create actual transaction in database
      const transactionData = {
        accountId: defaultAccount.id,
        date: paymentData.date,
        payee: paymentData.payee || 'Payment',
        description: paymentData.payee || 'Payment',
        amount: -amount, // Negative for outflow
        categoryId: paymentData.categoryId,
        memo: paymentData.memo,
        cleared: 1
      };

      console.log('📝 Creating payment transaction:', transactionData);
      const result = await window.electronAPI.addTransaction(transactionData);

      if (result.success) {
        // Update the category activity and available in UI
        setBudgetData(prev => ({
          ...prev,
          categories: prev.categories.map(cat =>
            cat.id === paymentData.categoryId
              ? {
                ...cat,
                activity: (cat.activity || 0) - amount,
                available: (cat.available || 0) - amount
              }
              : cat
          )
        }));

        // Also reduce total cash in accounts (money left the account)
        setTotalCashInAccounts(prev => prev - amount);

        console.log('Payment recorded:', {
          amount,
          category: selectedCategory.name,
          payee: paymentData.payee,
          date: paymentData.date,
          memo: paymentData.memo
        });

        setPaymentData({
          amount: '',
          categoryId: '',
          payee: '',
          date: new Date().toISOString().split('T')[0],
          memo: ''
        });
        setShowRecordPaymentModal(false);

        alert(`✅ Payment of $${amount.toFixed(2)} recorded to ${selectedCategory.name}`);
      } else {
        alert('❌ Error recording payment: ' + result.error);
      }
    } catch (error) {
      console.error('Error recording payment:', error);
      alert('❌ Error recording payment: ' + error.message);
    }
  };

  // ==================== MOVE MONEY FUNCTIONALITY ====================
  const handleMoveMoney = () => {
    const amount = parseFloat(moveMoneyData.amount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    if (!moveMoneyData.fromCategoryId || !moveMoneyData.toCategoryId) {
      alert('Please select both source and destination categories');
      return;
    }

    if (moveMoneyData.fromCategoryId === moveMoneyData.toCategoryId) {
      alert('Source and destination categories must be different');
      return;
    }

    const fromCategory = budgetData.categories.find(c => c.id === moveMoneyData.fromCategoryId);
    const toCategory = budgetData.categories.find(c => c.id === moveMoneyData.toCategoryId);

    if (!fromCategory || !toCategory) return;

    // Check if source has enough available
    if (fromCategory.available < amount) {
      alert(`Source category only has ${formatCurrency(fromCategory.available)} available`);
      return;
    }

    // Update both categories
    setBudgetData(prev => ({
      ...prev,
      categories: prev.categories.map(cat => {
        if (cat.id === moveMoneyData.fromCategoryId) {
          return {
            ...cat,
            assigned: (cat.assigned || 0) - amount,
            available: (cat.available || 0) - amount
          };
        }
        if (cat.id === moveMoneyData.toCategoryId) {
          return {
            ...cat,
            assigned: (cat.assigned || 0) + amount,
            available: (cat.available || 0) + amount
          };
        }
        return cat;
      })
    }));

    console.log('Money moved:', {
      amount,
      from: fromCategory.name,
      to: toCategory.name
    });

    setMoveMoneyData({
      amount: '',
      fromCategoryId: '',
      toCategoryId: ''
    });
    setShowMoveMoneyModal(false);

    alert(`✅ $${amount.toFixed(2)} moved from ${fromCategory.name} to ${toCategory.name}`);
  };

  // ==================== ASSIGN MONEY TO CATEGORIES ====================
  const handleAssignToCategory = (categoryId, amount) => {
    console.log('💰 Assigning to category:', { categoryId, amount });

    // Update local state first
    setBudgetData(prev => ({
      ...prev,
      categories: prev.categories.map(cat =>
        cat.id === categoryId
          ? {
            ...cat,
            assigned: (cat.assigned || 0) + amount,
            available: (cat.available || 0) + amount
          }
          : cat
      )
    }));

    // Then save to database
    const category = budgetData.categories.find(c => c.id === categoryId);
    if (category) {
      const newAssigned = (category.assigned || 0) + amount;
      console.log('💾 Saving to database:', { categoryId, newAssigned });
      updateCategoryAssigned(categoryId, newAssigned);
    }
  };

  // ==================== MOVE FROM CATEGORY BACK TO READY TO ASSIGN ====================
  const handleMoveToReadyToAssign = (categoryId, amount) => {
    setBudgetData(prev => ({
      ...prev,
      categories: prev.categories.map(cat =>
        cat.id === categoryId
          ? {
            ...cat,
            assigned: (cat.assigned || 0) - amount,
            available: (cat.available || 0) - amount
          }
          : cat
      )
    }));
  };

  // ==================== AUTO-ASSIGN FUNCTIONALITY ====================
  const handleAutoAssign = (allocations) => {
    setBudgetData(prev => ({
      ...prev,
      categories: prev.categories.map(cat => {
        const allocation = allocations.find(a => a.categoryId === cat.id);
        if (allocation) {
          return {
            ...cat,
            assigned: (cat.assigned || 0) + allocation.amount,
            available: (cat.available || 0) + allocation.amount
          };
        }
        return cat;
      })
    }));

    alert('✅ Auto-assign completed successfully!');
  };

  // ==================== INLINE CATEGORY EDITING ====================
  const handleEditCategory = (category) => {
    setEditingCategory(category.id);
    setEditCategoryData({
      name: category.name,
      assigned: category.assigned || 0,
      target_amount: category.target_amount || 0,
      target_type: category.target_type || 'monthly'
    });
  };


  const handleSaveCategoryEdit = async (categoryId) => {
    if (!editCategoryData.name.trim()) return;

    try {
      // Update local state first
      setBudgetData(prev => ({
        ...prev,
        categories: prev.categories.map(cat =>
          cat.id === categoryId
            ? {
              ...cat,
              name: editCategoryData.name,
              assigned: editCategoryData.assigned,
              target_amount: editCategoryData.target_amount,
              target_type: editCategoryData.target_type,
              available: editCategoryData.assigned - (cat.activity || 0),
            }
            : cat
        )
      }));

      // Save to database - FIXED: Create updates object first
      if (window.electronAPI?.updateCategory) {
        // Create the updates object
        const updates = {
          name: editCategoryData.name,
          assigned: editCategoryData.assigned,
          target_amount: editCategoryData.target_amount,
          target_type: editCategoryData.target_type
        };

        console.log('📤 Saving category edit:', { categoryId, updates });
        console.log('📤 Saving category edit:', { categoryId, updates });
        console.log('🔍 editCategoryData full object:', editCategoryData);
        console.log('🔍 updates.assigned value:', updates.assigned);
        console.log('🔍 typeof updates.assigned:', typeof updates.assigned);

        // Call with two separate parameters: categoryId and updates
        const result = await window.electronAPI.updateCategory(categoryId, updates);
        console.log('📥 Update result:', result);
      }

      // Exit edit mode
      setEditingCategory(null);
      setEditCategoryData({
        name: '',
        assigned: 0,
        target_amount: 0,
        target_type: 'monthly'
      });

    } catch (error) {
      console.error('❌ Error updating category:', error);
      setEditingCategory(null);
    }
  };

  const handleCancelEdit = () => {
    setEditingCategory(null);
    setEditCategoryData({
      name: '',
      assigned: 0,
      target_amount: 0,
      target_type: 'monthly'
    });
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      // Remove from local state
      setBudgetData(prev => ({
        ...prev,
        categories: prev.categories.filter(cat => cat.id !== categoryId)
      }));

      // Delete from database
      const deleteResult = await window.electronAPI.deleteCategory(categoryId);

      if (deleteResult.success) {
        console.log('✅ Category deleted successfully');
      } else {
        console.error('❌ Failed to delete category');
        // Optionally reload from DB if delete failed
        await loadCategoriesFromDB();
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Failed to delete category');
    }
  };

  // ==================== DATABASE UPDATE FUNCTIONS ====================
  const updateCategoryAssigned = async (categoryId, newAssigned) => {
    console.log('📤 Sending update to main process:', { categoryId, newAssigned });

    try {
      const result = await window.electronAPI.updateCategory(categoryId, {
        assigned: newAssigned
      });

      console.log('📥 Response from main process:', result);

      if (!result.success) {
        console.error('Failed to update category assigned amount:', result.error);
      } else {
        console.log('✅ Category updated successfully in DB');
      }
    } catch (error) {
      console.error('❌ Error updating category:', error);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryData.name.trim()) return;

    try {
      setLoading(true);

      // IMPORTANT: Make sure we're using the REAL group ID, not a temp ID
      let groupId = newCategoryData.groupId;

      // Check if this is a temporary ID (starts with 'temp-')
      if (groupId && groupId.startsWith('temp-')) {
        console.log('⚠️ Attempting to use temporary group ID:', groupId);

        // Try to find the real group in categoryGroups state
        const realGroup = categoryGroups.find(g => g.id === groupId);

        if (realGroup) {
          // If we found it in state but it's still temp, wait for real ID
          console.log('⏳ Group still has temp ID, waiting for real ID...');
          alert('Please wait for the group to be fully created before adding categories.');
          setLoading(false);
          return;
        } else {
          // Group doesn't exist, set to null
          console.log('❌ Group not found, setting to null');
          groupId = null;
        }
      }

      console.log('📤 Creating category with data:', {
        name: newCategoryData.name,
        assigned: newCategoryData.assigned,
        group_id: groupId,
        user_id: userId
      });

      const categoryData = {
        name: newCategoryData.name,
        assigned: newCategoryData.assigned,
        group_id: groupId,
        user_id: userId,
        target_amount: newCategoryData.assigned,
        target_type: 'monthly',
        target_date: null
      };

      const result = await window.electronAPI.createCategory(categoryData);

      if (result.success) {
        const newCategory = {
          id: result.data.id,
          name: categoryData.name,
          assigned: categoryData.assigned,
          activity: 0,
          available: categoryData.assigned,
          groupId: groupId,
          user_id: userId,
          priority: 2,
          target_amount: categoryData.assigned,
          target_type: 'monthly',
          target_date: null,
          progress: categoryData.assigned > 0 ? 100 : 0,
          last_month_assigned: 0,
          average_spending: 0
        };

        setBudgetData(prev => ({
          ...prev,
          categories: [...prev.categories, newCategory]
        }));

        setCategories(prev => [...prev, newCategory]);

        setShowAddCategoryModal(false);
        setNewCategoryData({ name: '', assigned: 0, groupId: null });
        setSelectedGroupForCategory(null);

        alert('✅ Category created successfully!');
      } else {
        alert('❌ Failed to create category: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error creating category:', error);
      alert('Error creating category: ' + error.message);
    } finally {
      setLoading(false);
    }
  };
  // Default groups
  const defaultGroups = [
    { id: 'fixed', name: 'Fixed Expenses' },
    { id: 'variable', name: 'Variable Expenses' },
    { id: 'savings', name: 'Savings Goals' },
    { id: 'debt', name: 'Debt' }
  ];

  // Replace your initialization useEffect with this:
  useEffect(() => {
    const initializeData = async () => {
      console.log('🚀 INITIALIZE DATA STARTED for userId:', userId);

      if (!userId) {
        console.log('⚠️ No userId yet, skipping initialization');
        return;
      }

      // Wait longer for session to fully restore
      console.log('⏳ Waiting for session to stabilize...');
      await new Promise(resolve => setTimeout(resolve, 1000)); // Increased to 1 second

      try {
        setLoading(true);

        // Load groups first
        console.log('📋 Loading category groups for userId:', userId);
        await loadCategoryGroups();

        // Load categories from DB
        console.log('📋 Loading categories from DB for userId:', userId);
        await loadCategoriesFromDB();

        // Calculate cash from real accounts instead of hardcoding
        try {
          const userResult = await window.electronAPI.getCurrentUser();
          if (userResult?.success && userResult?.data) {
            const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
            if (accountsResult?.success) {
              const totalCash = accountsResult.data
                .filter(acc => acc.type === 'checking' || acc.type === 'savings')
                .reduce((sum, acc) => sum + (acc.balance || 0), 0);
              setTotalCashInAccounts(totalCash);
              console.log('💰 Total cash from accounts:', totalCash);
            }
          }
        } catch (error) {
          console.error('Error fetching account balances:', error);
          setTotalCashInAccounts(5400); // fallback
        }

        setInitialLoadComplete(true);
        console.log('✅ initializeData completed for userId:', userId);
      } catch (error) {
        console.error('❌ Error during initialization:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeData();
  }, [userId]); // This runs when userId changes (after login)

  // ==================== LOAD CATEGORIES FROM DATABASE ====================
  const loadCategoriesFromDB = async (retryCount = 0) => {
    console.log('📥 ===== loadCategoriesFromDB CALLED ===== (attempt:', retryCount + 1, ')');
    console.log('📥 Current userId:', userId);

    if (!window.electronAPI?.getCategories) {
      console.error('❌ electronAPI.getCategories is not available!');
      return;
    }

    if (!userId) {
      console.warn('⚠️ No userId provided to loadCategoriesFromDB');
      return;
    }

    try {
      setLoading(true);
      console.log('📥 Calling getCategories with userId:', userId);

      const result = await window.electronAPI.getCategories(userId);
      console.log('📥 Raw result:', result);

      // If we got empty data but this is not a retry, try again after a delay
      if (result && result.success && result.data && result.data.length === 0 && retryCount < 3) {
        console.log(`⚠️ Got empty data, retrying in 300ms... (attempt ${retryCount + 1}/3)`);
        setTimeout(() => {
          loadCategoriesFromDB(retryCount + 1);
        }, 300);
        return;
      }

      // Update budgetData with database results
      if (result && result.success && result.data) {
        console.log('✅ Successfully loaded categories from DB:', result.data.length);

        if (result.data.length > 0) {
          console.log('📋 First category from DB:', result.data[0]);

          // Transform database fields to match your UI structure
          const dbCategories = result.data.map(cat => ({
            id: cat.id,
            name: cat.name,
            assigned: cat.assigned || 0,
            activity: cat.activity || 0,
            available: cat.available || 0,
            groupId: cat.group_id,
            user_id: cat.user_id,
            priority: cat.priority || 2,
            target_amount: cat.target_amount,
            target_type: cat.target_type || 'monthly',
            target_date: cat.target_date,
            progress: 0, // Will be calculated
            last_month_assigned: cat.last_month_assigned || 0,
            average_spending: cat.average_spending || 0
          }));

          console.log('📋 Transformed categories:', dbCategories.length);

          // Update both budgetData and categories state
          setBudgetData(prev => ({
            ...prev,
            categories: dbCategories
          }));
          console.log('✅ State updated with DB categories:', dbCategories.length);
          console.log('🔍 First category after state update:', dbCategories[0]);
          console.log('🔍 All category IDs:', dbCategories.map(c => c.id));
          console.log('🔍 All group IDs:', dbCategories.map(c => c.groupId));
          setCategories(dbCategories);

          console.log('✅ State updated with DB categories:', dbCategories.length);
        } else {
          console.warn('⚠️ No categories found in DB or invalid response', result);

          // If no data, set empty array
          setBudgetData(prev => ({
            ...prev,
            categories: []
          }));
          setCategories([]);
        }
      }
    } catch (error) {
      console.error('❌ Error loading categories:', error);
    } finally {
      setLoading(false);
    }
  };


  // ==================== LOAD CATEGORY GROUPS ====================
  // ==================== LOAD CATEGORY GROUPS ====================
  // ==================== LOAD CATEGORY GROUPS ====================
  // ==================== LOAD CATEGORY GROUPS ====================
  // ==================== LOAD CATEGORY GROUPS ====================
  const loadCategoryGroups = async () => {
    try {
      setLoading(true);
      console.log('📋 Loading category groups for userId:', userId);

      const result = await window.electronAPI.getCategoryGroups(userId);
      console.log('📋 Category groups result:', JSON.stringify(result, null, 2));

      if (result.success && result.data && result.data.length > 0) {
        // ===== PART 1: DELETE ALL EXISTING DUPLICATES =====
        const groupNames = {};
        const groupsToDelete = [];
        const uniqueGroups = [];

        // First pass: organize groups by name (case insensitive)
        result.data.forEach(group => {
          const name = group.name.toUpperCase().trim();
          if (!groupNames[name]) {
            groupNames[name] = [];
          }
          groupNames[name].push(group);
        });

        // Second pass: keep ONE group per name, delete the rest
        Object.keys(groupNames).forEach(name => {
          const groups = groupNames[name];

          if (groups.length > 1) {
            console.log(`🧹 Found ${groups.length} duplicate groups for "${name}"`);

            // Sort by creation date if available, or just keep the first one
            const sortedGroups = groups.sort((a, b) => {
              // If you have created_at field, use it
              if (a.created_at && b.created_at) {
                return new Date(a.created_at) - new Date(b.created_at);
              }
              return 0;
            });

            // Keep the first/oldest one
            const [keep, ...toDelete] = sortedGroups;
            uniqueGroups.push(keep);

            console.log(`✅ Keeping one "${name}" group:`, keep.id);

            // Mark rest for deletion
            toDelete.forEach(group => {
              groupsToDelete.push({
                group: group,
                keepId: keep.id,
                name: name
              });
            });
          } else {
            // No duplicates, just keep the single group
            uniqueGroups.push(groups[0]);
          }
        });

        // Delete all duplicate groups
        if (groupsToDelete.length > 0) {
          console.log('🗑️ Deleting', groupsToDelete.length, 'duplicate groups...');

          for (const item of groupsToDelete) {
            try {
              // Update any categories that reference this group to point to the kept group
              if (window.electronAPI.updateCategoriesForGroup) {
                await window.electronAPI.updateCategoriesForGroup(item.group.id, { group_id: item.keepId });
                console.log(`🔄 Moved categories from ${item.group.id} to ${item.keepId}`);
              }

              // Delete the duplicate group
              await window.electronAPI.deleteCategoryGroup(item.group.id, userId);
              console.log(`✅ Deleted duplicate ${item.name} group: ${item.group.id}`);
            } catch (e) {
              console.log(`⚠️ Could not delete duplicate ${item.name} group:`, item.group.id, e);
            }
          }

          // Fetch fresh data after cleanup
          const freshResult = await window.electronAPI.getCategoryGroups(userId);
          if (freshResult.success && freshResult.data) {
            console.log('✅ Loaded groups after duplicate cleanup:', freshResult.data.length);
            setCategoryGroups(freshResult.data);
          } else {
            setCategoryGroups(uniqueGroups);
          }
        } else {
          // No duplicates found
          console.log('✅ Loaded EXISTING groups from DB (no duplicates):', result.data.length);
          setCategoryGroups(result.data);
        }

        // ===== PART 2: PREVENT FUTURE DUPLICATES =====
        // Store unique group names in localStorage for quick reference
        const uniqueGroupNames = uniqueGroups.map(g => g.name.toUpperCase().trim());
        localStorage.setItem('uniqueGroupNames', JSON.stringify(uniqueGroupNames));

      } else {
        console.log('⚠️ No groups found in DB - creating defaults...');
        // Only create defaults if absolutely no groups exist
        console.log('Creating default groups as fallback...');

        const defaultGroups = [
          { name: 'Fixed Expenses', order: 0 },
          { name: 'Variable Expenses', order: 1 },
          { name: 'Savings Goals', order: 2 },
          { name: 'Debt', order: 3 }
        ];

        const createdGroups = [];
        for (const group of defaultGroups) {
          try {
            const createResult = await window.electronAPI.createCategoryGroup(
              userId,
              group.name,
              group.order
            );
            if (createResult.success && createResult.data) {
              createdGroups.push(createResult.data);
            }
          } catch (err) {
            console.error('Error creating group:', group.name, err);
          }
        }

        if (createdGroups.length > 0) {
          setCategoryGroups(createdGroups);
          // Store unique names
          const uniqueGroupNames = createdGroups.map(g => g.name.toUpperCase().trim());
          localStorage.setItem('uniqueGroupNames', JSON.stringify(uniqueGroupNames));
        } else {
          setCategoryGroups([]);
        }
      }
    } catch (error) {
      console.error('Error loading category groups:', error);
      setCategoryGroups([]);
    } finally {
      setLoading(false);
    }
  };

  // ===== PART 3: MODIFY THE CREATE GROUP FUNCTION TO PREVENT DUPLICATES =====
  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;

    try {
      setLoading(true);

      // Check for duplicates BEFORE creating
      const uniqueGroupNames = JSON.parse(localStorage.getItem('uniqueGroupNames') || '[]');
      const newGroupNameUpper = newGroupName.toUpperCase().trim();

      if (uniqueGroupNames.includes(newGroupNameUpper)) {
        alert(`❌ A group named "${newGroupName}" already exists! Please use a different name.`);
        setLoading(false);
        return;
      }

      console.log('📝 Creating group in database:', { userId, name: newGroupName });
      const result = await window.electronAPI.createCategoryGroup(
        userId,
        newGroupName,
        categoryGroups.length
      );

      console.log('📝 Database result:', result);

      if (result.success && result.data) {
        // ✅ Add the group with its REAL database UUID
        setCategoryGroups(prev => [...prev, result.data]);

        // Update the unique names list
        const updatedUniqueNames = [...uniqueGroupNames, newGroupNameUpper];
        localStorage.setItem('uniqueGroupNames', JSON.stringify(updatedUniqueNames));

        setShowAddGroupModal(false);
        setNewGroupName('');
        alert('✅ Group created successfully!');
      } else {
        alert('❌ Failed to create group: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error creating category group:', error);
      alert('Error creating group: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  // ===== PART 4: MODIFY EDIT GROUP FUNCTION TO PREVENT DUPLICATES =====
  const handleUpdateGroup = async () => {
    if (!editGroupName.trim() || !editingGroup) return;

    try {
      // Check for duplicates (excluding the current group)
      const uniqueGroupNames = JSON.parse(localStorage.getItem('uniqueGroupNames') || '[]');
      const newNameUpper = editGroupName.toUpperCase().trim();
      const oldNameUpper = editingGroup.name.toUpperCase().trim();

      // If name is changing and new name already exists
      if (newNameUpper !== oldNameUpper && uniqueGroupNames.includes(newNameUpper)) {
        alert(`❌ A group named "${editGroupName}" already exists! Please use a different name.`);
        return;
      }

      // Update in state
      setCategoryGroups(prevGroups =>
        prevGroups.map(g =>
          g.id === editingGroup.id ? { ...g, name: editGroupName } : g
        )
      );

      setShowEditGroupModal(false);
      setEditingGroup(null);
      setEditGroupName('');

      // Update in database
      try {
        await window.electronAPI.updateCategoryGroup(editingGroup.id, userId, {
          name: editGroupName
        });

        // Update localStorage unique names
        if (newNameUpper !== oldNameUpper) {
          const updatedUniqueNames = uniqueGroupNames
            .filter(name => name !== oldNameUpper)
            .concat(newNameUpper);
          localStorage.setItem('uniqueGroupNames', JSON.stringify(updatedUniqueNames));
        }

      } catch (dbError) {
        console.error('Error updating in database:', dbError);
      }

    } catch (error) {
      console.error('Error updating category group:', error);
    }
  };
  // Keep this for backward compatibility but mark as deprecated
  const loadCategories = async () => {
    console.warn('⚠️ Deprecated: use loadCategoriesFromDB instead');
    try {
      const result = await window.electronAPI.getCategories(userId);
      if (result.success && result.data) {
        setCategories(result.data);
        setBudgetData(prev => ({
          ...prev,
          categories: result.data
        }));
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const handleAddCategory = (group) => {
    setSelectedGroupForCategory(group);
    setNewCategoryData({
      name: '',
      assigned: 0,
      groupId: group.id
    });
    setShowAddCategoryModal(true);
  };

  const handleEditGroup = (group) => {
    setEditingGroup(group);
    setEditGroupName(group.name);
    setShowEditGroupModal(true);
  };


  const handleDeleteGroup = async (groupId) => {
    if (!confirm('Are you sure you want to delete this group? Any categories in this group will become ungrouped.')) {
      return;
    }

    try {
      setLoading(true);
      console.log('🗑️ Attempting to delete group:', groupId);

      // First, try to delete from database
      const result = await window.electronAPI.deleteCategoryGroup(groupId, userId);
      console.log('📝 Database result:', result);

      if (result && result.success) {
        // Only update UI if database deletion succeeded
        console.log('✅ Database deletion successful, updating UI...');

        // Close edit modal if open
        if (editingGroup && editingGroup.id === groupId) {
          setShowEditGroupModal(false);
          setEditingGroup(null);
          setEditGroupName('');
        }

        // Remove group from state
        setCategoryGroups(prevGroups => prevGroups.filter(g => g.id !== groupId));

        // Update categories that were in this group
        setBudgetData(prev => ({
          ...prev,
          categories: prev.categories.map(cat =>
            cat.groupId === groupId ? { ...cat, groupId: null } : cat
          )
        }));

        alert('✅ Group deleted successfully');
      } else {
        // Database deletion failed
        console.error('❌ Database deletion failed:', result?.error);
        alert('❌ Failed to delete group: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('❌ Error deleting category group:', error);
      alert('❌ Error deleting group: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getCategoriesByGroup = (groupId) => {
    const filtered = budgetData.categories.filter(c => c.groupId === groupId);
    return filtered;
  };

  // ==================== GROUP TOTALS ====================
  const getGroupTotals = (groupId) => {
    const groupCategories = getCategoriesByGroup(groupId);
    // Add this right before your return statement
    console.log('🔍 RENDER - Current categories in state:', budgetData.categories.length);
    console.log('🔍 RENDER - Current groups in state:', categoryGroups.length);
    console.log('🔍 RENDER - Group IDs:', categoryGroups.map(g => g.id));
    return {
      assigned: groupCategories.reduce((sum, cat) => sum + (cat.assigned || 0), 0),
      activity: groupCategories.reduce((sum, cat) => sum + (cat.activity || 0), 0),
      available: groupCategories.reduce((sum, cat) => sum + (cat.available || 0), 0),
      budgeted: groupCategories.reduce((sum, cat) => sum + (cat.assigned || 0), 0),
      spent: groupCategories.reduce((sum, cat) => sum + Math.abs(cat.activity || 0), 0),
      underfunded: groupCategories.reduce((sum, cat) => {
        const targetInfo = calculateTargetProgress(cat);
        return sum + (targetInfo.needed || 0);
      }, 0)
    };
  };

  const getTargetInfo = (category) => {
    return calculateTargetProgress(category);
  };

  return (
    <div style={styles.container}>
      {/* Left side - Budget Table */}
      <div style={styles.budgetTableContainer}>
        {/* Header with Month Selector and Unassigned Funds */}
        <div style={styles.header}>
          <div style={styles.titleSection}>
            <h1 style={styles.title}>ProspertyMap</h1>
            <p style={styles.description}>
              {selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })} budget allocation
            </p>
          </div>
          <div style={{ marginTop: '10px', padding: '10px', background: '#333' }}>
            <button
              onClick={() => {
                console.log('📊 Current budgetData.categories:', budgetData.categories);
                console.log('📊 Current categoryGroups:', categoryGroups);
              }}
              style={{ background: 'orange', color: 'white', padding: '5px 10px', marginRight: '10px' }}
            >
              DEBUG: Show State
            </button>
          </div>

          {/* Ready to Assign Card */}
          <div style={styles.unassignedCard}>
            <div style={styles.unassignedIcon}>💰</div>
            <div style={styles.unassignedContent}>
              <div style={styles.unassignedLabel}>Ready to Assign</div>
              <div style={{
                ...styles.unassignedValue,
                color: budgetSummary.unassigned < 0 ? '#F87171' : 'white'
              }}>
                {formatCurrency(budgetSummary.unassigned)}
              </div>
              <div style={styles.unassignedSubtext}>
                {budgetSummary.unassigned === 0
                  ? "Every dollar has a job! 🎯"
                  : budgetSummary.unassigned < 0
                    ? `Overspent by ${formatCurrency(Math.abs(budgetSummary.unassigned))}`
                    : `Available for ${selectedMonth.toLocaleString('default', { month: 'long' })}`
                }
              </div>
            </div>
          </div>
        </div>

        {/* Month Selector, Add Group Button, and Quick Budget Tools */}
        <div style={styles.controlsRow}>
          <div style={styles.monthSelector}>
            <button
              style={styles.monthNavButton}
              onClick={() => {
                const newDate = new Date(selectedMonth);
                newDate.setMonth(selectedMonth.getMonth() - 1);
                setSelectedMonth(newDate);
              }}
            >
              ◀
            </button>
            <span style={styles.currentMonth}>
              {selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
            <button
              style={styles.monthNavButton}
              onClick={() => {
                const newDate = new Date(selectedMonth);
                newDate.setMonth(selectedMonth.getMonth() + 1);
                setSelectedMonth(newDate);
              }}
            >
              ▶
            </button>
          </div>

          <button
            style={styles.addGroupButton}
            onClick={() => setShowAddGroupModal(true)}
          >
            + Add Category Group
          </button>

          {/* Quick Budget Tools */}
          {budgetSummary.unassigned > 0 && (
            <div style={styles.quickBudgetTools}>
              <button
                onClick={() => handleQuickAssign('underfunded')}
                style={{
                  ...styles.quickBudgetButton,
                  background: '#F59E0B',
                  color: 'white'
                }}
                title="Assign money to underfunded categories"
              >
                🎯 Fund Underfunded (${getTotalUnderfunded().toFixed(0)})
              </button>

              <button
                onClick={() => handleQuickAssign('last-month')}
                style={{
                  ...styles.quickBudgetButton,
                  background: '#3B82F6',
                  color: 'white'
                }}
              >
                📅 Last Month's Amount
              </button>

              <button
                onClick={() => handleQuickAssign('average')}
                style={{
                  ...styles.quickBudgetButton,
                  background: '#8B5CF6',
                  color: 'white'
                }}
              >
                📊 Average Spending
              </button>
            </div>
          )}
        </div>

        {/* Budget Table */}
        <div style={styles.tableContainer}>
          {loading ? (
            <div style={styles.loading}>Loading categories...</div>
          ) : (
            <table style={styles.table}>
              <thead style={styles.tableHead}>
                <tr>
                  <th style={styles.tableHeader}>Category</th>
                  <th style={styles.tableHeader}>Assigned</th>
                  <th style={styles.tableHeader}>Activity</th>
                  <th style={styles.tableHeader}>Available</th>
                  <th style={styles.tableHeader}>Progress</th>
                  <th style={styles.tableHeader}>Goal</th>
                </tr>
              </thead>
              <tbody>
                {categoryGroups.map((group) => {
                  const groupCategories = getCategoriesByGroup(group.id);

                  return (
                    <React.Fragment key={group.id}>
                      {/* Category Group Header */}
                      <tr style={styles.categoryGroupRow}>
                        <td colSpan="6" style={styles.categoryGroupCell}>
                          <div style={styles.groupHeader}>
                            <span style={styles.categoryGroupName}>
                              {group.name}
                            </span>
                            <div style={styles.groupActions}>
                              <button
                                onClick={() => handleAddCategory(group)}
                                style={styles.addCategoryButton}
                                title="Add category to this group"
                              >
                                +
                              </button>
                              <button
                                onClick={() => handleEditGroup(group)}
                                style={styles.editGroupButton}
                                title="Edit group"
                              >
                                ✏️
                              </button>
                              <button
                                onClick={() => handleDeleteGroup(group.id)}
                                style={styles.deleteGroupButton}
                                title="Delete group"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Categories in this group */}
                      {groupCategories.length > 0 ? (
                        <>
                          {groupCategories.map((cat) => {
                            const targetInfo = getTargetInfo(cat);
                            const hasTarget = targetInfo.status !== 'no-target';
                            const isUnderfunded = targetInfo.status === 'partial' || targetInfo.status === 'unfunded';
                            const isEditing = editingCategory === cat.id;

                            if (isEditing) {
                              // Render edit mode
                              return (
                                <tr key={cat.id} style={{ ...styles.categoryRow, background: '#1a3a5a' }}>
                                  <td style={styles.categoryCell}>
                                    <input
                                      type="text"
                                      value={editCategoryData.name}
                                      onChange={(e) => setEditCategoryData({ ...editCategoryData, name: e.target.value })}
                                      onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveCategoryEdit(cat.id);
                                        }
                                      }}
                                      style={styles.editInput}
                                      placeholder="Category name"
                                      autoFocus
                                    />
                                  </td>
                                  <td style={styles.amountCell}>
                                    <input
                                      type="number"
                                      value={editCategoryData.assigned === 0 ? '' : editCategoryData.assigned}
                                      onChange={(e) => {
                                        const value = e.target.value;
                                        if (value === '') {
                                          setEditCategoryData({ ...editCategoryData, assigned: 0 });
                                        } else {
                                          const numValue = parseFloat(value);
                                          if (!isNaN(numValue)) {
                                            setEditCategoryData({ ...editCategoryData, assigned: numValue });
                                          }
                                        }
                                      }}
                                      onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveCategoryEdit(cat.id);
                                        }
                                      }}
                                      style={styles.editInput}
                                      step="0.01"
                                      min="0"
                                      placeholder="0.00"
                                    />
                                  </td>
                                  <td style={styles.amountCell}>
                                    {formatCurrency(cat.activity || 0)}
                                  </td>
                                  <td style={styles.amountCell}>
                                    {formatCurrency(cat.available || 0)}
                                  </td>
                                  <td style={styles.progressCell}>
                                    <select
                                      value={editCategoryData.target_type}
                                      onChange={(e) => setEditCategoryData({ ...editCategoryData, target_type: e.target.value })}
                                      onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveCategoryEdit(cat.id);
                                        }
                                      }}
                                      style={styles.editSelect}
                                    >
                                      <option value="monthly">Monthly</option>
                                      <option value="balance">Balance</option>
                                      <option value="by_date">By Date</option>
                                    </select>
                                    <input
                                      type="number"
                                      value={editCategoryData.target_amount}
                                      onChange={(e) => setEditCategoryData({ ...editCategoryData, target_amount: parseFloat(e.target.value) || 0 })}
                                      onKeyPress={(e) => {
                                        if (e.key === 'Enter') {
                                          handleSaveCategoryEdit(cat.id);
                                        }
                                      }}
                                      style={{ ...styles.editInput, marginTop: '4px' }}
                                      placeholder="Target amount"
                                      step="0.01"
                                      min="0"
                                    />
                                  </td>
                                  <td style={styles.amountCell}>
                                    <div style={styles.editActions}>
                                      <button
                                        onClick={() => handleSaveCategoryEdit(cat.id)}
                                        style={styles.saveEditButton}
                                        title="Save"
                                      >
                                        ✅
                                      </button>
                                      <button
                                        onClick={handleCancelEdit}
                                        style={styles.cancelEditButton}
                                        title="Cancel"
                                      >
                                        ❌
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            }

                            // Render view mode
                            return (
                              <tr key={cat.id} style={styles.categoryRow}>
                                <td style={styles.categoryCell}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={styles.categoryName}>{cat.name}</span>

                                    {/* Add Edit/Delete buttons */}
                                    <div style={styles.categoryActions}>
                                      <button
                                        onClick={() => handleEditCategory(cat)}
                                        style={styles.editCategoryButton}
                                        title="Edit category"
                                      >
                                        ✏️
                                      </button>
                                      <button
                                        onClick={() => handleDeleteCategory(cat.id)}
                                        style={styles.deleteCategoryButton}
                                        title="Delete category"
                                      >
                                        🗑️
                                      </button>
                                    </div>

                                    {/* Goal Link Indicator */}
                                    {cat.linked_goal && (
                                      <span
                                        style={{
                                          ...styles.goalBadge,
                                          background: cat.linked_goal.progress >= 100 ? '#10B98120' : '#F59E0B20',
                                          color: cat.linked_goal.progress >= 100 ? '#10B981' : '#F59E0B'
                                        }}
                                        title={`Goal: ${formatCurrency(cat.linked_goal.target_amount)} - ${cat.linked_goal.progress.toFixed(0)}% complete`}
                                      >
                                        🎯 Goal
                                        {cat.linked_goal.target_type === 'monthly' && ' (Monthly)'}
                                      </span>
                                    )}

                                    {/* Target Indicator */}
                                    {hasTarget && (
                                      <span
                                        style={{
                                          ...styles.targetIndicator,
                                          color: targetInfo.status === 'funded' || targetInfo.status === 'completed'
                                            ? '#10B981'
                                            : targetInfo.status === 'partial' || targetInfo.status === 'in-progress'
                                              ? '#F59E0B'
                                              : '#9CA3AF'
                                        }}
                                        title={
                                          targetInfo.status === 'funded' ? 'Monthly target fully funded' :
                                            targetInfo.status === 'completed' ? 'Goal completed!' :
                                              targetInfo.status === 'partial' ? `$${targetInfo.needed.toFixed(2)} more needed this month` :
                                                targetInfo.status === 'in-progress' ? `${targetInfo.progress.toFixed(0)}% toward goal` :
                                                  'Target not started'
                                        }
                                      >
                                        {targetInfo.status === 'funded' || targetInfo.status === 'completed' ? '✅' : '🎯'}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td style={styles.amountCell}>
                                  {formatCurrency(cat.assigned || 0)}
                                  {isUnderfunded && (
                                    <div style={{ fontSize: '11px', color: '#F59E0B', marginTop: '2px' }}>
                                      Need ${targetInfo.needed.toFixed(0)} more
                                    </div>
                                  )}
                                </td>

                                <td style={{
                                  ...styles.amountCell,
                                  color: (cat.activity || 0) < 0 ? '#F87171' : '#4ADE80'
                                }}>
                                  {formatCurrency(cat.activity || 0)}
                                </td>

                                <td style={{
                                  ...styles.amountCell,
                                  color: (cat.available || 0) < 0 ? '#F87171' : '#4ADE80'
                                }}>
                                  {formatCurrency(cat.available || 0)}
                                  {cat.target_type === 'balance' && targetInfo.progress > 0 && (
                                    <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '2px' }}>
                                      {targetInfo.progress.toFixed(0)}% of goal
                                    </div>
                                  )}
                                </td>

                                <td style={styles.progressCell}>
                                  <div style={styles.progressBarContainer}>
                                    <div
                                      style={{
                                        ...styles.progressBarFill,
                                        width: `${cat.progress || 0}%`,
                                        backgroundColor: cat.progress >= 100 ? '#10B981' : '#3B82F6'
                                      }}
                                    />
                                    <span style={styles.progressText}>
                                      {cat.progress || 0}%
                                    </span>
                                  </div>
                                </td>

                                {/* Goal Progress Column */}
                                <td style={styles.amountCell}>
                                  {cat.linked_goal ? (
                                    <div>
                                      <div style={{ fontSize: '13px', fontWeight: 'bold' }}>
                                        {formatCurrency(cat.linked_goal.current_amount)} / {formatCurrency(cat.linked_goal.target_amount)}
                                      </div>
                                      <div style={{
                                        width: '80px',
                                        height: '4px',
                                        background: '#374151',
                                        borderRadius: '2px',
                                        marginTop: '4px',
                                        overflow: 'hidden'
                                      }}>
                                        <div style={{
                                          width: `${Math.min(cat.linked_goal.progress, 100)}%`,
                                          height: '100%',
                                          background: cat.linked_goal.progress >= 100 ? '#10B981' : '#3B82F6'
                                        }} />
                                      </div>
                                    </div>
                                  ) : (
                                    <span style={{ color: '#6B7280', fontSize: '12px' }}>—</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}

                          {/* Group Total Row */}
                          <tr style={styles.groupTotalRow}>
                            <td style={styles.groupTotalCell}>
                              <strong>{group.name} Total</strong>
                            </td>
                            <td style={styles.groupTotalAmount}>
                              <strong>{formatCurrency(getGroupTotals(group.id).assigned)}</strong>
                            </td>
                            <td style={styles.groupTotalAmount}>
                              <strong style={{ color: getGroupTotals(group.id).activity < 0 ? '#F87171' : '#4ADE80' }}>
                                {formatCurrency(getGroupTotals(group.id).activity)}
                              </strong>
                            </td>
                            <td style={styles.groupTotalAmount}>
                              <strong style={{ color: getGroupTotals(group.id).available < 0 ? '#F87171' : '#4ADE80' }}>
                                {formatCurrency(getGroupTotals(group.id).available)}
                              </strong>
                            </td>
                            <td style={styles.groupTotalCell}>
                              <strong>{formatCurrency(getGroupTotals(group.id).underfunded)} underfunded</strong>
                            </td>
                            <td style={styles.groupTotalCell}>—</td>
                          </tr>
                        </>
                      ) : (
                        <tr style={styles.emptyGroupRow}>
                          <td colSpan="6" style={styles.emptyGroupCell}>
                            No categories in this group
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

                {/* Total Row */}
                <tr style={styles.totalRow}>
                  <td style={styles.totalCell}>Total</td>
                  <td style={styles.totalAmount}>
                    {formatCurrency(budgetData.categories.reduce((sum, cat) => sum + (cat.assigned || 0), 0))}
                  </td>
                  <td style={styles.totalAmount}>
                    {formatCurrency(budgetData.categories.reduce((sum, cat) => sum + (cat.activity || 0), 0))}
                  </td>
                  <td style={styles.totalAmount}>
                    {formatCurrency(budgetData.categories.reduce((sum, cat) => sum + (cat.available || 0), 0))}
                  </td>
                  <td style={styles.totalCell}>—</td>
                  <td style={styles.totalCell}>—</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right side - Summary View */}
      <div style={styles.rightColumn}>
        <SummaryView
          totalAvailable={budgetSummary.totalAvailable}
          totalActivity={budgetSummary.totalActivity}
          totalAssigned={budgetSummary.totalAssigned}
          unassigned={budgetSummary.unassigned}
          categories={budgetData.categories}
          onAutoAssign={handleAutoAssign}
          underfundedTotal={getTotalUnderfunded()}
        />
        <div style={{ color: "#F87171", marginTop: 8 }}>
          Underfunded: {formatCurrency(getTotalUnderfunded())}
        </div>
        <AutoAssignView
          readyToAssign={budgetSummary.unassigned}
          underfundedTotal={getTotalUnderfunded()}
          underfundedCategories={calculateUnderfundedCategories()}
        />

        <FutureMonthsView
          futureAssignments={2340.50}
          nextMonthTarget={5000}
          monthsAhead={1.5}
        />
      </div>

      {/* Modals - Keep existing modal JSX */}
      {showAddIncomeModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddIncomeModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Income</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Amount</label>
              <input
                type="number"
                style={styles.input}
                value={incomeData.amount}
                onChange={(e) => setIncomeData({ ...incomeData, amount: e.target.value })}
                placeholder="0.00"
                step="0.01"
                min="0"
                autoFocus
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date</label>
              <input
                type="date"
                style={styles.input}
                value={incomeData.date}
                onChange={(e) => setIncomeData({ ...incomeData, date: e.target.value })}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Memo (Optional)</label>
              <input
                type="text"
                style={styles.input}
                value={incomeData.memo}
                onChange={(e) => setIncomeData({ ...incomeData, memo: e.target.value })}
                placeholder="e.g., Paycheck, Gift, etc."
              />
            </div>
            <div style={styles.modalActions}>
              <button
                style={styles.saveButton}
                onClick={handleAddIncome}
              >
                Add Income
              </button>
              <button
                style={styles.cancelButton}
                onClick={() => setShowAddIncomeModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showRecordPaymentModal && (
        <div style={styles.modalOverlay} onClick={() => setShowRecordPaymentModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Record Payment</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Amount</label>
              <input
                type="number"
                style={styles.input}
                value={paymentData.amount}
                onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })}
                placeholder="0.00"
                step="0.01"
                min="0"
                autoFocus
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Category</label>
              <select
                style={styles.select}
                value={paymentData.categoryId}
                onChange={(e) => setPaymentData({ ...paymentData, categoryId: e.target.value })}
              >
                <option value="">Select a category</option>
                {budgetData.categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({formatCurrency(cat.available)} available)
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Payee</label>
              <input
                type="text"
                style={styles.input}
                value={paymentData.payee}
                onChange={(e) => setPaymentData({ ...paymentData, payee: e.target.value })}
                placeholder="Who did you pay?"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date</label>
              <input
                type="date"
                style={styles.input}
                value={paymentData.date}
                onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Memo (Optional)</label>
              <input
                type="text"
                style={styles.input}
                value={paymentData.memo}
                onChange={(e) => setPaymentData({ ...paymentData, memo: e.target.value })}
                placeholder="Additional notes"
              />
            </div>
            <div style={styles.modalActions}>
              <button
                style={styles.saveButton}
                onClick={handleRecordPayment}
              >
                Record Payment
              </button>
              <button
                style={styles.cancelButton}
                onClick={() => setShowRecordPaymentModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddCategoryModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddCategoryModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Category to {selectedGroupForCategory?.name}</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Category Name</label>
              <input
                type="text"
                style={styles.input}
                value={newCategoryData.name}
                onChange={(e) => setNewCategoryData({ ...newCategoryData, name: e.target.value })}
                placeholder="e.g., Rent, Groceries, etc."
                autoFocus
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Initial Assigned Amount</label>
              <input
                type="number"
                style={styles.input}
                value={newCategoryData.assigned === 0 ? '' : newCategoryData.assigned}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setNewCategoryData({ ...newCategoryData, assigned: 0 });
                  } else {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                      setNewCategoryData({ ...newCategoryData, assigned: numValue });
                    }
                  }
                }}
                placeholder="0"
                min="0"
                step="1"
              />
            </div>
            <div style={styles.modalActions}>
              <button
                style={styles.saveButton}
                onClick={handleCreateCategory}
              >
                Create Category
              </button>
              <button
                style={styles.cancelButton}
                onClick={() => {
                  setShowAddCategoryModal(false);
                  setSelectedGroupForCategory(null);
                  setNewCategoryData({ name: '', assigned: 0, groupId: null });
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showEditGroupModal && (
        <div style={styles.modalOverlay} onClick={() => setShowEditGroupModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Edit Category Group</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Group Name</label>
              <input
                type="text"
                style={styles.input}
                value={editGroupName}
                onChange={(e) => setEditGroupName(e.target.value)}
                placeholder="Enter group name"
                autoFocus
              />
            </div>
            <div style={styles.modalActions}>
              <button
                style={styles.saveButton}
                onClick={handleUpdateGroup}
              >
                Update Group
              </button>
              <button
                style={styles.cancelButton}
                onClick={() => {
                  setShowEditGroupModal(false);
                  setEditingGroup(null);
                  setEditGroupName('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showAddGroupModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddGroupModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Category Group</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Group Name</label>
              <input
                type="text"
                style={styles.input}
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g., Fixed Expenses, Savings, etc."
                autoFocus
              />
            </div>
            <div style={styles.modalActions}>
              <button
                style={styles.saveButton}
                onClick={handleCreateGroup}
              >
                Create Group
              </button>
              <button
                style={styles.cancelButton}
                onClick={() => {
                  setShowAddGroupModal(false);
                  setNewGroupName('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {showMoveMoneyModal && (
        <div style={styles.modalOverlay} onClick={() => setShowMoveMoneyModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Move Money</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Amount</label>
              <input
                type="number"
                style={styles.input}
                value={moveMoneyData.amount}
                onChange={(e) => setMoveMoneyData({ ...moveMoneyData, amount: e.target.value })}
                placeholder="0.00"
                step="0.01"
                min="0"
                autoFocus
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>From Category</label>
              <select
                style={styles.select}
                value={moveMoneyData.fromCategoryId}
                onChange={(e) => setMoveMoneyData({ ...moveMoneyData, fromCategoryId: e.target.value })}
              >
                <option value="">Select source category</option>
                {budgetData.categories
                  .filter(cat => cat.id !== moveMoneyData.toCategoryId)
                  .map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name} ({formatCurrency(cat.available)} available)
                    </option>
                  ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>To Category</label>
              <select
                style={styles.select}
                value={moveMoneyData.toCategoryId}
                onChange={(e) => setMoveMoneyData({ ...moveMoneyData, toCategoryId: e.target.value })}
              >
                <option value="">Select destination category</option>
                {budgetData.categories
                  .filter(cat => cat.id !== moveMoneyData.fromCategoryId)
                  .map(cat => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
              </select>
            </div>
            <div style={styles.modalActions}>
              <button
                style={styles.saveButton}
                onClick={handleMoveMoney}
              >
                Move Money
              </button>
              <button
                style={styles.cancelButton}
                onClick={() => setShowMoveMoneyModal(false)}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    display: 'flex',
    gap: '2rem',
    width: '100%'
  },
  budgetTableContainer: {
    flex: 1,
    minWidth: 0
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1.5rem',
    gap: '2rem'
  },
  titleSection: {
    flex: 1
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
    color: 'white'
  },
  description: {
    fontSize: '1rem',
    color: '#9CA3AF'
  },
  unassignedCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    padding: '1rem 1.5rem',
    background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
    borderRadius: '1rem',
    boxShadow: '0 4px 20px rgba(245, 158, 11, 0.3)',
    minWidth: '300px'
  },
  unassignedIcon: {
    fontSize: '2.5rem'
  },
  unassignedContent: {
    flex: 1
  },
  unassignedLabel: {
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'rgba(255,255,255,0.8)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.25rem'
  },
  unassignedValue: {
    fontSize: '1.75rem',
    fontWeight: 'bold',
    color: 'white',
    lineHeight: '1.2'
  },
  unassignedSubtext: {
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.9)',
    marginTop: '0.25rem'
  },
  assignButton: {
    padding: '0.5rem 1rem',
    background: 'white',
    color: '#D97706',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    whiteSpace: 'nowrap'
  },
  controlsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    gap: '1rem',
    flexWrap: 'wrap'
  },
  monthSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  monthNavButton: {
    padding: '0.5rem 1rem',
    background: '#0f2e1c',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    cursor: 'pointer'
  },
  currentMonth: {
    fontSize: '1.1rem',
    fontWeight: '500',
    color: 'white'
  },
  addGroupButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.5rem 1rem',
    background: 'transparent',
    color: '#10B981',
    border: '1px solid #10B981',
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      background: '#10B981',
      color: 'white'
    }
  },
  quickBudgetTools: {
    display: 'flex',
    gap: '0.5rem',
    marginLeft: 'auto'
  },
  quickBudgetButton: {
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.85rem',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
    }
  },
  tableContainer: {
    background: '#0047AB',
    borderRadius: '0.75rem',
    overflow: 'hidden',
    border: '1px solid #374151'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  tableHead: {
    background: '#0F2B7A'
  },
  tableHeader: {
    padding: '1rem',
    textAlign: 'left',
    color: '#FFFFFF',
    fontWeight: '500',
    fontSize: '0.875rem',
    borderBottom: '2px solid #374151'
  },
  categoryGroupRow: {
    background: '#0A2472',
    borderTop: '1px solid #000000',
    borderBottom: '1px solid #000000'
  },
  categoryGroupCell: {
    padding: '0.75rem 1rem'
  },
  groupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  categoryGroupName: {
    color: '#ffffff',
    fontSize: '0.9rem',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  groupActions: {
    display: 'flex',
    gap: '0.5rem'
  },
  addCategoryButton: {
    background: 'none',
    border: 'none',
    color: '#ffffff',
    fontSize: '1.2rem',
    fontWeight: 'bold',
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
    ':hover': {
      background: 'rgba(255, 255, 255, 0.2)',
      transform: 'scale(1.1)'
    }
  },
  editGroupButton: {
    background: 'none',
    border: 'none',
    color: '#ffffff',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
    ':hover': {
      background: 'rgba(255, 255, 255, 0.2)',
      transform: 'scale(1.1)'
    }
  },
  deleteGroupButton: {
    background: 'none',
    border: 'none',
    color: '#ffffff',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '2px 8px',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
    ':hover': {
      background: 'rgba(255, 255, 255, 0.2)',
      transform: 'scale(1.1)'
    }
  },
  categoryRow: {
    borderBottom: '1px solid #000000'
  },
  categoryCell: {
    padding: '0.75rem 1rem',
    color: '#F3F4F6'
  },
  categoryName: {
    fontSize: '0.95rem'
  },
  amountCell: {
    padding: '0.75rem 1rem',
    color: 'white',
    fontWeight: '500'
  },
  progressCell: {
    padding: '0.75rem 1rem',
    minWidth: '100px'
  },
  progressBarContainer: {
    position: 'relative',
    height: '20px',
    background: '#374151',
    borderRadius: '10px',
    overflow: 'hidden'
  },
  progressBarFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: '100%',
    transition: 'width 0.3s ease'
  },
  progressText: {
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    fontSize: '0.75rem',
    fontWeight: '600',
    color: 'white',
    zIndex: 1
  },
  emptyGroupRow: {
    background: '#0F2B7A'
  },
  emptyGroupCell: {
    padding: '1rem',
    textAlign: 'center',
    color: '#6B7280',
    fontStyle: 'italic'
  },
  totalRow: {
    background: '#0F2B7A',
    borderTop: '2px solid #000000'
  },
  totalCell: {
    padding: '1rem',
    color: 'white',
    fontWeight: '600'
  },
  totalAmount: {
    padding: '1rem',
    color: '#FFFFFF',
    fontWeight: '600'
  },
  rightColumn: {
    flexShrink: 0,
    width: '400px',
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem'
  },
  loading: {
    padding: '3rem',
    textAlign: 'center',
    color: '#9CA3AF'
  },
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
    background: '#0047AB',
    padding: '2rem',
    borderRadius: '1rem',
    width: '90%',
    maxWidth: '400px',
    maxHeight: '80vh',
    overflowY: 'auto',
    border: '1px solid #374151'
  },
  modalTitle: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: 'white'
  },
  formGroup: {
    marginBottom: '1.5rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    fontWeight: '500'
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#0047AB',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    transition: 'all 0.2s ease'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#0047AB',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    transition: 'all 0.2s ease'
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
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(59, 130, 246, 0.3)'
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'not-allowed'
    }
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
    cursor: 'pointer',
    transition: 'all 0.2s ease',
    ':hover': {
      background: '#6B7280'
    }
  },
  deleteSection: {
    marginTop: '2rem',
    borderTop: '1px solid #374151',
    paddingTop: '1.5rem'
  },
  deleteDivider: {
    marginBottom: '1rem'
  },
  deleteButton: {
    width: '100%',
    padding: '0.75rem',
    background: 'transparent',
    color: '#EF4444',
    border: '1px solid #EF4444',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '500',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.5rem',
    transition: 'all 0.2s ease',
    ':hover': {
      background: '#EF4444',
      color: 'white'
    }
  },
  deleteWarning: {
    marginTop: '0.75rem',
    fontSize: '0.8rem',
    color: '#9CA3AF',
    textAlign: 'center'
  },
  targetIndicator: {
    fontSize: '1rem',
    cursor: 'help',
    width: '20px',
    display: 'inline-block'
  },
  goalBadge: {
    fontSize: '0.75rem',
    padding: '2px 6px',
    borderRadius: '4px',
    fontWeight: '500'
  },
  groupTotalRow: {
    background: '#0A2472',
    borderTop: '2px solid #000000',
    borderBottom: '2px solid #000000',
    fontWeight: 'bold'
  },
  groupTotalCell: {
    padding: '0.75rem 1rem',
    color: 'white',
    fontSize: '0.9rem'
  },
  groupTotalAmount: {
    padding: '0.75rem 1rem',
    color: 'white',
    fontSize: '0.9rem',
    fontWeight: 'bold'
  },
  // New styles for category editing
  categoryActions: {
    display: 'flex',
    gap: '4px',
    marginLeft: '4px'
  },
  editCategoryButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '0.9rem',
    cursor: 'pointer',
    padding: '2px 4px',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
    ':hover': {
      background: 'rgba(255, 255, 255, 0.1)',
      color: 'white'
    }
  },
  deleteCategoryButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '0.9rem',
    cursor: 'pointer',
    padding: '2px 4px',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
    ':hover': {
      background: 'rgba(239, 68, 68, 0.2)',
      color: '#EF4444'
    }
  },
  editInput: {
    width: '100%',
    padding: '4px 8px',
    background: '#0047AB',
    border: '1px solid #3B82F6',
    borderRadius: '4px',
    color: 'white',
    fontSize: '0.9rem'
  },
  editSelect: {
    width: '100%',
    padding: '4px 8px',
    background: '#0047AB',
    border: '1px solid #3B82F6',
    borderRadius: '4px',
    color: 'white',
    fontSize: '0.9rem',
    marginBottom: '4px'
  },
  editActions: {
    display: 'flex',
    gap: '8px',
    justifyContent: 'center'
  },
  saveEditButton: {
    background: 'none',
    border: 'none',
    fontSize: '1.2rem',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
    ':hover': {
      background: 'rgba(16, 185, 129, 0.2)',
      transform: 'scale(1.1)'
    }
  },
  cancelEditButton: {
    background: 'none',
    border: 'none',
    fontSize: '1.2rem',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '4px',
    transition: 'all 0.2s ease',
    ':hover': {
      background: 'rgba(239, 68, 68, 0.2)',
      transform: 'scale(1.1)'
    }
  }
};

export default PropertyMapView;