// src/views/PropertyMapView.jsx
import React, { useState, useEffect, useRef } from 'react';
import SummaryView from './SummaryView';
import AutoAssignView from './AutoAssignView';
import FutureMonthsView from './FutureMonthsView';
import useRealtimeUpdates from '../hooks/useRealtimeUpdates';
import BudgetEngine from "../shared/budgetEngine.mjs";
import CategoryTargetModal from '../components/CategoryTargetModal';

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
  const moveMoneyForCreditCardTransaction = async (amount, spendingCategoryId, creditCardAccountName) => {
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
      
      await window.electronAPI.updateCategory(spendingCategoryId, {
        assigned: newSpendingAssigned,
        available: newSpendingAvailable
      });
      
      const newPaymentAssigned = (paymentCategory.assigned || 0) + amount;
      const newPaymentAvailable = (paymentCategory.available || 0) + amount;
      
      await window.electronAPI.updateCategory(paymentCategory.id, {
        assigned: newPaymentAssigned,
        available: newPaymentAvailable
      });
      
      console.log(`✅ Successfully moved $${amount} from "${spendingCategory.name}" to "${paymentCategory.name}"`);
      
      await loadCategoriesFromDB();
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

      try {
        await window.electronAPI.updateCategory(category.id, { available: newAvailable });
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
      return result?.available || 0;
    } catch (error) {
      console.error('Error getting previous month available:', error);
      return 0;
    }
  };

  // ==================== READY TO ASSIGN CALCULATION ====================
  const calculateReadyToAssign = () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('💰 CALCULATING READY TO ASSIGN');

    const activeCategories = budgetData.categories.filter(cat => !cat.archived);

    let totalAssigned = activeCategories.reduce((sum, cat) => sum + (Number(cat.assigned) || 0), 0);
    let totalCarryover = activeCategories.reduce((sum, cat) => sum + (cat.previous_available || 0), 0);
    let totalActivity = activeCategories.reduce((sum, cat) => sum + (Number(cat.activity) || 0), 0);
    const cashInAccounts = totalCashInAccounts;
    const totalBudgeted = totalAssigned - totalActivity + totalCarryover;
    const readyToAssign = cashInAccounts - totalBudgeted;

    console.log(`Total Cash: ${cashInAccounts}`);
    console.log(`Total Assigned: ${totalAssigned}`);
    console.log(`Total Activity: ${totalActivity}`);
    console.log(`Total Carryover: ${totalCarryover}`);
    console.log(`Ready to Assign: ${readyToAssign}`);
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
    if (budgetData.categories.length > 0) {
      updateAllAvailable();
    }
  }, [budgetData.categories.map(cat => `${cat.id}:${cat.assigned}:${cat.activity}`).join(',')]);

  // ==================== DATABASE OPERATIONS ====================
  const loadCategoryGroups = async () => {
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

  const loadCategoriesFromDB = async (retryCount = 0) => {
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
      const result = await window.electronAPI.getCategories(userId);

      if (result && result.success && result.data) {
        const dbCategories = result.data.map(cat => ({
          id: cat.id,
          name: cat.name,
          assigned: Number(cat.assigned) || 0,
          activity: Number(cat.activity) || 0,
          available: Number(cat.available) || 0,
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
        }));

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

  const updateCategoryAssigned = async (categoryId, newAssigned) => {
    try {
      const result = await window.electronAPI.updateCategory(categoryId, { assigned: newAssigned });
      if (!result.success) {
        console.error('Failed to update category assigned amount:', result.error);
      }
    } catch (error) {
      console.error('❌ Error updating category:', error);
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
        return '#3B82F6';
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
        target_type: editCategoryData.target_type
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
        assigned: newCategoryData.assigned || 0,
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
        const newCategory = {
          id: result.data.id,
          name: categoryData.name,
          assigned: categoryData.assigned || 0,
          activity: 0,
          available: categoryData.assigned || 0,
          groupId: newCategoryData.groupId,
          user_id: userId,
          priority: 2,
          target_amount: categoryData.assigned || 0,
          target_type: 'monthly',
          target_date: null,
          progress: (categoryData.assigned || 0) > 0 ? 100 : 0,
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
        categoryId: 'inflow_ready_to_assign',
        memo: incomeData.memo,
        cleared: 1
      };
      const result = await window.electronAPI.addTransaction(transactionData);
      if (result.success) {
        setTotalCashInAccounts(prev => prev + amount);
        setIncomeData({
          amount: '',
          date: new Date().toISOString().split('T')[0],
          memo: ''
        });
        setShowAddIncomeModal(false);
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

  const handleQuickAssign = (method) => {
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
      if (confirm(`Ready to assign ${formatCurrency(allocations.reduce((sum, a) => sum + a.amount, 0))} to ${allocations.length} categories:\n\n${previewMessage}\n\nProceed?`)) {
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
        allocations.forEach(allocation => {
          const category = budgetData.categories.find(c => c.id === allocation.categoryId);
          if (category) {
            updateCategoryAssigned(allocation.categoryId, (category.assigned || 0) + allocation.amount);
          }
        });
        alert(`✅ Assigned ${formatCurrency(allocations.reduce((sum, a) => sum + a.amount, 0))} to ${allocations.length} categories`);
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
    if (fromCategory.available < amount) {
      alert(`Source category only has ${formatCurrency(fromCategory.available)} available`);
      return;
    }
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
    setMoveMoneyData({
      amount: '',
      fromCategoryId: '',
      toCategoryId: ''
    });
    setShowMoveMoneyModal(false);
    calculateReadyToAssign();
    alert(`✅ $${amount.toFixed(2)} moved from ${fromCategory.name} to ${toCategory.name}`);
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
    const targetId = Number(groupId);
    const filtered = budgetData.categories.filter(c => {
      const catGroupId = Number(c.groupId);
      return catGroupId === targetId && !c.archived;
    });
    return filtered;
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
    loadCategoryGroups();
    loadCategoriesFromDB();
    loadArchivedCategories();
    calculateReadyToAssign();
  });

  useEffect(() => {
    const handleRefresh = () => {
      loadCategoryGroups();
      loadCategoriesFromDB();
      loadArchivedCategories();
      calculateReadyToAssign();
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
    <div style={styles.container}>
      <div style={styles.budgetTableContainer}>
        <div style={styles.header}>
          <div style={styles.titleSection}>
            <h1 style={styles.title}>ProspertyMap</h1>
            <p style={styles.description}>
              {selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })} budget allocation
            </p>
          </div>
          <div style={styles.controlsRow}>
            <button
              onClick={() => {
                loadArchivedCategories();
                setShowArchivedModal(true);
              }}
              style={styles.archiveButton}
            >
              📦 Archived Categories ({archivedCategories.length})
            </button>
          </div>
        </div>

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
        
        {(() => {
          if (!budgetData.categories || !Array.isArray(budgetData.categories)) return null;
          const overspentCategories = budgetData.categories.filter(c => !c.archived && (c.available || 0) < 0);
          if (overspentCategories.length === 0) return null;
          return (
            <div style={styles.warningBanner}>
              <div style={styles.warningIcon}>⚠️</div>
              <div style={styles.warningContent}>
                <strong>Overspending Alert!</strong>
                <div style={styles.warningText}>
                  You have {overspentCategories.length} categor{overspentCategories.length > 1 ? 'ies' : 'y'} with negative Available.
                  Please cover this overspending from other categories.
                </div>
                <button
                  onClick={() => handleQuickAssign('underfunded')}
                  style={styles.warningButton}
                >
                  Cover Overspending
                </button>
              </div>
            </div>
          );
        })()}
        
        <div style={styles.controlsRow}>
          <div style={styles.monthSelector}>
            <button style={styles.monthNavButton} onClick={() => {
              const newDate = new Date(selectedMonth);
              newDate.setMonth(selectedMonth.getMonth() - 1);
              setSelectedMonth(newDate);
            }}>◀</button>
            <span style={styles.currentMonth}>
              {selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
            <button style={styles.monthNavButton} onClick={() => {
              const newDate = new Date(selectedMonth);
              newDate.setMonth(selectedMonth.getMonth() + 1);
              setSelectedMonth(newDate);
            }}>▶</button>
          </div>
          <button style={styles.addGroupButton} onClick={() => setShowAddGroupModal(true)}>
            + Add Category Group
          </button>
          <button
            onClick={async () => {
              const userResult = await window.electronAPI.getCurrentUser();
              const accountsResult = await window.electronAPI.getAccountsSummary(userResult.data.id);
              const totalCash = accountsResult.data
                .filter(acc => acc.type === 'checking' || acc.type === 'savings')
                .reduce((sum, acc) => sum + (acc.balance || 0), 0);
              const categories = await window.electronAPI.getCategories(2);
              const totalAssigned = categories.data.reduce((sum, cat) => sum + (cat.assigned || 0), 0);
              alert(`Total Cash: $${totalCash}\nTotal Assigned: $${totalAssigned}\nReady to Assign: $${totalCash - totalAssigned}`);
            }}
            style={{ background: '#F59E0B', color: 'white', padding: '8px', margin: '8px' }}
          >
            🔍 DEBUG READY TO ASSIGN
          </button>
          <button
            onClick={async () => {
              await loadCategoriesFromDB();
              await loadCategoryGroups();
            }}
            style={{ background: '#10B981', color: 'white', padding: '8px', margin: '8px' }}
          >
            🔄 FORCE REFRESH CATEGORIES
          </button>
          {budgetSummary.unassigned > 0 && (
            <div style={styles.quickBudgetTools}>
              <button onClick={() => handleQuickAssign('smart')} style={{
                ...styles.quickBudgetButton,
                background: '#8B5CF6',
                color: 'white'
              }} title="Smart assign based on goal priorities">
                🧠 Smart Assign
              </button>
              <button onClick={() => handleQuickAssign('underfunded')} style={{
                ...styles.quickBudgetButton,
                background: '#F59E0B',
                color: 'white'
              }} title="Assign money to underfunded categories">
                🎯 Fund Underfunded (${getTotalUnderfunded().toFixed(0)})
              </button>
              <button onClick={() => handleQuickAssign('last-month')} style={{
                ...styles.quickBudgetButton,
                background: '#3B82F6',
                color: 'white'
              }}>📅 Last Month's Amount</button>
              <button onClick={() => handleQuickAssign('average')} style={{
                ...styles.quickBudgetButton,
                background: '#10B981',
                color: 'white'
              }}>📊 Average Spending</button>
            </div>
          )}
        </div>

        <div style={styles.tableContainer}>
          {loading ? (
            <div style={styles.loading}>Loading categories...</div>
          ) : (
            <table style={styles.table}>
              <colgroup>
                <col style={{ width: '30%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '16%' }} />
              </colgroup>
              <thead style={styles.tableHead}>
                <tr>
                  <th style={styles.tableHeader}>Category</th>
                  <th style={styles.tableHeader}>Assigned</th>
                  <th style={styles.tableHeader}>Activity</th>
                  <th style={styles.tableHeader}>Available</th>
                  <th style={styles.tableHeader}>Progress</th>
                  <th style={styles.tableHeader}>Goal Target</th>
                </tr>
              </thead>
              <tbody>
                {categoryGroups.map((group, groupIndex) => {
                  const groupCategories = getCategoriesByGroup(group.id);
                  const uniqueGroupKey = `group-${group.id}-${groupIndex}`;

                  return (
                    <React.Fragment key={uniqueGroupKey}>
                      <tr style={styles.categoryGroupRow}>
                        <td colSpan="6" style={styles.categoryGroupCell}>
                          <div style={styles.groupHeader}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <button
                                onClick={() => toggleGroupCollapse(group.id)}
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  color: '#ffffff',
                                  fontSize: '1rem',
                                  cursor: 'pointer',
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  transform: collapsedGroups[group.id] ? 'rotate(-90deg)' : 'rotate(0deg)'
                                }}
                              >▼</button>
                              <span style={styles.categoryGroupName}>{group.name}</span>
                              <span style={{
                                fontSize: '11px',
                                color: '#9CA3AF',
                                background: 'rgba(255,255,255,0.1)',
                                padding: '2px 8px',
                                borderRadius: '12px'
                              }}>{groupCategories.length} categories</span>
                            </div>
                            <div style={styles.groupActions}>
                              <button onClick={() => handleAddCategory(group)} style={styles.addCategoryButton}>+</button>
                              <button onClick={() => handleEditGroup(group)} style={styles.editGroupButton}>✏️</button>
                              <button onClick={() => handleDeleteGroup(group.id)} style={styles.deleteGroupButton}>✕</button>
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
                                  <tr key={`${categoryKey}-edit`} style={{ ...styles.categoryRow, background: '#1a3a5a' }}>
                                    <td style={styles.categoryCell}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                        <span style={styles.categoryName}>{cat.name}</span>
                                        <div style={styles.categoryActions}>
                                          <button onClick={() => handleArchiveCategory(cat)} style={styles.archiveCategoryButton}>📦</button>
                                          <button onClick={() => handleDeleteCategory(cat.id)} style={styles.deleteCategoryButton}>🗑️</button>
                                        </div>
                                      </div>
                                    </td>
                                    <td style={styles.amountCell}>
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
                                        style={styles.editInput}
                                        step="0.01"
                                        min="0"
                                        placeholder="0.00"
                                      />
                                    </td>
                                    <td style={styles.amountCell}>{formatCurrency(cat.activity || 0)}</td>
                                    <td style={styles.amountCell}>{formatCurrency(cat.available || 0)}</td>
                                    <td style={styles.progressCell}>
                                      <select
                                        value={editCategoryData.target_type}
                                        onChange={(e) => setEditCategoryData({ ...editCategoryData, target_type: e.target.value })}
                                        style={styles.editSelect}
                                      >
                                        <option value="monthly">Monthly</option>
                                        <option value="balance">Balance</option>
                                        <option value="by_date">By Date</option>
                                        {cat.is_loan_payment_category && (
                                          <option value="monthly_debt_payment">🏦 Monthly Debt Payment (Loan)</option>
                                        )}
                                      </select>
                                      <input
                                        type="number"
                                        value={editCategoryData.target_amount === 0 ? '' : editCategoryData.target_amount}
                                        onChange={(e) => setEditCategoryData({
                                          ...editCategoryData,
                                          target_amount: e.target.value === '' ? 0 : parseFloat(e.target.value)
                                        })}
                                        style={{ ...styles.editInput, marginTop: '4px' }}
                                        placeholder="Target amount"
                                        step="0.01"
                                        min="0"
                                      />
                                    </td>
                                    <td style={styles.amountCell}>
                                      <div style={styles.editActions}>
                                        <button onClick={() => handleSaveCategoryEdit(cat.id)} style={styles.saveEditButton} title="Save">✅</button>
                                        <button onClick={handleCancelEdit} style={styles.cancelEditButton} title="Cancel">❌</button>
                                      </div>
                                    </td>
                                  </tr>
                                );
                              }

                              return (
                                <tr key={categoryKey} style={styles.categoryRow}>
                                  <td style={styles.categoryCell}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                      <span style={styles.categoryName}>{cat.name}</span>
                                      <div style={styles.categoryActions}>
                                        <button onClick={() => handleEditCategory(cat)} style={styles.editCategoryButton} title="Edit category">✏️</button>
                                        <button onClick={() => handleSetGoal(cat)} style={styles.goalButton} title="Set goal">🎯</button>
                                        <button onClick={() => handleArchiveCategory(cat)} style={styles.archiveCategoryButton} title="Archive category">📦</button>
                                        <button onClick={() => handleDeleteCategory(cat.id)} style={styles.deleteCategoryButton} title="Delete category">🗑️</button>
                                      </div>
                                      {hasTarget && (
                                        <span style={styles.targetIndicator} title={getGoalTooltip(cat)}>
                                          {targetInfo.status === 'funded' || targetInfo.status === 'completed' ? '✅' : '🎯'}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td style={styles.amountCell}>
                                    <div>{formatCurrency(cat.assigned || 0)}</div>
                                    {hasTarget && targetInfo.status === 'partial' && (
                                      <div style={{ fontSize: '11px', color: '#F59E0B' }}>
                                        Need ${targetInfo.needed?.toFixed(0)} more
                                      </div>
                                    )}
                                    {hasTarget && targetInfo.status === 'unfunded' && (
                                      <div style={{ fontSize: '11px', color: '#EF4444' }}>
                                        Unfunded - ${targetInfo.needed?.toFixed(0)} needed
                                      </div>
                                    )}
                                  </td>
                                  <td style={styles.amountCell}>
                                    {formatCurrency(cat.activity || 0)}
                                  </td>
                                  <td style={{
                                    ...styles.amountCell,
                                    color: (cat.available || 0) < 0 ? '#F87171' : (cat.available || 0) === 0 ? '#F59E0B' : '#4ADE80',
                                    fontWeight: (cat.available || 0) < 0 ? 'bold' : 'normal'
                                  }}>
                                    {formatCurrency(cat.available || 0)}
                                    {(cat.available || 0) < 0 && (
                                      <div style={{ fontSize: '10px', color: '#F87171', marginTop: '2px' }}>
                                        ⚠️ Overspent - Cover from another category
                                      </div>
                                    )}
                                    {(cat.available || 0) === 0 && (
                                      <div style={{ fontSize: '10px', color: '#F59E0B', marginTop: '2px' }}>
                                        Fully allocated
                                      </div>
                                    )}
                                  </td>
                                  <td style={styles.progressCell}>
                                    {hasTarget ? (
                                      <div style={styles.progressWrapper}>
                                        <div style={styles.progressBarContainer}>
                                          <div style={{
                                            ...styles.progressBarFill,
                                            width: `${Math.min(100, targetInfo.progress || 0)}%`,
                                            backgroundColor: getProgressColor(targetInfo.status)
                                          }} />
                                          <span style={styles.progressText}>
                                            {Math.min(100, Math.round(targetInfo.progress || 0))}%
                                          </span>
                                        </div>
                                        {targetInfo.status === 'partial' && (
                                          <div style={styles.progressStatus}>Need {formatCurrency(targetInfo.needed)}</div>
                                        )}
                                        {targetInfo.status === 'unfunded' && (
                                          <div style={styles.progressStatus}>Not funded</div>
                                        )}
                                        {targetInfo.status === 'funded' && (
                                          <div style={{ ...styles.progressStatus, color: '#4ADE80' }}>✅ Funded</div>
                                        )}
                                        {targetInfo.status === 'completed' && (
                                          <div style={{ ...styles.progressStatus, color: '#4ADE80' }}>🎉 Achieved</div>
                                        )}
                                        {targetInfo.status === 'in-progress' && targetInfo.monthlyNeeded && (
                                          <div style={styles.progressStatus}>${targetInfo.monthlyNeeded.toFixed(0)}/month</div>
                                        )}
                                      </div>
                                    ) : (
                                      <div style={styles.noGoalIndicator}>—</div>
                                    )}
                                  </td>
                                  <td style={styles.goalCell}>
                                    {cat.target_amount && cat.target_amount > 0 ? (
                                      <div style={styles.goalTargetWrapper}>
                                        <div style={styles.goalTargetAmount}>
                                          {formatCurrency(cat.target_amount)}
                                        </div>
                                        <div style={styles.goalTypeIndicator}>
                                          {cat.target_type === 'monthly' && '📅 Monthly'}
                                          {cat.target_type === 'balance' && '🎯 Balance'}
                                          {cat.target_type === 'by_date' && '⏰ By Date'}
                                          {cat.target_type === 'monthly_debt_payment' && '🏦 Monthly Debt Payment'}
                                          {cat.target_date && cat.target_type === 'by_date' && (
                                            <span style={styles.goalDateSmall}>
                                              {new Date(cat.target_date).toLocaleDateString()}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div style={styles.noGoalCell}>
                                        <button
                                          onClick={() => handleSetGoal(cat)}
                                          style={styles.quickSetGoalButton}
                                        >
                                          + Set Goal
                                        </button>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              );
                            })
                          ) : (
                            <tr key={`empty-${group.id}-${groupIndex}`} style={styles.emptyGroupRow}>
                              <td colSpan="6" style={styles.emptyGroupCell}>No categories in this group</td>
                            </tr>
                          )}
                          {groupCategories.length > 0 && (
                            <tr key={`total-${group.id}-${groupIndex}`} style={styles.groupTotalRow}>
                              <td style={styles.groupTotalCell}><strong>{group.name} Total</strong></td>
                              <td style={styles.groupTotalAmount}><strong>{formatCurrency(getGroupTotals(group.id).assigned)}</strong></td>
                              <td style={styles.groupTotalAmount}><strong>{formatCurrency(getGroupTotals(group.id).activity)}</strong></td>
                              <td style={styles.groupTotalAmount}><strong>{formatCurrency(getGroupTotals(group.id).available)}</strong></td>
                              <td style={styles.groupTotalCell}><strong>{formatCurrency(getGroupTotals(group.id).underfunded)} underfunded</strong></td>
                              <td style={styles.groupTotalCell}>—</td>
                            </tr>
                          )}
                        </React.Fragment>
                      )}
                    </React.Fragment>
                  );
                })}

                <tr style={styles.totalRow}>
                  <td style={styles.totalCell}><strong>Total</strong></td>
                  <td style={styles.totalAmount}><strong>{formatCurrency(budgetData.categories.filter(c => !c.archived).reduce((sum, cat) => sum + (cat.assigned || 0), 0))}</strong></td>
                  <td style={styles.totalAmount}><strong>{formatCurrency(budgetData.categories.filter(c => !c.archived).reduce((sum, cat) => sum + (cat.activity || 0), 0))}</strong></td>
                  <td style={styles.totalAmount}><strong>{formatCurrency(budgetData.categories.filter(c => !c.archived).reduce((sum, cat) => sum + (cat.available || 0), 0))}</strong></td>
                  <td style={styles.totalCell}>—</td>
                  <td style={styles.totalCell}>—</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div style={styles.rightColumn}>
        <SummaryView
          totalAvailable={budgetSummary.totalAvailable}
          totalActivity={budgetSummary.totalActivity}
          totalAssigned={budgetSummary.totalAssigned}
          unassigned={budgetSummary.unassigned}
          categories={budgetData.categories || []}
          onAutoAssign={handleAutoAssign}
          underfundedTotal={getTotalUnderfunded()}
        />

        <div style={{ color: "#F87171", marginTop: 8 }}>Underfunded: {formatCurrency(getTotalUnderfunded())}</div>
        <AutoAssignView readyToAssign={budgetSummary.unassigned} underfundedTotal={getTotalUnderfunded()} underfundedCategories={calculateUnderfundedCategories()} />
        <FutureMonthsView futureAssignments={2340.50} nextMonthTarget={5000} monthsAhead={1.5} />
      </div>

      {/* Archived Categories Modal */}
      {showArchivedModal && (
        <div style={styles.modalOverlay} onClick={() => setShowArchivedModal(false)}>
          <div style={{ ...styles.modalContent, maxWidth: '600px' }} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Archived Categories</h3>
            <p style={{ color: '#9CA3AF', marginBottom: '1rem' }}>Archived categories are hidden from your budget but can be restored at any time.</p>
            {archivedCategories.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: '#6B7280' }}>No archived categories</div>
            ) : (
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {archivedCategories.map(cat => (
                  <div key={cat.id} style={{ padding: '1rem', borderBottom: '1px solid #374151', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 'bold', color: 'white' }}>{cat.name}</div>
                      <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                        Original group: {categoryGroups.find(g => g.id === cat.original_group_id)?.name || 'Unknown'}
                        | Archived: {new Date(cat.archived_at || Date.now()).toLocaleDateString()}
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

      {/* Add Income Modal */}
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

      {/* Record Payment Modal */}
      {showRecordPaymentModal && (
        <div style={styles.modalOverlay} onClick={() => setShowRecordPaymentModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Record Payment</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Amount</label>
              <input type="number" style={styles.input} value={paymentData.amount} onChange={(e) => setPaymentData({ ...paymentData, amount: e.target.value })} placeholder="0.00" step="0.01" min="0" autoFocus />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Category</label>
              <select style={styles.select} value={paymentData.categoryId} onChange={(e) => setPaymentData({ ...paymentData, categoryId: e.target.value })}>
                <option value="">Select a category</option>
                {budgetData.categories.filter(c => !c.archived).map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name} ({formatCurrency(cat.available)} available)</option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Payee</label>
              <input type="text" style={styles.input} value={paymentData.payee} onChange={(e) => setPaymentData({ ...paymentData, payee: e.target.value })} placeholder="Store name, bill payee, etc." />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date</label>
              <input type="date" style={styles.input} value={paymentData.date} onChange={(e) => setPaymentData({ ...paymentData, date: e.target.value })} />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Memo (Optional)</label>
              <input type="text" style={styles.input} value={paymentData.memo} onChange={(e) => setPaymentData({ ...paymentData, memo: e.target.value })} placeholder="Additional details" />
            </div>
            <div style={styles.modalActions}>
              <button style={styles.saveButton} onClick={handleRecordPayment}>Record Payment</button>
              <button style={styles.cancelButton} onClick={() => setShowRecordPaymentModal(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Move Money Modal */}
      {showMoveMoneyModal && (
        <div style={styles.modalOverlay} onClick={() => setShowMoveMoneyModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Move Money Between Categories</h3>
            <div style={styles.formGroup}><label style={styles.label}>Amount</label><input type="number" style={styles.input} value={moveMoneyData.amount} onChange={(e) => setMoveMoneyData({ ...moveMoneyData, amount: e.target.value })} placeholder="0.00" step="0.01" min="0" autoFocus /></div>
            <div style={styles.formGroup}>
              <label style={styles.label}>From Category</label>
              <select style={styles.select} value={moveMoneyData.fromCategoryId} onChange={(e) => setMoveMoneyData({ ...moveMoneyData, fromCategoryId: e.target.value })}>
                <option value="">Select source category</option>
                {budgetData.categories.filter(c => !c.archived && (c.available || 0) > 0).map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name} ({formatCurrency(cat.available)} available)</option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>To Category</label>
              <select style={styles.select} value={moveMoneyData.toCategoryId} onChange={(e) => setMoveMoneyData({ ...moveMoneyData, toCategoryId: e.target.value })}>
                <option value="">Select destination category</option>
                {budgetData.categories.filter(c => !c.archived && c.id !== moveMoneyData.fromCategoryId).map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div style={styles.modalActions}><button style={styles.saveButton} onClick={handleMoveMoney}>Move Money</button><button style={styles.cancelButton} onClick={() => setShowMoveMoneyModal(false)}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Add Group Modal */}
      {showAddGroupModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddGroupModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Create New Category Group</h3>
            <div style={styles.formGroup}><label style={styles.label}>Group Name</label><input type="text" style={styles.input} value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g., Housing, Transportation, Savings Goals" autoFocus /></div>
            <div style={styles.modalActions}><button style={styles.saveButton} onClick={handleCreateGroup}>Create Group</button><button style={styles.cancelButton} onClick={() => { setShowAddGroupModal(false); setNewGroupName(''); }}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Edit Group Modal */}
      {showEditGroupModal && editingGroup && (
        <div style={styles.modalOverlay} onClick={() => setShowEditGroupModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Edit Category Group</h3>
            <div style={styles.formGroup}><label style={styles.label}>Group Name</label><input type="text" style={styles.input} value={editGroupName} onChange={(e) => setEditGroupName(e.target.value)} autoFocus /></div>
            <div style={styles.modalActions}><button style={styles.saveButton} onClick={handleUpdateGroup}>Save Changes</button><button style={styles.cancelButton} onClick={() => { setShowEditGroupModal(false); setEditingGroup(null); setEditGroupName(''); }}>Cancel</button></div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategoryModal && selectedGroupForCategory && (
        <div style={styles.modalOverlay} onClick={() => setShowAddCategoryModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Category to {selectedGroupForCategory.name}</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Category Name</label>
              <input type="text" style={styles.input} value={newCategoryData.name} onChange={(e) => setNewCategoryData({ ...newCategoryData, name: e.target.value })} placeholder="e.g., Groceries, Rent, Savings" autoFocus />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Initial Assigned Amount (Optional)</label>
              <input type="number" style={styles.input} value={newCategoryData.assigned === 0 ? '' : newCategoryData.assigned} onChange={(e) => { const val = e.target.value === '' ? 0 : parseFloat(e.target.value); setNewCategoryData({ ...newCategoryData, assigned: isNaN(val) ? 0 : val }); }} placeholder="0.00" step="0.01" min="0" />
            </div>
            <div style={styles.modalActions}>
              <button style={styles.saveButton} onClick={handleCreateCategory}>Create Category</button>
              <button style={styles.cancelButton} onClick={() => { setShowAddCategoryModal(false); setNewCategoryData({ name: '', assigned: 0, groupId: null }); setSelectedGroupForCategory(null); }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Set Goal Modal */}
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
};

// ==================== STYLES ====================
const styles = {
  container: {
    display: 'flex',
    height: '100vh',
    backgroundColor: '#2563EB',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    overflow: 'hidden'
  },
  budgetTableContainer: {
    flex: 3,
    overflowY: 'auto',
    padding: '24px',
    borderRight: '1px solid #334155',
    backgroundColor: '#2563EB'
  },
  rightColumn: {
    flex: 1.2,
    padding: '24px',
    overflowY: 'auto',
    backgroundColor: '#1E3A8A',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '24px',
    flexWrap: 'wrap',
    gap: '16px'
  },
  titleSection: {
    flex: 1
  },
  title: {
    fontSize: '28px',
    fontWeight: '700',
    background: 'linear-gradient(135deg, #60A5FA, #A78BFA)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
    margin: 0
  },
  description: {
    color: '#CBD5E1',
    fontSize: '14px',
    marginTop: '4px'
  },
  controlsRow: {
    display: 'flex',
    gap: '12px',
    alignItems: 'center',
    flexWrap: 'wrap'
  },
  monthSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    backgroundColor: '#1E3A8A',
    padding: '6px 12px',
    borderRadius: '12px'
  },
  monthNavButton: {
    backgroundColor: '#334155',
    border: 'none',
    color: '#FFFFFF',
    fontSize: '16px',
    cursor: 'pointer',
    padding: '4px 10px',
    borderRadius: '8px',
    transition: 'all 0.2s'
  },
  currentMonth: {
    color: '#FFFFFF',
    fontWeight: '500',
    minWidth: '140px',
    textAlign: 'center'
  },
  addGroupButton: {
    backgroundColor: '#1E3A8A',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '14px',
    transition: 'background 0.2s'
  },
  archiveButton: {
    padding: '0.5rem 1rem',
    background: '#8B5CF6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '14px',
    fontWeight: '500'
  },
  quickBudgetTools: {
    display: 'flex',
    gap: '8px',
    marginLeft: 'auto'
  },
  quickBudgetButton: {
    padding: '6px 12px',
    borderRadius: '6px',
    fontSize: '12px',
    fontWeight: '500',
    border: 'none',
    cursor: 'pointer',
    transition: 'opacity 0.2s'
  },
  unassignedCard: {
    backgroundColor: '#1E3A8A',
    borderRadius: '16px',
    padding: '20px',
    marginBottom: '24px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    border: '1px solid #334155'
  },
  unassignedIcon: {
    fontSize: '32px'
  },
  unassignedContent: {
    flex: 1
  },
  unassignedLabel: {
    color: '#94A3B8',
    fontSize: '14px',
    marginBottom: '4px'
  },
  unassignedValue: {
    fontSize: '28px',
    fontWeight: '700',
    color: 'white'
  },
  unassignedSubtext: {
    color: '#64748B',
    fontSize: '12px',
    marginTop: '4px'
  },
  tableContainer: {
    overflowX: 'auto',
    borderRadius: '12px',
    border: '1px solid #334155',
    backgroundColor: '#2563EB'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    backgroundColor: '#2563EB'
  },
  tableHead: {
    backgroundColor: '#2563EB'
  },
  warningBanner: {
    backgroundColor: '#7F1D1D',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '20px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    border: '1px solid #F87171'
  },
  warningIcon: {
    fontSize: '24px'
  },
  warningContent: {
    flex: 1
  },
  warningText: {
    fontSize: '12px',
    color: '#FCA5A5',
    marginTop: '4px'
  },
  warningButton: {
    padding: '6px 12px',
    backgroundColor: '#EF4444',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    fontWeight: '500'
  },
  tableHeader: {
    padding: '12px 16px',
    textAlign: 'left',
    color: '#94A3B8',
    fontSize: '12px',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    borderBottom: '1px solid #1E3A8A'
  },
  categoryGroupRow: {
    backgroundColor: '#1E3A8A'
  },
  categoryGroupCell: {
    padding: '12px 16px',
    borderBottom: '1px solid #1E3A8A'
  },
  groupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  categoryGroupName: {
    fontWeight: '600',
    color: '#FFFFFF',
    fontSize: '16px'
  },
  groupActions: {
    display: 'flex',
    gap: '8px'
  },
  addCategoryButton: {
    backgroundColor: '#10B981',
    border: 'none',
    color: 'white',
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  editGroupButton: {
    backgroundColor: '#1E3A8A',
    border: 'none',
    color: 'white',
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  deleteGroupButton: {
    backgroundColor: '#EF4444',
    border: 'none',
    color: 'white',
    width: '24px',
    height: '24px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  categoryRow: {
    borderBottom: '1px solid #334155',
    transition: 'background 0.2s'
  },
  categoryCell: {
    padding: '12px 16px'
  },
  categoryName: {
    color: '#FFFFFF',
    fontSize: '14px',
    fontWeight: '500'
  },
  categoryActions: {
    display: 'inline-flex',
    gap: '6px',
    marginLeft: '12px'
  },
  editCategoryButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '2px 4px',
    borderRadius: '4px'
  },
  goalButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '2px 4px',
    borderRadius: '4px'
  },
  deleteCategoryButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '2px 4px',
    borderRadius: '4px'
  },
  archiveCategoryButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '14px',
    padding: '2px 4px',
    borderRadius: '4px'
  },
  targetIndicator: {
    fontSize: '12px',
    marginLeft: '8px'
  },
  amountCell: {
    padding: '12px 16px',
    textAlign: 'right',
    color: '#FFFFFF',
    fontSize: '14px'
  },
  progressCell: {
    padding: '12px 16px',
    width: '140px',
    minWidth: '140px',
    maxWidth: '140px',
    verticalAlign: 'middle',
  },
  progressWrapper: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    width: '100%',
  },
  progressBarContainer: {
    backgroundColor: '#1E3A8A',
    borderRadius: '10px',
    height: '20px',
    position: 'relative',
    overflow: 'hidden',
    width: '100%',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: '10px',
    transition: 'width 0.3s ease'
  },
  progressText: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    fontSize: '10px',
    fontWeight: 'bold',
    color: '#FFFFFF',
    whiteSpace: 'nowrap',
  },
  progressStatus: {
    fontSize: '10px',
    color: '#F59E0B',
    textAlign: 'center',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  groupTotalRow: {
    backgroundColor: '#1E3A8A',
    borderTop: '1px solid #334155'
  },
  groupTotalCell: {
    padding: '10px 16px',
    color: '#94A3B8',
    fontSize: '13px'
  },
  groupTotalAmount: {
    padding: '10px 16px',
    textAlign: 'right',
    color: '#FFFFFF',
    fontSize: '13px'
  },
  emptyGroupRow: {
    backgroundColor: '#1E3A8A'
  },
  emptyGroupCell: {
    padding: '24px',
    textAlign: 'center',
    color: '#64748B',
    fontStyle: 'italic'
  },
  totalRow: {
    backgroundColor: '#1E3A8A',
    borderTop: '2px solid #334155'
  },
  totalCell: {
    padding: '14px 16px',
    fontWeight: '700',
    color: '#FFFFFF',
    fontSize: '14px'
  },
  totalAmount: {
    padding: '14px 16px',
    textAlign: 'right',
    fontWeight: '700',
    color: '#60A5FA',
    fontSize: '14px'
  },
  editInput: {
    backgroundColor: '#1E3A8A',
    border: '1px solid #4B5563',
    color: '#FFFFFF',
    padding: '6px 8px',
    borderRadius: '6px',
    fontSize: '13px',
    width: '100px',
    textAlign: 'right'
  },
  editSelect: {
    backgroundColor: '#1E3A8A',
    border: '1px solid #4B5563',
    color: '#FFFFFF',
    padding: '6px 8px',
    borderRadius: '6px',
    fontSize: '12px',
    width: '100%',
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
    cursor: 'pointer',
    fontSize: '16px'
  },
  cancelEditButton: {
    background: 'none',
    border: 'none',
    cursor: 'pointer',
    fontSize: '16px'
  },
  loading: {
    textAlign: 'center',
    padding: '48px',
    color: '#94A3B8'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    backgroundColor: '#1E3A8A',
    borderRadius: '16px',
    padding: '24px',
    width: '90%',
    maxWidth: '500px',
    border: '1px solid #334155'
  },
  modalTitle: {
    color: '#FFFFFF',
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '20px'
  },
  formGroup: {
    marginBottom: '16px'
  },
  label: {
    display: 'block',
    color: '#94A3B8',
    fontSize: '13px',
    marginBottom: '6px',
    fontWeight: '500'
  },
  input: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#1E3A8A',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#FFFFFF',
    fontSize: '14px',
    boxSizing: 'border-box'
  },
  select: {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: '#1E3A8A',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#FFFFFF',
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
    backgroundColor: '#10B981',
    color: 'white',
    border: 'none',
    padding: '8px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500'
  },
  cancelButton: {
    backgroundColor: '#EF4444',
    color: 'white',
    border: 'none',
    padding: '8px 20px',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500'
  },
  restoreButton: {
    padding: '6px 12px',
    background: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: '500'
  },
  goalCell: {
    padding: '12px 16px',
    width: '120px',
    minWidth: '120px',
    maxWidth: '120px',
    verticalAlign: 'middle',
  },
  goalTargetWrapper: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    width: '100%',
  },
  goalTargetAmount: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#60A5FA',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  goalTypeIndicator: {
    fontSize: '10px',
    color: '#94A3B8',
    textAlign: 'center',
    whiteSpace: 'nowrap',
  },
  goalDateSmall: {
    fontSize: '9px',
    color: '#F59E0B',
    marginLeft: '4px',
  },
  goalInfo: {
    fontSize: '12px',
    color: '#94A3B8'
  },
  goalTarget: {
    fontWeight: '500',
    color: '#60A5FA',
    marginBottom: '4px'
  },
  goalDate: {
    fontSize: '11px',
    color: '#F59E0B'
  },
  goalBalance: {
    fontSize: '11px',
    color: '#4ADE80'
  },
  goalShortfall: {
    fontSize: '11px',
    color: '#EF4444'
  },
  monthlyNeeded: {
    fontSize: '10px',
    color: '#F59E0B',
    marginTop: '2px'
  },
  goalDetailText: {
    fontSize: '11px',
    marginTop: '4px',
    color: '#94A3B8'
  },
  noGoalIndicator: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px'
  },
  quickSetGoalButton: {
    background: 'none',
    border: '1px dashed #4B5563',
    color: '#60A5FA',
    fontSize: '10px',
    padding: '2px 8px',
    borderRadius: '12px',
    cursor: 'pointer',
    transition: 'all 0.2s'
  },
  noGoalCell: {
    color: '#64748B',
    textAlign: 'center',
    fontSize: '14px'
  },
  goalSummaryCard: {
    backgroundColor: '#1E3A8A',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid #334155',
    marginBottom: '20px'
  },
  goalSummaryTitle: {
    color: '#FFFFFF',
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '12px'
  },
  goalSummaryStats: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px'
  },
  goalSummaryProgress: {
    marginBottom: '8px'
  },
  goalSummaryLabel: {
    color: '#94A3B8',
    fontSize: '12px',
    marginBottom: '4px'
  },
  goalSummaryPercentage: {
    color: '#8B5CF6',
    fontSize: '24px',
    fontWeight: '700',
    marginBottom: '8px'
  },
  goalSummaryBreakdown: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '12px 0',
    borderTop: '1px solid #334155',
    borderBottom: '1px solid #334155'
  },
  goalStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    fontSize: '12px',
    color: '#94A3B8'
  },
  goalSummaryTotal: {
    fontSize: '12px',
    color: '#60A5FA',
    textAlign: 'center',
    paddingTop: '8px'
  }
};

export default PropertyMapView;