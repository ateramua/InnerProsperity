// src/views/PropertyMapView.jsx
import React, { useState, useEffect, useRef } from 'react';
import SummaryView from './SummaryView';
import AutoAssignView from './AutoAssignView';
import FutureMonthsView from './FutureMonthsView';
import useRealtimeUpdates from '../hooks/useRealtimeUpdates';
import BudgetEngine from "../shared/budgetEngine.mjs";
import Button from '../components/ui/Button';
import CategoryTargetModal from '../components/CategoryTargetModal';
import PM from '../constants/pmTheme.js';
import budgetMonthUtils from '../utils/budgetMonthUtils.js';

const { formatBudgetMonthKey, roundMoney, monthKeyToLocalDate } = budgetMonthUtils;

const PropertyMapView = () => {
  // ==================== STATE DECLARATIONS ====================
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
  const selectedMonthRef = useRef(selectedMonth);
  useEffect(() => {
    selectedMonthRef.current = selectedMonth;
  }, [selectedMonth]);
  const [newCategoryData, setNewCategoryData] = useState({
    name: '',
    assigned: 0,
    groupId: null
  });

  const [budgetEngine] = useState(() => new BudgetEngine());
  const hasLoadedCategories = useRef(false);
  const [showTargetModal, setShowTargetModal] = useState(false);
  const [selectedCategoryForTarget, setSelectedCategoryForTarget] = useState(null);


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
  const [userId, setUserId] = useState(2);

  const [totalCashInAccounts, setTotalCashInAccounts] = useState(0);
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);
  const [showArchivedModal, setShowArchivedModal] = useState(false);
  const [archivedCategories, setArchivedCategories] = useState([]);
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const waitForElectronAPI = async (requiredMethods = [], timeout = 5000) => {
    const startTime = Date.now();
    while (Date.now() - startTime < timeout) {
      if (window.electronAPI && requiredMethods.every(method => typeof window.electronAPI[method] === 'function')) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    return false;
  };

  const ensureElectronAPI = async () => {
    return waitForElectronAPI([
      'getCurrentUser',
      'getAccountsSummary',
      'getCategories',
      'getCategoryGroups',
      'getArchivedCategories'
    ], 8000);
  };

  const [budgetSummary, setBudgetSummary] = useState({
    totalAvailable: 0,
    totalActivity: 0,
    totalAssigned: 0,
    unassigned: 0
  });

  const [budgetData, setBudgetData] = useState({
    categories: []
  });

  // ==================== CREDIT CARD PAYMENT HELPER ====================
  
  // Move money from spending category to credit card payment category
  const moveMoneyForCreditCardTransaction = async (amount, spendingCategoryId, creditCardAccountName, budgetMonthKeyOpt) => {
    try {
      console.log(`🔄 Moving $${amount} from category ${spendingCategoryId} to credit card payment category for ${creditCardAccountName}`);
      
      const groupsResult = await window.electronAPI.getCategoryGroups(userId);
      if (!groupsResult?.success) {
        console.error('Failed to get category groups');
        return false;
      }
      
      const paymentGroup = groupsResult.data.find(g => 
        g.name === 'Credit Card Payments' || g.name.toLowerCase() === 'credit card payments'
      );
      
      if (!paymentGroup) {
        console.error('Credit Card Payments group not found');
        return false;
      }
      
      const categoriesResult = await window.electronAPI.getCategories(userId);
      if (!categoriesResult?.success) {
        console.error('Failed to get categories');
        return false;
      }
      
      const paymentCategory = categoriesResult.data.find(cat => 
        cat.group_id === paymentGroup.id && 
        cat.name.toLowerCase() === creditCardAccountName.toLowerCase()
      );
      
      if (!paymentCategory) {
        console.error(`Payment category for "${creditCardAccountName}" not found`);
        return false;
      }
      
      const spendingCategory = categoriesResult.data.find(cat => cat.id === spendingCategoryId);
      if (!spendingCategory) {
        console.error(`Spending category ${spendingCategoryId} not found`);
        return false;
      }
      
      const newSpendingAssigned = (spendingCategory.assigned || 0) - amount;
      const newSpendingAvailable = (spendingCategory.available || 0) - amount;
      
      const ccMonth = budgetMonthKeyOpt || formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);

      await window.electronAPI.updateCategory(spendingCategoryId, {
        assigned: newSpendingAssigned,
        available: newSpendingAvailable,
        budget_month: ccMonth
      });

      const newPaymentAssigned = (paymentCategory.assigned || 0) + amount;
      const newPaymentAvailable = (paymentCategory.available || 0) + amount;

      await window.electronAPI.updateCategory(paymentCategory.id, {
        assigned: newPaymentAssigned,
        available: newPaymentAvailable,
        budget_month: ccMonth
      });
      
      console.log(`✅ Successfully moved $${amount} from "${spendingCategory.name}" to "${paymentCategory.name}"`);
      
      await loadCategoriesFromDB(0, { monthDate: monthKeyToLocalDate(ccMonth) });
      calculateReadyToAssign();
      
      return true;
    } catch (error) {
      console.error('Error moving money for credit card transaction:', error);
      return false;
    }
  };

  useEffect(() => {
    window.moveMoneyForCreditCardTransaction = moveMoneyForCreditCardTransaction;
    return () => {
      delete window.moveMoneyForCreditCardTransaction;
    };
  }, [userId, budgetData.categories]);

  // ==================== DEBUGGING & EFFECTS ====================
  useEffect(() => {
    console.log('🔍 COMPONENT MOUNTED - checking electronAPI:', {
      hasGetCategories: !!window.electronAPI?.getCategories,
      hasGetCategoryGroups: !!window.electronAPI?.getCategoryGroups,
      userId: userId
    });
  }, []);

  useEffect(() => {
    console.log('📊 budgetData.categories UPDATED:', {
      count: budgetData.categories.length,
      categories: budgetData.categories.map(c => ({
        id: c.id,
        name: c.name,
        assigned: c.assigned,
        archived: c.archived
      }))
    });
  }, [budgetData.categories]);

  // ==================== HELPER FUNCTIONS ====================
  const toggleGroupCollapse = (groupId) => {
    setCollapsedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const calculateTargetProgress = (category) => {
    if (!category) {
      return { progress: null, status: 'no-target', needed: 0 };
    }

    if (!category.target_amount || category.target_amount === 0) {
      return { progress: null, status: 'no-target', needed: 0 };
    }

    const currentAmount = category.available || 0;

    switch (category.target_type) {
      case 'monthly':
        const progress = (currentAmount / category.target_amount) * 100;
        const needed = Math.max(0, category.target_amount - currentAmount);
        return {
          progress,
          status: progress >= 100 ? 'funded' : progress > 0 ? 'partial' : 'unfunded',
          needed,
        };
      case 'monthly_debt_payment':
        const debtProgress = (currentAmount / category.target_amount) * 100;
        const debtNeeded = Math.max(0, category.target_amount - currentAmount);
        return {
          progress: debtProgress,
          status: debtProgress >= 100 ? 'funded' : debtProgress > 0 ? 'partial' : 'unfunded',
          needed: debtNeeded,
        };
      default:
        return { progress: null, status: 'no-target', needed: 0 };
    }
  };

  const calculateUnderfundedCategories = () => {
    if (!budgetData.categories || !Array.isArray(budgetData.categories)) {
      return [];
    }

    return budgetData.categories.filter(cat => {
      if (!cat || cat.archived) return false;
      const targetInfo = calculateTargetProgress(cat);
      return targetInfo.status === 'partial' ||
        targetInfo.status === 'unfunded' ||
        targetInfo.status === 'in-progress';
    });
  };

  const getTotalUnderfunded = () => {
    if (!budgetData.categories || !Array.isArray(budgetData.categories)) {
      return 0;
    }

    let total = 0;
    budgetData.categories.forEach(cat => {
      if (!cat || cat.archived) return;
      const targetInfo = calculateTargetProgress(cat);
      if (targetInfo && targetInfo.needed && targetInfo.needed > 0) {
        total += targetInfo.needed;
      }
    });
    return total;
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getTargetInfo = (category) => {
    return calculateTargetProgress(category);
  };
  
  const calculateAvailable = (category, previousMonthAvailable = 0) => {
    const assigned = Number(category.assigned) || 0;
    const activity = Number(category.activity) || 0;
    let available = previousMonthAvailable + assigned - activity;
    return available;
  };
  
  const updateCategoryAvailable = async (category, previousMonthAvailable = 0) => {
    const newAvailable = calculateAvailable(category, previousMonthAvailable);

    if (newAvailable !== category.available) {
      setBudgetData(prev => ({
        ...prev,
        categories: prev.categories.map(cat =>
          cat.id === category.id
            ? { ...cat, available: newAvailable }
            : cat
        )
      }));

      if (typeof window !== 'undefined' && window.electronAPI?.getBudgetMonthSnapshot) {
        return newAvailable;
      }

      try {
        const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
        const assignedVal = Number(category.assigned) || 0;
        await window.electronAPI.updateCategory(category.id, {
          assigned: assignedVal,
          available: newAvailable,
          budget_month: monthKey
        });
        console.log(`✅ Updated available for ${category.name}: ${formatCurrency(newAvailable)}`);
      } catch (error) {
        console.error(`❌ Failed to update available for ${category.id}:`, error);
      }
    }

    return newAvailable;
  };

  const updateAllAvailable = async () => {
    console.log('🔄 Recalculating all available amounts...');

    for (const category of budgetData.categories) {
      const previousAvailable = category.previous_available || 0;
      await updateCategoryAvailable(category, previousAvailable);
    }

    console.log('✅ Finished updating available amounts');
    calculateReadyToAssign();
  };

  const getPreviousMonthAvailable = async (categoryId, previousMonth) => {
    try {
      const result = await window.electronAPI.getCategoryHistory(categoryId, previousMonth);
      const payload = result?.data ?? result;
      return payload?.available || 0;
    } catch (error) {
      console.error('Error getting previous month available:', error);
      return 0;
    }
  };

  // ==================== READY TO ASSIGN CALCULATION ====================
  const calculateReadyToAssign = () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 CALCULATING READY TO ASSIGN (cash − Σ category available)');

    const activeCategories = budgetData.categories.filter(cat => !cat.archived);

    const sumCategoryAvailable = activeCategories.reduce(
      (sum, cat) => sum + (Number(cat.available) || 0),
      0
    );
    const cashInAccounts = totalCashInAccounts;
    // YNAB-style: every dollar in on-budget cash accounts is either Ready to Assign or in a category envelope.
    const readyToAssign = roundMoney(cashInAccounts - sumCategoryAvailable);

    const totalAssigned = activeCategories.reduce((sum, cat) => sum + (Number(cat.assigned) || 0), 0);
    const totalActivity = activeCategories.reduce((sum, cat) => sum + (Number(cat.activity) || 0), 0);

    console.log(`Total Cash (budget cash accounts): ${cashInAccounts}`);
    console.log(`Σ Category Available: ${sumCategoryAvailable}`);
    console.log(`Ready to Assign: ${readyToAssign}`);
    console.log(`(reference) Total Assigned: ${totalAssigned}, Total Activity: ${totalActivity}`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    setBudgetSummary({
      totalAvailable: readyToAssign,
      totalActivity: totalActivity,
      totalAssigned: totalAssigned,
      unassigned: readyToAssign
    });
  };

  const updateAllProgress = () => {
    setBudgetData(prev => ({
      ...prev,
      categories: prev.categories.map(cat => ({
        ...cat,
        progress: calculateTargetProgress(cat).progress || 0
      }))
    }));
  };
  
  useEffect(() => {
    if (budgetData.categories.length === 0) return;
    if (typeof window !== 'undefined' && window.electronAPI?.getBudgetMonthSnapshot) {
      return;
    }
    updateAllAvailable();
  }, [budgetData.categories.map(cat => `${cat.id}:${cat.assigned}:${cat.activity}`).join(',')]);

  // ==================== DATABASE OPERATIONS ====================
  const loadCategoryGroups = async () => {
    if (!window.electronAPI?.getCategoryGroups) {
      console.error('❌ electronAPI.getCategoryGroups is not available!');
      return;
    }

    try {
      setLoading(true);
      const result = await window.electronAPI.getCategoryGroups(userId);
      if (result.success && result.data && result.data.length > 0) {
        setCategoryGroups(result.data);
      } else {
        setCategoryGroups([]);
      }
    } catch (error) {
      console.error('Error loading category groups:', error);
      setCategoryGroups([]);
    } finally {
      setLoading(false);
    }
  };

  const loadCategoriesFromDB = async (retryCount = 0, opts = {}) => {
    if (!window.electronAPI?.getCategories) {
      console.error('❌ electronAPI.getCategories is not available!');
      return;
    }
    if (!userId) {
      console.warn('⚠️ No userId provided to loadCategoriesFromDB');
      return;
    }

    const monthDate = opts.monthDate ?? selectedMonthRef.current ?? selectedMonth;
    const monthKey = formatBudgetMonthKey(monthDate);

    const mapCategoryRow = (cat) => ({
      id: cat.id,
      name: cat.name,
      assigned: Number(cat.assigned) || 0,
      activity: Number(cat.activity) || 0,
      available: Number(cat.available) || 0,
      previous_available: Number(cat.previous_available) || 0,
      groupId: Number(cat.group_id),
      user_id: cat.user_id,
      priority: cat.priority || 2,
      target_amount: cat.target_amount,
      target_type: cat.target_type || 'monthly',
      target_date: cat.target_date,
      progress: 0,
      last_month_assigned: cat.last_month_assigned || 0,
      average_spending: cat.average_spending || 0,
      archived: cat.archived === 1,
      is_hidden: cat.is_hidden === 1 || cat.hidden === 1,
      original_group_id: cat.original_group_id || cat.group_id,
      is_loan_payment_category: cat.is_loan_payment_category === 1
    });

    try {
      setLoading(true);

      if (window.electronAPI.getBudgetMonthSnapshot) {
        const snap = await window.electronAPI.getBudgetMonthSnapshot(userId, monthKey);
        if (snap && snap.success && snap.data && Array.isArray(snap.data.categories)) {
          const dbCategories = snap.data.categories.map(mapCategoryRow);
          setBudgetData(prev => ({
            ...prev,
            categories: dbCategories
          }));
          setCategories(dbCategories);
          setTimeout(() => {
            loadCategoryGroups();
          }, 100);
          return;
        }
        console.warn('⚠️ getBudgetMonthSnapshot failed or empty; falling back to getCategories', snap?.error);
      }

      const result = await window.electronAPI.getCategories(userId);

      if (result && result.success && result.data) {
        const dbCategories = result.data.map(mapCategoryRow);

        setBudgetData(prev => ({
          ...prev,
          categories: dbCategories
        }));
        setCategories(dbCategories);

        setTimeout(() => {
          loadCategoryGroups();
        }, 100);
      }
    } catch (error) {
      console.error('❌ Error loading categories:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadArchivedCategories = async () => {
    if (!window.electronAPI?.getArchivedCategories) {
      console.error('❌ electronAPI.getArchivedCategories is not available!');
      setArchivedCategories([]);
      return;
    }

    try {
      const result = await window.electronAPI.getArchivedCategories(userId);
      if (result && result.success) {
        setArchivedCategories(result.data);
      } else {
        setArchivedCategories([]);
      }
    } catch (error) {
      console.error('Error loading archived categories:', error);
      setArchivedCategories([]);
    }
  };

  // ==================== CATEGORY & GROUP HANDLERS ====================
  const handleArchiveCategory = async (category) => {
    if (!confirm(`Archive "${category.name}"?\n\nArchived categories are removed from your budget but can be restored later. Transaction history is preserved.`)) {
      return;
    }
    try {
      const result = await window.electronAPI.archiveCategory(category.id, userId);
      if (result && result.success) {
        setBudgetData(prev => ({
          ...prev,
          categories: prev.categories.filter(cat => cat.id !== category.id)
        }));
        await loadArchivedCategories();
        alert(`✅ Category "${category.name}" has been archived.`);
      } else {
        alert('❌ Failed to archive category: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error archiving category:', error);
      alert('Error: ' + error.message);
    }
  };

  const handleRestoreCategory = async (category) => {
    if (!confirm(`Restore "${category.name}" to your budget?\n\nIt will be placed back in its original group.`)) {
      return;
    }
    try {
      const result = await window.electronAPI.restoreCategory(category.id, userId);
      if (result && result.success) {
        await loadCategoriesFromDB();
        await loadCategoryGroups();
        await loadArchivedCategories();
        alert(`✅ Category "${category.name}" has been restored.`);
      } else {
        alert('❌ Failed to restore category: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error restoring category:', error);
      alert('Error: ' + error.message);
    }
  };

  const handleEditCategory = (category) => {
    setEditingCategory(category.id);
    setEditCategoryData({
      name: category.name,
      assigned: category.assigned || 0,
      target_amount: category.target_amount || 0,
      target_type: category.target_type || 'monthly'
    });
  };

  const getGoalTooltip = (category) => {
    const targetInfo = calculateTargetProgress(category);
    switch (targetInfo.status) {
      case 'funded':
        return `Monthly goal met! Assigned ${formatCurrency(category.assigned)} of ${formatCurrency(category.target_amount)}`;
      case 'completed':
        return `Goal achieved! ${formatCurrency(category.available)} of ${formatCurrency(category.target_amount)}`;
      case 'partial':
        return `Partially funded. Need ${formatCurrency(targetInfo.needed)} more to reach monthly goal`;
      case 'unfunded':
        return `No funds assigned yet. Need ${formatCurrency(targetInfo.needed)} to reach monthly goal`;
      case 'in-progress':
        return `Progress: ${Math.round(targetInfo.progress)}% toward ${formatCurrency(category.target_amount)}`;
      default:
        return 'Click 🎯 to set a goal';
    }
  };

  const getProgressColor = (status) => {
    switch (status) {
      case 'funded':
      case 'completed':
        return '#4ADE80';
      case 'partial':
      case 'in-progress':
        return '#F59E0B';
      case 'unfunded':
      case 'not-started':
        return '#EF4444';
      default:
        return '#93C5FD';
    }
  };

  const handleSaveCategoryEdit = async (categoryId) => {
    if (!editCategoryData.name.trim()) {
      alert('Please enter a category name');
      return;
    }

    try {
      const updates = {
        name: editCategoryData.name.trim(),
        assigned: Number(editCategoryData.assigned) || 0,
        target_amount: Number(editCategoryData.target_amount) || 0,
        target_type: editCategoryData.target_type,
        budget_month: formatBudgetMonthKey(selectedMonthRef.current || selectedMonth)
      };

      const result = await window.electronAPI.updateCategory(categoryId, updates);

      if (!result.success) {
        alert('Failed to update category: ' + (result.error || 'Unknown error'));
        return;
      }

      setBudgetData(prev => ({
        ...prev,
        categories: prev.categories.map(cat =>
          cat.id === categoryId
            ? {
              ...cat,
              name: updates.name,
              assigned: updates.assigned,
              target_amount: updates.target_amount,
              target_type: updates.target_type,
              available: updates.assigned - (cat.activity || 0)
            }
            : cat
        )
      }));

      setEditingCategory(null);
      setEditCategoryData({
        name: '',
        assigned: 0,
        target_amount: 0,
        target_type: 'monthly'
      });

      await loadCategoriesFromDB();
      alert('✅ Category updated successfully!');
    } catch (error) {
      console.error('❌ Error saving category:', error);
      alert('Error: ' + error.message);
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
      const deleteResult = await window.electronAPI.deleteCategory(categoryId);
      if (deleteResult && deleteResult.success) {
        setBudgetData(prev => ({
          ...prev,
          categories: prev.categories.filter(cat => cat.id !== categoryId)
        }));
        alert('✅ Category deleted successfully');
      } else {
        await loadCategoriesFromDB();
        alert('❌ Failed to delete category: ' + (deleteResult?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('❌ Error in delete category:', error);
      alert('❌ Error deleting category: ' + error.message);
    }
  };

  const handleCreateCategory = async () => {
    if (!newCategoryData.name.trim()) {
      alert('Please enter a category name');
      return;
    }
    if (!newCategoryData.groupId) {
      alert('Please select a category group before creating a category');
      return;
    }
    try {
      setLoading(true);
      const groupExists = categoryGroups.some(g => g.id === newCategoryData.groupId);
      if (!groupExists) {
        alert('Selected group no longer exists. Please select another group.');
        setLoading(false);
        return;
      }
      const categoryData = {
        name: newCategoryData.name.trim(),
        assigned: 0,
        group_id: newCategoryData.groupId,
        user_id: userId,
        target_amount: newCategoryData.assigned || 0,
        target_type: 'monthly',
        target_date: null,
        priority: 2,
        archived: 0
      };
      const result = await window.electronAPI.createCategory(categoryData);
      if (result.success && result.data) {
        const initialAssigned = newCategoryData.assigned || 0;
        const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
        if (initialAssigned > 0) {
          const assignResult = await window.electronAPI.updateCategory(result.data.id, {
            assigned: initialAssigned,
            budget_month: monthKey
          });
          if (!assignResult?.success) {
            alert('⚠️ Category created but initial assign failed: ' + (assignResult?.error || 'Unknown error'));
          }
        }
        const newCategory = {
          id: result.data.id,
          name: categoryData.name,
          assigned: initialAssigned,
          activity: 0,
          available: initialAssigned,
          groupId: newCategoryData.groupId,
          user_id: userId,
          priority: 2,
          target_amount: categoryData.target_amount || 0,
          target_type: 'monthly',
          target_date: null,
          progress: (initialAssigned || 0) > 0 ? 100 : 0,
          last_month_assigned: 0,
          average_spending: 0,
          archived: false
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
        await loadCategoriesFromDB(0, { monthDate: selectedMonthRef.current || selectedMonth });
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

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      alert('Please enter a group name');
      return;
    }
    try {
      setLoading(true);
      const groupsResult = await window.electronAPI.getCategoryGroups(userId);
      if (groupsResult.success && groupsResult.data) {
        const existingGroup = groupsResult.data.find(
          group => group.name.toLowerCase() === newGroupName.trim().toLowerCase()
        );
        if (existingGroup) {
          alert(`❌ A group named "${newGroupName}" already exists in the database! Please use a different name.`);
          setLoading(false);
          return;
        }
      }
      const result = await window.electronAPI.createCategoryGroup(
        userId,
        newGroupName.trim(),
        categoryGroups.length
      );
      if (result.success && result.data) {
        setCategoryGroups(prev => [...prev, result.data]);
        setShowAddGroupModal(false);
        setNewGroupName('');
        alert('✅ Group created successfully!');
        await loadCategoryGroups();
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

  const handleUpdateGroup = async () => {
    if (!editGroupName.trim() || !editingGroup) return;
    try {
      setLoading(true);
      const groupsResult = await window.electronAPI.getCategoryGroups(userId);
      if (groupsResult.success && groupsResult.data) {
        const existingGroup = groupsResult.data.find(
          group => group.id !== editingGroup.id &&
            group.name.toLowerCase() === editGroupName.trim().toLowerCase()
        );
        if (existingGroup) {
          alert(`❌ A group named "${editGroupName}" already exists! Please use a different name.`);
          setLoading(false);
          return;
        }
      }
      const updateResult = await window.electronAPI.updateCategoryGroup(
        editingGroup.id,
        userId,
        { name: editGroupName.trim() }
      );
      if (updateResult.success) {
        setCategoryGroups(prevGroups =>
          prevGroups.map(g =>
            g.id === editingGroup.id ? { ...g, name: editGroupName.trim() } : g
          )
        );
        setShowEditGroupModal(false);
        setEditingGroup(null);
        setEditGroupName('');
        alert('✅ Group updated successfully!');
        await loadCategoryGroups();
      } else {
        alert('❌ Failed to update group: ' + (updateResult.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error updating category group:', error);
      alert('Error updating group: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    const categoriesInGroup = budgetData.categories.filter(cat => cat.groupId === groupId && !cat.archived);
    if (categoriesInGroup.length > 0) {
      alert(`Cannot delete this group because it contains ${categoriesInGroup.length} categories. Please move or delete all categories in this group first.`);
      return;
    }
    if (!confirm(`Are you sure you want to delete this group?`)) {
      return;
    }
    try {
      setLoading(true);
      const result = await window.electronAPI.deleteCategoryGroup(groupId, userId);
      if (result && result.success) {
        if (editingGroup && editingGroup.id === groupId) {
          setShowEditGroupModal(false);
          setEditingGroup(null);
          setEditGroupName('');
        }
        setCategoryGroups(prevGroups => prevGroups.filter(g => g.id !== groupId));
        alert('✅ Group deleted successfully');
      } else {
        alert('❌ Failed to delete group: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('❌ Error deleting category group:', error);
      alert('❌ Error deleting group: ' + error.message);
    } finally {
      setLoading(false);
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

  // ==================== QUICK ACTIONS ====================
  const handleAddIncome = async () => {
    const amount = parseFloat(incomeData.amount);

    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('Please log in to add income');
        return;
      }
      const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
      const defaultAccount = accountsResult?.data?.find(a => a.type === 'checking' || a.type === 'savings');
      if (!defaultAccount) {
        alert('No account found to record income to');
        return;
      }
      const transactionData = {
        accountId: defaultAccount.id,
        date: incomeData.date,
        payee: incomeData.memo || 'Income',
        description: incomeData.memo || 'Income',
        amount: amount,
        categoryId: null,
        memo: incomeData.memo,
        cleared: 1
      };
      const result = await window.electronAPI.addTransaction(transactionData);
      if (result.success) {
        const userIdForAccounts = userResult.data.id;
        const accountsResult = await window.electronAPI.getAccountsSummary(userIdForAccounts);
        if (accountsResult?.success && accountsResult.data) {
          const totalCashValue = accountsResult.data
            .filter(acc => acc.type === 'checking' || acc.type === 'savings')
            .reduce((sum, acc) => sum + (acc.balance || 0), 0);
          setTotalCashInAccounts(totalCashValue);
        }
        setIncomeData({
          amount: '',
          date: new Date().toISOString().split('T')[0],
          memo: ''
        });
        setShowAddIncomeModal(false);
        await loadCategoriesFromDB(0, { monthDate: selectedMonthRef.current || selectedMonth });
        calculateReadyToAssign();
        alert(`✅ $${amount.toFixed(2)} added to Ready to Assign`);
      } else {
        alert('❌ Error recording income: ' + result.error);
      }
    } catch (error) {
      console.error('Error adding income:', error);
      alert('❌ Error adding income: ' + error.message);
    }
  };

  const handleQuickAssign = async (method) => {
    if (budgetSummary.unassigned <= 0) {
      alert('No funds available to assign');
      return;
    }

    let allocations = [];
    let remainingFunds = budgetSummary.unassigned;
    const activeCategories = budgetData.categories.filter(cat => !cat.archived);

    switch (method) {
      case 'smart':
        const prioritized = activeCategories.map(cat => {
          const targetInfo = calculateTargetProgress(cat);
          let priority = 5;
          let neededAmount = 0;

          if (targetInfo.status === 'partial' && cat.target_type === 'monthly') {
            priority = 1;
            neededAmount = targetInfo.needed;
          } else if (targetInfo.status === 'unfunded' && cat.target_type === 'monthly') {
            priority = 2;
            neededAmount = targetInfo.needed;
          } else if (targetInfo.status === 'in-progress' && cat.target_type === 'by_date') {
            priority = 3;
            neededAmount = targetInfo.monthlyNeeded || targetInfo.needed;
          } else if (targetInfo.status === 'in-progress' && cat.target_type === 'balance') {
            priority = 4;
            neededAmount = targetInfo.needed;
          } else if ((cat.available || 0) < 0) {
            priority = 1;
            neededAmount = Math.abs(cat.available || 0);
          }

          return { ...cat, priority, neededAmount, targetInfo };
        }).filter(c => c.priority < 5 && c.neededAmount > 0)
          .sort((a, b) => a.priority - b.priority);

        for (const cat of prioritized) {
          if (remainingFunds <= 0) break;
          let amountToAssign = Math.min(cat.neededAmount, remainingFunds);
          if (cat.target_type === 'by_date' && cat.targetInfo.monthlyNeeded) {
            amountToAssign = Math.min(cat.targetInfo.monthlyNeeded, remainingFunds);
          }
          if (amountToAssign > 0) {
            allocations.push({
              categoryId: cat.id,
              amount: amountToAssign,
              reason: `${cat.name}: ${cat.target_type} goal`
            });
            remainingFunds -= amountToAssign;
          }
        }
        break;

      case 'underfunded':
        const overspent = activeCategories.filter(c => (c.available || 0) < 0);
        const monthlyTargets = activeCategories.filter(c =>
          c.target_type === 'monthly' && (c.assigned || 0) < (c.target_amount || 0)
        );
        const savingsGoals = activeCategories.filter(c =>
          c.target_type === 'balance' && (c.available || 0) < (c.target_amount || 0)
        );
        const dateGoals = activeCategories.filter(c =>
          c.target_type === 'by_date' && (c.available || 0) < (c.target_amount || 0)
        );

        const sortedCategories = [
          ...overspent.map(c => ({ ...c, urgency: 1, needed: Math.abs(c.available || 0) })),
          ...monthlyTargets.map(c => ({ ...c, urgency: 2, needed: (c.target_amount || 0) - (c.assigned || 0) })),
          ...savingsGoals.map(c => ({ ...c, urgency: 3, needed: (c.target_amount || 0) - (c.available || 0) })),
          ...dateGoals.map(c => ({ ...c, urgency: 4, needed: (c.target_amount || 0) - (c.available || 0) }))
        ].sort((a, b) => a.urgency - b.urgency);

        for (const cat of sortedCategories) {
          if (remainingFunds <= 0) break;
          let amountToAssign = Math.min(cat.needed, remainingFunds);
          if (amountToAssign > 0) {
            allocations.push({ categoryId: cat.id, amount: amountToAssign, reason: `Funding ${cat.name}` });
            remainingFunds -= amountToAssign;
          }
        }
        break;

      case 'last-month':
        activeCategories.forEach(cat => {
          const lastMonthAmount = cat.last_month_assigned || cat.assigned || 0;
          const currentAssigned = cat.assigned || 0;
          const needed = Math.max(0, lastMonthAmount - currentAssigned);
          if (needed > 0 && remainingFunds >= needed) {
            allocations.push({ categoryId: cat.id, amount: needed, reason: `Match last month's ${formatCurrency(lastMonthAmount)}` });
            remainingFunds -= needed;
          }
        });
        break;

      case 'average':
        activeCategories.forEach(cat => {
          const avgSpend = cat.average_spending || cat.assigned || 0;
          const currentAssigned = cat.assigned || 0;
          const needed = Math.max(0, avgSpend - currentAssigned);
          if (needed > 0 && remainingFunds >= needed) {
            allocations.push({ categoryId: cat.id, amount: needed, reason: `Average spending: ${formatCurrency(avgSpend)}` });
            remainingFunds -= needed;
          }
        });
        break;
    }

    if (allocations.length > 0) {
      const previewMessage = allocations.map(a => `${a.reason}: ${formatCurrency(a.amount)}`).join('\n');
      if (!confirm(`Ready to assign ${formatCurrency(allocations.reduce((sum, a) => sum + a.amount, 0))} to ${allocations.length} categories:\n\n${previewMessage}\n\nProceed?`)) {
        return;
      }

      const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
      const deltas = {};
      for (const a of allocations) {
        deltas[a.categoryId] = (deltas[a.categoryId] || 0) + a.amount;
      }

      setBudgetData(prev => ({
        ...prev,
        categories: prev.categories.map(cat => {
          const d = deltas[cat.id];
          if (d) {
            return {
              ...cat,
              assigned: (cat.assigned || 0) + d,
              available: (cat.available || 0) + d
            };
          }
          return cat;
        })
      }));

      try {
        for (const [categoryId, delta] of Object.entries(deltas)) {
          const cat = budgetData.categories.find(c => c.id === categoryId);
          const newAssigned = (cat?.assigned || 0) + delta;
          const res = await window.electronAPI.updateCategory(categoryId, {
            assigned: newAssigned,
            budget_month: monthKey
          });
          if (!res?.success) {
            console.error('Quick assign failed for category', categoryId, res?.error);
          }
        }
        await loadCategoriesFromDB(0, { monthDate: selectedMonthRef.current || selectedMonth });
        calculateReadyToAssign();
        alert(`✅ Assigned ${formatCurrency(allocations.reduce((sum, a) => sum + a.amount, 0))} to ${Object.keys(deltas).length} categories`);
      } catch (err) {
        console.error('Quick assign error:', err);
        alert(`❌ Error while saving assignments: ${err.message}`);
      }
    } else {
      alert('No categories need funding based on current criteria');
    }
  };

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
    if (selectedCategory.available < amount) {
      if (!confirm(`Warning: This category only has ${formatCurrency(selectedCategory.available)} available. Overspending will make it negative. Continue?`)) {
        return;
      }
    }
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('Please log in to record payments');
        return;
      }
      const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
      const defaultAccount = accountsResult?.data?.find(a => a.type === 'checking' || a.type === 'savings');
      if (!defaultAccount) {
        alert('No account found to record payment from');
        return;
      }
      const transactionData = {
        accountId: defaultAccount.id,
        date: paymentData.date,
        payee: paymentData.payee || 'Payment',
        description: paymentData.payee || 'Payment',
        amount: -amount,
        categoryId: paymentData.categoryId,
        memo: paymentData.memo,
        cleared: 1
      };
      const result = await window.electronAPI.addTransaction(transactionData);
      if (result.success) {
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
        setTotalCashInAccounts(prev => prev - amount);
        setPaymentData({
          amount: '',
          categoryId: '',
          payee: '',
          date: new Date().toISOString().split('T')[0],
          memo: ''
        });
        setShowRecordPaymentModal(false);
        await loadCategoriesFromDB(0, { monthDate: selectedMonthRef.current || selectedMonth });
        calculateReadyToAssign();
        alert(`✅ Payment of $${amount.toFixed(2)} recorded to ${selectedCategory.name}`);
      } else {
        alert('❌ Error recording payment: ' + result.error);
      }
    } catch (error) {
      console.error('Error recording payment:', error);
      alert('❌ Error recording payment: ' + error.message);
    }
  };

  const handleMoveMoney = async () => {
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
    if (fromCategory.available < amount) {
      alert(`Source category only has ${formatCurrency(fromCategory.available)} available`);
      return;
    }
    const monthKey = formatBudgetMonthKey(selectedMonthRef.current || selectedMonth);
    const fromAssigned = (fromCategory.assigned || 0) - amount;
    const fromAvailable = (fromCategory.available || 0) - amount;
    const toAssigned = (toCategory.assigned || 0) + amount;
    const toAvailable = (toCategory.available || 0) + amount;

    try {
      const r1 = await window.electronAPI.updateCategory(moveMoneyData.fromCategoryId, {
        assigned: fromAssigned,
        available: fromAvailable,
        budget_month: monthKey
      });
      const r2 = await window.electronAPI.updateCategory(moveMoneyData.toCategoryId, {
        assigned: toAssigned,
        available: toAvailable,
        budget_month: monthKey
      });
      if (!r1.success || !r2.success) {
        alert(`❌ Could not move money: ${r1.error || r2.error || 'Unknown error'}`);
        return;
      }
      setMoveMoneyData({
        amount: '',
        fromCategoryId: '',
        toCategoryId: ''
      });
      setShowMoveMoneyModal(false);
      await loadCategoriesFromDB(0, { monthDate: selectedMonthRef.current || selectedMonth });
      calculateReadyToAssign();
      alert(`✅ $${amount.toFixed(2)} moved from ${fromCategory.name} to ${toCategory.name}`);
    } catch (error) {
      console.error('Error moving money:', error);
      alert(`❌ Error moving money: ${error.message}`);
    }
  };
  
  const handleSetGoal = (category) => {
    setSelectedCategoryForTarget(category);
    setShowTargetModal(true);
  };

  const handleSaveGoal = async (goalData) => {
    if (!selectedCategoryForTarget) return;

    try {
      const result = await window.electronAPI.updateCategory(selectedCategoryForTarget.id, {
        target_amount: goalData.target_amount,
        target_type: goalData.target_type,
        target_date: goalData.target_date
      });

      if (result.success) {
        setBudgetData(prev => ({
          ...prev,
          categories: prev.categories.map(cat =>
            cat.id === selectedCategoryForTarget.id
              ? {
                ...cat,
                target_amount: goalData.target_amount,
                target_type: goalData.target_type,
                target_date: goalData.target_date
              }
              : cat
          )
        }));

        setShowTargetModal(false);
        setSelectedCategoryForTarget(null);
        alert('✅ Goal saved successfully!');
      } else {
        alert('❌ Failed to save goal: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error saving goal:', error);
      alert('Error saving goal: ' + error.message);
    }
  };
  
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

  // ==================== UI HELPER FUNCTIONS ====================
  const getCategoriesByGroup = (groupId) => {
    const gid = String(groupId);
    return budgetData.categories.filter((c) => {
      if (!c) return false;
      const a = c.archived;
      const archived = a === true || a === 1 || a === '1' || a === 'true';
      if (archived) return false;
      const catGid = c.groupId ?? c.group_id;
      return String(catGid ?? '') === gid;
    });
  };

  const getGroupTotals = (groupId) => {
    const groupCategories = getCategoriesByGroup(groupId);
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

  // ==================== EFFECTS FOR PROGRESS & CALCULATIONS ====================
  useEffect(() => {
    calculateReadyToAssign();
  }, [budgetData.categories, totalCashInAccounts, selectedMonth]);

  useEffect(() => {
    updateAllProgress();
  }, [budgetData.categories.map(cat => cat.available + cat.assigned + (cat.activity || 0)).join(',')]);

  // ==================== INITIALIZATION & REALTIME ====================
  useEffect(() => {
    const initializeData = async () => {
      if (!userId) return;

      setBudgetData({ categories: [] });
      setCategoryGroups([]);

      await new Promise(resolve => setTimeout(resolve, 500));

      if (!(await ensureElectronAPI())) {
        console.error('❌ Electron preload API did not become available in time.');
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        await loadCategoryGroups();
        await loadCategoriesFromDB();
        await loadArchivedCategories();

        const userResult = await window.electronAPI.getCurrentUser();
        if (userResult?.success && userResult?.data) {
          const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
          if (accountsResult?.success) {
            const totalCashValue = accountsResult.data
              .filter(acc => acc.type === 'checking' || acc.type === 'savings')
              .reduce((sum, acc) => sum + (acc.balance || 0), 0);
            setTotalCashInAccounts(totalCashValue);
          }
        }
      } catch (error) {
        console.error('❌ Error during initialization:', error);
      } finally {
        setLoading(false);
      }
    };

    initializeData();
  }, [userId]);

  useEffect(() => {
    let isFirstRun = true;
    const forceReload = async () => {
      if (isFirstRun) {
        isFirstRun = false;
        return;
      }
      setLoading(true);
      try {
        setBudgetData(prev => ({ ...prev, categories: [] }));
        setCategories([]);
        await loadCategoryGroups();
        await loadCategoriesFromDB();
        await loadArchivedCategories();
      } catch (error) {
        console.error('❌ Error reloading categories:', error);
      } finally {
        setLoading(false);
      }
    };
    window.addEventListener('focus', forceReload);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) forceReload();
    });
    return () => {
      window.removeEventListener('focus', forceReload);
      document.removeEventListener('visibilitychange', forceReload);
    };
  }, []);

  const { lastUpdate } = useRealtimeUpdates(['prosperity:updated'], () => {
    void (async () => {
      try {
        await loadCategoryGroups();
        await loadCategoriesFromDB();
        await loadArchivedCategories();
        const userResult = await window.electronAPI.getCurrentUser();
        if (userResult?.success && userResult?.data) {
          const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
          if (accountsResult?.success && accountsResult.data) {
            const totalCashValue = accountsResult.data
              .filter(acc => acc.type === 'checking' || acc.type === 'savings')
              .reduce((sum, acc) => sum + (acc.balance || 0), 0);
            setTotalCashInAccounts(totalCashValue);
          }
        }
      } catch (e) {
        console.warn('prosperity:updated refresh:', e);
      }
      calculateReadyToAssign();
    })();
  });

  useEffect(() => {
    const handleRefresh = () => {
      void (async () => {
        try {
          await loadCategoryGroups();
          await loadCategoriesFromDB();
          await loadArchivedCategories();
          const userResult = await window.electronAPI.getCurrentUser();
          if (userResult?.success && userResult?.data) {
            const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
            if (accountsResult?.success && accountsResult.data) {
              const totalCashValue = accountsResult.data
                .filter(acc => acc.type === 'checking' || acc.type === 'savings')
                .reduce((sum, acc) => sum + (acc.balance || 0), 0);
              setTotalCashInAccounts(totalCashValue);
            }
          }
        } catch (e) {
          console.warn('refresh-prosperity-map:', e);
        }
        calculateReadyToAssign();
      })();
    };
    window.addEventListener('refresh-prosperity-map', handleRefresh);
    return () => {
      window.removeEventListener('refresh-prosperity-map', handleRefresh);
    };
  }, []);

  useEffect(() => {
    window.onAddIncomeClick = () => setShowAddIncomeModal(true);
    window.onRecordPaymentClick = () => setShowRecordPaymentModal(true);
    window.onMoveMoneyClick = () => setShowMoveMoneyModal(true);
    return () => {
      window.onAddIncomeClick = null;
      window.onRecordPaymentClick = null;
      window.onMoveMoneyClick = null;
    };
  }, []);

  // ==================== RENDER ====================
  return (
    <div className="grid min-h-full gap-6 grid-cols-1 bg-[#3B82F6] xl:grid-cols-[minmax(0,1fr)_minmax(280px,24rem)] max-w-full items-start p-1 sm:p-2">
      <div className="space-y-6 min-w-0 overflow-hidden xl:min-w-0">
        <section className="rounded-[2rem] border border-white/25 bg-[#0047AB] p-6 shadow-2xl shadow-[#0047AB]/35 min-w-0 overflow-hidden">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.35em] text-[#F0F9FF]/65">ProsperityMap</p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-[#F0F9FF]">Budget allocation</h1>
              <p className="mt-2 text-sm text-[#F0F9FF]/75">{selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })} budget snapshot</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button variant="pmSecondary" onClick={() => { loadArchivedCategories(); setShowArchivedModal(true); }}>
                Archived ({archivedCategories.length})
              </Button>
              <Button variant="pmSecondary" onClick={() => setShowAddGroupModal(true)}>
                + Add Group
              </Button>
            </div>
          </div>

          <div className="mt-6 grid gap-4 xl:grid-cols-[1.45fr_0.85fr] overflow-hidden">
            <div className="rounded-[1.75rem] border border-white/25 bg-[#3B82F6]/95 p-6 overflow-hidden">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-gradient-to-br from-[#3B82F6] to-[#93C5FD] text-2xl text-[#F0F9FF] shadow-lg shadow-[#0047AB]/30">
                  💰
                </div>
                <div>
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-[#F0F9FF]/65">Ready to Assign</p>
                  <p className={`mt-3 text-4xl font-semibold ${budgetSummary.unassigned < 0 ? 'text-rose-400' : 'text-[#F0F9FF]'}`}>
                    {formatCurrency(budgetSummary.unassigned)}
                  </p>
                  <p className="mt-2 text-sm text-[#F0F9FF]/75">
                    {budgetSummary.unassigned === 0
                      ? 'Every dollar has a job! 🎯'
                      : budgetSummary.unassigned < 0
                        ? `Overspent by ${formatCurrency(Math.abs(budgetSummary.unassigned))}`
                        : `Available for ${selectedMonth.toLocaleString('default', { month: 'long' })}`}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-[1.75rem] border border-white/25 bg-[#3B82F6]/95 p-6 overflow-hidden">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-[#F0F9FF]/95">Quick actions</p>
                  <p className="mt-2 text-sm text-[#F0F9FF]/75">Allocate funds faster with recommended workflows.</p>
                </div>
              </div>
              <div className="mt-5 grid gap-3">
                <Button variant="pmSecondary" onClick={() => handleQuickAssign('smart')}>
                  🧠 Smart Assign
                </Button>
                <Button variant="pmSecondary" onClick={() => handleQuickAssign('underfunded')}>
                  🎯 Fund Underfunded ({formatCurrency(getTotalUnderfunded())})
                </Button>
                <Button variant="pmSecondary" onClick={() => handleQuickAssign('last-month')}>
                  📅 Last Month
                </Button>
                <Button variant="pmSecondary" onClick={() => handleQuickAssign('average')}>
                  📊 Average Spending
                </Button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="inline-flex items-center gap-3 rounded-3xl border border-white/25 bg-[#3B82F6] px-4 py-3 text-sm text-[#F0F9FF]/90">
              <button
                type="button"
                onClick={() => {
                  const newDate = new Date(selectedMonth);
                  newDate.setMonth(selectedMonth.getMonth() - 1);
                  setSelectedMonth(newDate);
                  void loadCategoriesFromDB(0, { monthDate: newDate });
                }}
                className="rounded-full border border-white/25 bg-[#0047AB] px-3 py-2 text-[#F0F9FF]/95 transition hover:brightness-110"
              >◀</button>
              <span className="font-medium text-[#F0F9FF]">{selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}</span>
              <button
                type="button"
                onClick={() => {
                  const newDate = new Date(selectedMonth);
                  newDate.setMonth(selectedMonth.getMonth() + 1);
                  setSelectedMonth(newDate);
                  void loadCategoriesFromDB(0, { monthDate: newDate });
                }}
                className="rounded-full border border-white/25 bg-[#0047AB] px-3 py-2 text-[#F0F9FF]/95 transition hover:brightness-110"
              >▶</button>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button variant="pmSecondary" onClick={async () => { await loadCategoriesFromDB(); await loadCategoryGroups(); }}>
                🔄 Refresh categories
              </Button>
              <Button variant="pmSecondary" onClick={async () => {
                const userResult = await window.electronAPI.getCurrentUser();
                const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
                const totalCash = accountsResult.data
                  .filter(acc => acc.type === 'checking' || acc.type === 'savings')
                  .reduce((sum, acc) => sum + (acc.balance || 0), 0);
                const categories = await window.electronAPI.getCategories(2);
                const totalAssigned = categories.data.reduce((sum, cat) => sum + (cat.assigned || 0), 0);
                alert(`Total Cash: $${totalCash}
Total Assigned: $${totalAssigned}
Ready to Assign: $${totalCash - totalAssigned}`);
              }}>
                🔍 Quick totals
              </Button>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-white/25 bg-[#3B82F6]">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/25 text-left text-sm text-[#F0F9FF]/95">
                <colgroup>
                  <col style={{ width: '30%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '18%' }} />
                  <col style={{ width: '16%' }} />
                </colgroup>
                <thead className="bg-[#0047AB]/95">
                  <tr>
                    <th className="px-4 py-3 font-semibold text-[#F0F9FF]/75">Category</th>
                    <th className="px-4 py-3 font-semibold text-[#F0F9FF]/75">Assigned</th>
                    <th className="px-4 py-3 font-semibold text-[#F0F9FF]/75">Activity</th>
                    <th className="px-4 py-3 font-semibold text-[#F0F9FF]/75">Available</th>
                    <th className="px-4 py-3 font-semibold text-[#F0F9FF]/75">Progress</th>
                    <th className="px-4 py-3 font-semibold text-[#F0F9FF]/75">Goal Target</th>
                  </tr>
                </thead>
                <tbody>
                  {categoryGroups.map((group, groupIndex) => {
                    const groupCategories = getCategoriesByGroup(group.id);
                    const uniqueGroupKey = `group-${group.id}-${groupIndex}`;

                    return (
                      <React.Fragment key={uniqueGroupKey}>
                        <tr className="bg-[#0047AB]/90">
                          <td colSpan="6" className="px-4 py-4 text-[#F0F9FF]">
                            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
                                <button
                                  type="button"
                                  onClick={() => toggleGroupCollapse(group.id)}
                                  className="shrink-0 rounded-full border border-white/25 bg-[#0047AB] px-3 py-2 text-[#F0F9FF]/95 transition hover:brightness-110"
                                >
                                  ▼
                                </button>
                                <span className="min-w-0 text-base font-semibold text-[#F0F9FF]">{group.name}</span>
                                <span className="shrink-0 rounded-full bg-[#0047AB] px-3 py-1 text-xs uppercase tracking-[0.2em] text-[#F0F9FF]/75">{groupCategories.length} categories</span>
                              </div>
                              <div className="flex shrink-0 flex-wrap gap-2 lg:justify-end">
                                <Button variant="pmSecondary" onClick={() => handleAddCategory(group)}>+ Category</Button>
                                <Button variant="pmSecondary" onClick={() => handleEditGroup(group)}>Edit</Button>
                                <Button variant="pmDanger" onClick={() => handleDeleteGroup(group.id)}>Delete</Button>
                              </div>
                            </div>
                          </td>
                        </tr>

                        {!collapsedGroups[group.id] && (
                          <React.Fragment key={`content-${uniqueGroupKey}`}>
                            {groupCategories.length > 0 ? (
                              groupCategories.map((cat, catIndex) => {
                                const targetInfo = getTargetInfo(cat);
                                const hasTarget = targetInfo.status !== 'no-target';
                                const isEditing = editingCategory === cat.id;
                                const categoryKey = `cat-${cat.id}-${groupIndex}-${catIndex}`;

                                if (isEditing) {
                                  return (
                                    <tr key={`${categoryKey}-edit`} className="bg-[#0047AB]">
                                      <td className="px-4 py-4">
                                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                          <div className="min-w-0">
                                            <div className="text-[#F0F9FF]">{cat.name}</div>
                                            <div className="mt-1 text-xs text-[#F0F9FF]/75">Edit details and goal for this category.</div>
                                          </div>
                                          <div className="flex gap-2">
                                            <Button variant="pmSecondary" onClick={() => handleArchiveCategory(cat)}>Archive</Button>
                                            <Button variant="pmDanger" onClick={() => handleDeleteCategory(cat.id)}>Delete</Button>
                                          </div>
                                        </div>
                                      </td>
                                      <td className="px-4 py-4">
                                        <input
                                          type="number"
                                          value={editCategoryData.assigned === 0 ? '' : editCategoryData.assigned}
                                          onChange={(e) => {
                                            const value = e.target.value;
                                            setEditCategoryData({
                                              ...editCategoryData,
                                              assigned: value === '' ? 0 : parseFloat(value)
                                            });
                                          }}
                                          className="w-full rounded-3xl border border-white/25 bg-[#3B82F6] px-3 py-2 text-sm text-[#F0F9FF] outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                                          step="0.01"
                                          min="0"
                                          placeholder="0.00"
                                        />
                                      </td>
                                      <td className="px-4 py-4">{formatCurrency(cat.activity || 0)}</td>
                                      <td className="px-4 py-4">{formatCurrency(cat.available || 0)}</td>
                                      <td className="px-4 py-4">
                                        <select
                                          value={editCategoryData.target_type}
                                          onChange={(e) => setEditCategoryData({ ...editCategoryData, target_type: e.target.value })}
                                          className="w-full rounded-3xl border border-white/25 bg-[#3B82F6] px-3 py-2 text-sm text-[#F0F9FF] outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                                        >
                                          <option value="monthly">Monthly</option>
                                          <option value="balance">Balance</option>
                                          <option value="by_date">By Date</option>
                                          {cat.is_loan_payment_category && <option value="monthly_debt_payment">Monthly Debt</option>}
                                        </select>
                                        <input
                                          type="number"
                                          value={editCategoryData.target_amount === 0 ? '' : editCategoryData.target_amount}
                                          onChange={(e) => setEditCategoryData({ ...editCategoryData, target_amount: e.target.value === '' ? 0 : parseFloat(e.target.value) })}
                                          className="mt-3 w-full rounded-3xl border border-white/25 bg-[#3B82F6] px-3 py-2 text-sm text-[#F0F9FF] outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
                                          placeholder="Target amount"
                                          step="0.01"
                                          min="0"
                                        />
                                      </td>
                                      <td className="px-4 py-4">
                                        <div className="flex flex-wrap gap-2">
                                          <Button variant="pmPrimary" onClick={() => handleSaveCategoryEdit(cat.id)}>Save</Button>
                                          <Button variant="pmSecondary" onClick={handleCancelEdit}>Cancel</Button>
                                        </div>
                                      </td>
                                    </tr>
                                  );
                                }

                                return (
                                  <tr key={categoryKey} className="border-t border-white/25">
                                    <td className="px-4 py-4 align-top">
                                      <div className="flex max-w-md flex-col gap-3">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="text-sm font-semibold text-[#F0F9FF]">{cat.name}</span>
                                          {hasTarget && <span className="rounded-full bg-[#0047AB] px-2 py-1 text-xs text-[#F0F9FF]/75">{targetInfo.status}</span>}
                                        </div>
                                        <details className="group/actions relative w-fit">
                                          <summary className="cursor-pointer list-none rounded-full border border-white/30 bg-[#0047AB] px-3 py-1.5 text-xs font-medium text-[#F0F9FF]/95 outline-none ring-white/30 hover:brightness-110 focus-visible:ring-2 [&::-webkit-details-marker]:hidden">
                                            Actions <span className="text-[#F0F9FF]/75">▾</span>
                                          </summary>
                                          <div className="absolute left-0 z-30 mt-1 min-w-[11rem] rounded-xl border border-white/25 bg-[#3B82F6] py-1 shadow-2xl ring-1 ring-white/35">
                                            <button
                                              type="button"
                                              className="block w-full px-3 py-2 text-left text-sm text-[#F0F9FF]/95 hover:bg-[#0047AB]"
                                              onClick={(e) => {
                                                const root = e.currentTarget.closest('details');
                                                if (root) root.open = false;
                                                handleEditCategory(cat);
                                              }}
                                            >
                                              Edit
                                            </button>
                                            <button
                                              type="button"
                                              className="block w-full px-3 py-2 text-left text-sm text-[#F0F9FF]/95 hover:bg-[#0047AB]"
                                              onClick={(e) => {
                                                const root = e.currentTarget.closest('details');
                                                if (root) root.open = false;
                                                handleSetGoal(cat);
                                              }}
                                            >
                                              Goal
                                            </button>
                                            <button
                                              type="button"
                                              className="block w-full px-3 py-2 text-left text-sm text-[#F0F9FF]/95 hover:bg-[#0047AB]"
                                              onClick={(e) => {
                                                const root = e.currentTarget.closest('details');
                                                if (root) root.open = false;
                                                handleArchiveCategory(cat);
                                              }}
                                            >
                                              Archive
                                            </button>
                                            <button
                                              type="button"
                                              className="block w-full px-3 py-2 text-left text-sm text-rose-300 hover:bg-[#0047AB]"
                                              onClick={(e) => {
                                                const root = e.currentTarget.closest('details');
                                                if (root) root.open = false;
                                                handleDeleteCategory(cat.id);
                                              }}
                                            >
                                              Delete
                                            </button>
                                          </div>
                                        </details>
                                      </div>
                                    </td>
                                    <td className="px-4 py-4 align-top whitespace-nowrap">{formatCurrency(cat.assigned || 0)}</td>
                                    <td className="px-4 py-4 align-top whitespace-nowrap">{formatCurrency(cat.activity || 0)}</td>
                                    <td className="px-4 py-4 align-top">
                                      <div className={`${(cat.available || 0) < 0 ? 'text-rose-400' : (cat.available || 0) === 0 ? 'text-amber-300' : 'text-emerald-400'} font-semibold`}>{formatCurrency(cat.available || 0)}</div>
                                      {(cat.available || 0) < 0 && <div className="mt-1 text-xs text-rose-300">Overspent</div>}
                                      {(cat.available || 0) === 0 && <div className="mt-1 text-xs text-amber-300">Fully allocated</div>}
                                    </td>
                                    <td className="px-4 py-4 align-top">
                                      {hasTarget ? (
                                        <div className="space-y-2">
                                          <div className="relative h-3 overflow-hidden rounded-full bg-[#3B82F6]/70">
                                            <div className="h-full rounded-full" style={{ width: `${Math.min(100, targetInfo.progress || 0)}%`, backgroundColor: getProgressColor(targetInfo.status) }} />
                                          </div>
                                          <div className="text-xs text-[#F0F9FF]/75">{Math.min(100, Math.round(targetInfo.progress || 0))}%</div>
                                        </div>
                                      ) : (
                                        <div className="text-[#F0F9FF]/65">—</div>
                                      )}
                                    </td>
                                    <td className="px-4 py-4 align-top">
                                      {cat.target_amount && cat.target_amount > 0 ? (
                                        <div className="space-y-1">
                                          <div className="font-semibold text-[#F0F9FF]">{formatCurrency(cat.target_amount)}</div>
                                          <div className="text-xs text-[#F0F9FF]/75">{cat.target_type === 'monthly' ? 'Monthly' : cat.target_type === 'balance' ? 'Balance' : cat.target_type === 'by_date' ? 'By Date' : 'Other'}</div>
                                        </div>
                                      ) : (
                                        <Button variant="pmSecondary" onClick={() => handleSetGoal(cat)}>+ Set Goal</Button>
                                      )}
                                    </td>
                                  </tr>
                                );
                              })
                            ) : (
                              <tr className="border-t border-white/25">
                                <td colSpan="6" className="px-4 py-6 text-center text-sm text-[#F0F9FF]/75">No categories found in this group.</td>
                              </tr>
                            )}

                            {groupCategories.length > 0 && (
                              <tr className="border-t border-white/25 bg-[#0047AB]/95">
                                <td className="px-4 py-4 text-sm font-semibold text-[#F0F9FF]">{group.name} Total</td>
                                <td className="px-4 py-4 font-semibold text-[#F0F9FF]">{formatCurrency(getGroupTotals(group.id).assigned)}</td>
                                <td className="px-4 py-4 font-semibold text-[#F0F9FF]">{formatCurrency(getGroupTotals(group.id).activity)}</td>
                                <td className="px-4 py-4 font-semibold text-[#F0F9FF]">{formatCurrency(getGroupTotals(group.id).available)}</td>
                                <td className="px-4 py-4 text-sm text-[#F0F9FF]/75">{formatCurrency(getGroupTotals(group.id).underfunded)} underfunded</td>
                                <td className="px-4 py-4 text-[#F0F9FF]/75">—</td>
                              </tr>
                            )}
                          </React.Fragment>
                        )}
                      </React.Fragment>
                    );
                  })}

                  <tr className="border-t border-white/25 bg-[#0047AB]">
                    <td className="px-4 py-4 font-semibold text-[#F0F9FF]">Total</td>
                    <td className="px-4 py-4 font-semibold text-[#F0F9FF]">{formatCurrency(budgetData.categories.filter(c => !c.archived).reduce((sum, cat) => sum + (cat.assigned || 0), 0))}</td>
                    <td className="px-4 py-4 font-semibold text-[#F0F9FF]">{formatCurrency(budgetData.categories.filter(c => !c.archived).reduce((sum, cat) => sum + (cat.activity || 0), 0))}</td>
                    <td className="px-4 py-4 font-semibold text-[#F0F9FF]">{formatCurrency(budgetData.categories.filter(c => !c.archived).reduce((sum, cat) => sum + (cat.available || 0), 0))}</td>
                    <td className="px-4 py-4 text-[#F0F9FF]/75">—</td>
                    <td className="px-4 py-4 text-[#F0F9FF]/75">—</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </div>

      <aside className="space-y-6 min-w-0 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto xl:self-start xl:min-w-[18rem]">
        <div className="rounded-[2rem] border border-white/25 bg-[#0047AB] p-6 shadow-2xl shadow-[#0047AB]/35 min-w-0">
          <SummaryView
            totalAvailable={budgetSummary.totalAvailable}
            totalActivity={budgetSummary.totalActivity}
            totalAssigned={budgetSummary.totalAssigned}
            unassigned={budgetSummary.unassigned}
            categories={budgetData.categories || []}
            onAutoAssign={handleAutoAssign}
            underfundedTotal={getTotalUnderfunded()}
          />
          <div className="mt-3 text-sm text-rose-400">Underfunded: {formatCurrency(getTotalUnderfunded())}</div>
        </div>

        <div className="rounded-[2rem] border border-white/25 bg-[#0047AB] p-6 shadow-2xl shadow-[#0047AB]/35">
          <AutoAssignView readyToAssign={budgetSummary.unassigned} underfundedTotal={getTotalUnderfunded()} underfundedCategories={calculateUnderfundedCategories()} />
        </div>

        <div className="rounded-[2rem] border border-white/25 bg-[#0047AB] p-6 shadow-2xl shadow-[#0047AB]/35">
          <FutureMonthsView futureAssignments={2340.50} nextMonthTarget={5000} monthsAhead={1.5} />
        </div>
      </aside>

      {showArchivedModal && (
        <div style={styles.modalOverlay} onClick={() => setShowArchivedModal(false)}>
          <div style={{ ...styles.modalContent, maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Archived Categories</h3>
            <p style={{ color: PM.textMuted, marginBottom: '1rem' }}>Archived categories are hidden from your budget but can be restored at any time.</p>
            {archivedCategories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: PM.textMuted }}>No archived categories</div>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {archivedCategories.map(cat => (
                  <div key={cat.id} style={{ padding: '1rem', borderBottom: `1px solid ${PM.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', color: PM.text }}>{cat.name}</div>
                      <div style={{ fontSize: '12px', color: PM.textMuted }}>
                        Original group: {categoryGroups.find(g => g.id === cat.original_group_id)?.name || 'Unknown'} | Archived: {new Date(cat.archived_at || Date.now()).toLocaleDateString()}
                      </div>
                    </div>
                    <button onClick={() => handleRestoreCategory(cat)} style={styles.restoreButton}>Restore</button>
                  </div>
                ))}
              </div>
            )}
            <div style={styles.modalActions}>
              <button style={styles.cancelButton} onClick={() => setShowArchivedModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {showAddIncomeModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddIncomeModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Income</h3>
            <div style={styles.formGroup}><label style={styles.label}>Amount</label><input type="number" style={styles.input} value={incomeData.amount} onChange={(e) => setIncomeData({ ...incomeData, amount: e.target.value })} placeholder="0.00" step="0.01" min="0" autoFocus /></div>
            <div style={styles.formGroup}><label style={styles.label}>Date</label><input type="date" style={styles.input} value={incomeData.date} onChange={(e) => setIncomeData({ ...incomeData, date: e.target.value })} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Memo (Optional)</label><input type="text" style={styles.input} value={incomeData.memo} onChange={(e) => setIncomeData({ ...incomeData, memo: e.target.value })} placeholder="e.g., Paycheck, Gift, etc." /></div>
            <div style={styles.modalActions}><button style={styles.saveButton} onClick={handleAddIncome}>Add Income</button><button style={styles.cancelButton} onClick={() => setShowAddIncomeModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {showRecordPaymentModal && (
        <div style={styles.modalOverlay} onClick={() => setShowRecordPaymentModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Record Payment</h3>
            <div style={styles.formGroup}><label style={styles.label}>Amount</label><input type="number" style={styles.input} value={paymentData.amount} onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })} placeholder="0.00" step="0.01" min="0" autoFocus /></div>
            <div style={styles.formGroup}><label style={styles.label}>Category</label><select style={styles.select} value={paymentData.categoryId} onChange={(e) => setPaymentData({ ...paymentData, categoryId: e.target.value })}><option value="">Select a category</option>{budgetData.categories.filter((c) => !c.archived).map((cat) => (<option key={cat.id} value={cat.id}>{cat.name} ({formatCurrency(cat.available)})</option>))}</select></div>
            <div style={styles.formGroup}><label style={styles.label}>Payee</label><input type="text" style={styles.input} value={paymentData.payee} onChange={(e) => setPaymentData({ ...paymentData, payee: e.target.value })} placeholder="Store name, bill payee, etc." /></div>
            <div style={styles.formGroup}><label style={styles.label}>Date</label><input type="date" style={styles.input} value={paymentData.date} onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })} /></div>
            <div style={styles.formGroup}><label style={styles.label}>Memo (Optional)</label><input type="text" style={styles.input} value={paymentData.memo} onChange={(e) => setPaymentData({ ...paymentData, memo: e.target.value })} placeholder="Additional details" /></div>
            <div style={styles.modalActions}><button style={styles.saveButton} onClick={handleRecordPayment}>Record Payment</button><button style={styles.cancelButton} onClick={() => setShowRecordPaymentModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {showMoveMoneyModal && (
        <div style={styles.modalOverlay} onClick={() => setShowMoveMoneyModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Move Money Between Categories</h3>
            <div style={styles.formGroup}><label style={styles.label}>Amount</label><input type="number" style={styles.input} value={moveMoneyData.amount} onChange={(e) => setMoveMoneyData({ ...moveMoneyData, amount: e.target.value })} placeholder="0.00" step="0.01" min="0" autoFocus /></div>
            <div style={styles.formGroup}><label style={styles.label}>From Category</label><select style={styles.select} value={moveMoneyData.fromCategoryId} onChange={(e) => setMoveMoneyData({ ...moveMoneyData, fromCategoryId: e.target.value })}><option value="">Select source category</option>{budgetData.categories.filter((c) => !c.archived && (c.available || 0) > 0).map((cat) => (<option key={cat.id} value={cat.id}>{cat.name} ({formatCurrency(cat.available)} available)</option>))}</select></div>
            <div style={styles.formGroup}><label style={styles.label}>To Category</label><select style={styles.select} value={moveMoneyData.toCategoryId} onChange={(e) => setMoveMoneyData({ ...moveMoneyData, toCategoryId: e.target.value })}><option value="">Select destination category</option>{budgetData.categories.filter((c) => !c.archived && c.id !== moveMoneyData.fromCategoryId).map((cat) => (<option key={cat.id} value={cat.id}>{cat.name}</option>))}</select></div>
            <div style={styles.modalActions}><button style={styles.saveButton} onClick={handleMoveMoney}>Move Money</button><button style={styles.cancelButton} onClick={() => setShowMoveMoneyModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {showAddGroupModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddGroupModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Create New Category Group</h3>
            <div style={styles.formGroup}><label style={styles.label}>Group Name</label><input type="text" style={styles.input} value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g., Housing, Transportation, Savings Goals" autoFocus /></div>
            <div style={styles.modalActions}><button style={styles.saveButton} onClick={handleCreateGroup}>Create Group</button><button style={styles.cancelButton} onClick={() => { setShowAddGroupModal(false); setNewGroupName(''); }}>Cancel</button></div>
          </div>
        </div>
      )}

      {showEditGroupModal && editingGroup && (
        <div style={styles.modalOverlay} onClick={() => setShowEditGroupModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Edit Category Group</h3>
            <div style={styles.formGroup}><label style={styles.label}>Group Name</label><input type="text" style={styles.input} value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} autoFocus /></div>
            <div style={styles.modalActions}><button style={styles.saveButton} onClick={handleUpdateGroup}>Save Changes</button><button style={styles.cancelButton} onClick={() => { setShowEditGroupModal(false); setEditingGroup(null); setEditGroupName(''); }}>Cancel</button></div>
          </div>
        </div>
      )}

      {showAddCategoryModal && selectedGroupForCategory && (
        <div style={styles.modalOverlay} onClick={() => setShowAddCategoryModal(false)}>
          <div style={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Category to {selectedGroupForCategory.name}</h3>
            <div style={styles.formGroup}><label style={styles.label}>Category Name</label><input type="text" style={styles.input} value={newCategoryData.name} onChange={(e) => setNewCategoryData({ ...newCategoryData, name: e.target.value })} placeholder="e.g., Groceries, Rent, Savings" autoFocus /></div>
            <div style={styles.formGroup}><label style={styles.label}>Initial Assigned Amount (Optional)</label><input type="number" style={styles.input} value={newCategoryData.assigned === 0 ? '' : newCategoryData.assigned} onChange={(e) => { const val = e.target.value === '' ? 0 : parseFloat(e.target.value); setNewCategoryData({ ...newCategoryData, assigned: isNaN(val) ? 0 : val }); }} placeholder="0.00" step="0.01" min="0" /></div>
            <div style={styles.modalActions}><button style={styles.saveButton} onClick={handleCreateCategory}>Create Category</button><button style={styles.cancelButton} onClick={() => { setShowAddCategoryModal(false); setNewCategoryData({ name: '', assigned: 0, groupId: null }); setSelectedGroupForCategory(null); }}>Cancel</button></div>
          </div>
        </div>
      )}

      {showTargetModal && selectedCategoryForTarget && (
        <CategoryTargetModal
          isOpen={showTargetModal}
          onClose={() => {
            setShowTargetModal(false);
            setSelectedCategoryForTarget(null);
          }}
          category={selectedCategoryForTarget}
          onSave={handleSaveGoal}
          currentTargetAmount={selectedCategoryForTarget.target_amount || 0}
          currentTargetType={selectedCategoryForTarget.target_type || 'monthly'}
          currentTargetDate={selectedCategoryForTarget.target_date}
        />
      )}
    </div>
  );
}
// ==================== STYLES (modals — PM theme, no black)
const styles = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: PM.overlay,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: PM.fg,
    borderRadius: '16px',
    padding: '24px',
    width: '90%',
    maxWidth: '500px',
    border: '1px solid ' + PM.border,
    boxShadow: PM.shadow,
    color: PM.text
  },
  modalTitle: {
    color: PM.text,
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '20px'
  },
  formGroup: { marginBottom: '16px' },
  label: {
    display: 'block',
    color: PM.textMuted,
    fontSize: '13px',
    marginBottom: '6px',
    fontWeight: '500'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: PM.well,
    border: '1px solid ' + PM.border,
    borderRadius: '8px',
    color: PM.text,
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: PM.well,
    border: '1px solid ' + PM.border,
    borderRadius: '8px',
    color: PM.text,
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    justifyContent: 'flex-end',
    marginTop: '24px'
  },
  saveButton: {
    backgroundColor: PM.bg,
    color: PM.text,
    border: '1px solid ' + PM.border,
    padding: '8px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  cancelButton: {
    backgroundColor: 'rgba(220, 38, 38, 0.9)',
    color: PM.text,
    border: '1px solid ' + PM.border,
    padding: '8px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '600'
  },
  restoreButton: {
    padding: '6px 12px',
    backgroundColor: PM.bg,
    color: PM.text,
    border: '1px solid ' + PM.border,
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '600'
  }
};

export default PropertyMapView;