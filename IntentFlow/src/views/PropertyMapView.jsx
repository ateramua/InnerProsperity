// src/views/PropertyMapView.jsx
import React, { useState, useEffect } from 'react';
import SummaryView from './SummaryView';
import AutoAssignView from './AutoAssignView';
import FutureMonthsView from './FutureMonthsView';
// Add near other imports
import useRealtimeUpdates from '../hooks/useRealtimeUpdates';

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
  const [newCategoryData, setNewCategoryData] = useState({
    name: '',
    assigned: 0,
    groupId: null
  });
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
  const [moveMoneyData, setMoveMoneyData] = useState({
    amount: '',
    fromCategoryId: '',
    toCategoryId: ''
  });
  const [userId, setUserId] = useState(2); // Default to user 2 for now

  // Budget summary data - calculated from categories using correct formula
  const [budgetSummary, setBudgetSummary] = useState({
    totalAvailable: 0,
    totalActivity: 0,
    totalAssigned: 0,
    unassigned: 0
  });

  // Sample initial categories
  const [budgetData, setBudgetData] = useState({
    categories: [
      { id: 'cat1', name: 'Housing', assigned: 1500, activity: -1500, available: 0, groupId: 'fixed', priority: 1, target_amount: 1500 },
      { id: 'cat2', name: 'Utilities', assigned: 300, activity: -85.00, available: 215.00, groupId: 'fixed', priority: 1, target_amount: 300 },
      { id: 'cat3', name: 'Transportation', assigned: 400, activity: -120.50, available: 279.50, groupId: 'fixed', priority: 1, target_amount: 400 },
      { id: 'cat4', name: 'Food & Dining', assigned: 800, activity: -450.67, available: 349.33, groupId: 'variable', priority: 2, target_amount: 800 },
      { id: 'cat5', name: 'Entertainment', assigned: 200, activity: -89.99, available: 110.01, groupId: 'variable', priority: 3, target_amount: 200 },
      { id: 'cat6', name: 'Shopping', assigned: 500, activity: -245.78, available: 254.22, groupId: 'variable', priority: 3, target_amount: 500 },
      { id: 'cat7', name: 'Healthcare', assigned: 250, activity: 0, available: 250, groupId: 'variable', priority: 1, target_amount: 250 },
      { id: 'cat8', name: 'Savings', assigned: 1000, activity: 0, available: 1000, groupId: 'savings', priority: 4, target_amount: 1000 },
      { id: 'cat9', name: 'Debt Payment', assigned: 450, activity: -450.32, available: -0.32, groupId: 'debt', priority: 1, target_amount: 450 },
    ]
  });

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

  // Calculate budget summary whenever categories change - CORRECTED FORMULA
  useEffect(() => {
    calculateBudgetSummary();
  }, [budgetData.categories]);

  const calculateBudgetSummary = () => {
    const categories = budgetData.categories;
    
    // Total Available = Sum of (Assigned – Activity) for all categories
    const totalAvailable = categories.reduce((sum, cat) => {
      return sum + ((cat.assigned || 0) + (cat.activity || 0)); // Activity is already negative for expenses
    }, 0);
    
    // Total assigned (sum of all assigned amounts)
    const totalAssigned = categories.reduce((sum, cat) => sum + (cat.assigned || 0), 0);
    
    // Total activity (sum of all activity)
    const totalActivity = categories.reduce((sum, cat) => sum + (cat.activity || 0), 0);
    
    // Unassigned would be totalAvailable - totalAssigned
    const unassigned = totalAvailable - totalAssigned;

    setBudgetSummary({
      totalAvailable,
      totalActivity,
      totalAssigned,
      unassigned
    });
    
    console.log('📊 Budget Summary Calculated:', {
      totalAvailable,
      totalActivity,
      totalAssigned,
      unassigned
    });
  };

  // Update category available amount based on assigned and activity
  const updateCategoryAvailable = (categoryId) => {
    setBudgetData(prev => ({
      ...prev,
      categories: prev.categories.map(cat => 
        cat.id === categoryId 
          ? { ...cat, available: (cat.assigned || 0) + (cat.activity || 0) }
          : cat
      )
    }));
  };

  // ==================== ADD INCOME FUNCTIONALITY ====================
  const handleAddIncome = () => {
    const amount = parseFloat(incomeData.amount);
    if (isNaN(amount) || amount <= 0) {
      alert('Please enter a valid amount');
      return;
    }

    // Add to unassigned funds by creating a temporary income category
    const tempIncomeCategory = {
      id: `income-${Date.now()}`,
      name: 'Ready to Assign',
      assigned: amount,
      activity: 0,
      available: amount,
      groupId: 'income',
      priority: 0
    };
    
    setBudgetData(prev => ({
      ...prev,
      categories: [...prev.categories, tempIncomeCategory]
    }));

    console.log('Income added:', {
      amount,
      date: incomeData.date,
      memo: incomeData.memo
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
  const handleRecordPayment = () => {
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

    // Update the category activity and available
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

  // ==================== AUTO-ASSIGN FUNCTIONALITY ====================
  const handleAutoAssign = (allocations) => {
    // Apply the allocations from the auto-assign preview
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

  const handleCreateCategory = async () => {
    if (!newCategoryData.name.trim()) return;
    
    try {
      const tempId = `temp-cat-${Date.now()}`;
      const newCategory = {
        id: tempId,
        name: newCategoryData.name,
        assigned: newCategoryData.assigned,
        activity: 0,
        available: newCategoryData.assigned,
        groupId: newCategoryData.groupId,
        user_id: userId,
        priority: 2, // Default priority
        target_amount: newCategoryData.assigned
      };
      
      setBudgetData(prev => ({
        ...prev,
        categories: [...prev.categories, newCategory]
      }));
      
      setShowAddCategoryModal(false);
      setNewCategoryData({ name: '', assigned: 0, groupId: null });
      setSelectedGroupForCategory(null);
      
    } catch (error) {
      console.error('Error creating category:', error);
    }
  };

  // Inside the component, add:
const { lastUpdate } = useRealtimeUpdates(['prosperity:updated'], () => {
    // Refresh data
    loadCategoryGroups();
    loadCategories();
    calculateBudgetSummary();
});

// Also listen for manual refresh events
useEffect(() => {
    const handleRefresh = () => {
        loadCategoryGroups();
        loadCategories();
        calculateBudgetSummary();
    };
    
    window.addEventListener('refresh-prosperity-map', handleRefresh);
    
    return () => {
        window.removeEventListener('refresh-prosperity-map', handleRefresh);
    };
}, []);

  // Default groups
  const defaultGroups = [
    { id: 'fixed', name: 'Fixed Expenses' },
    { id: 'variable', name: 'Variable Expenses' },
    { id: 'savings', name: 'Savings Goals' },
    { id: 'debt', name: 'Debt' }
  ];

  useEffect(() => {
    loadCategoryGroups();
    loadCategories();
  }, []);

  const loadCategoryGroups = async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI.getCategoryGroups(userId);
      if (result.success) {
        if (result.data && result.data.length > 0) {
          setCategoryGroups(result.data);
        } else {
          setCategoryGroups(defaultGroups);
        }
      } else {
        setCategoryGroups(defaultGroups);
      }
    } catch (error) {
      console.error('Error loading category groups:', error);
      setCategoryGroups(defaultGroups);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
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

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) return;
    
    try {
      const tempId = `temp-${Date.now()}`;
      const newGroup = {
        id: tempId,
        name: newGroupName,
        user_id: userId
      };
      
      setCategoryGroups(prevGroups => [...prevGroups, newGroup]);
      setShowAddGroupModal(false);
      setNewGroupName('');
      
      try {
        const result = await window.electronAPI.createCategoryGroup(
          userId,
          newGroupName,
          categoryGroups.length
        );
        
        if (result.success && result.data) {
          setCategoryGroups(prevGroups => 
            prevGroups.map(g => 
              g.id === tempId ? result.data : g
            )
          );
        }
      } catch (dbError) {
        console.error('Error saving to database:', dbError);
      }
      
    } catch (error) {
      console.error('Error creating category group:', error);
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

  const handleUpdateGroup = async () => {
    if (!editGroupName.trim() || !editingGroup) return;
    
    try {
      setCategoryGroups(prevGroups => 
        prevGroups.map(g => 
          g.id === editingGroup.id ? { ...g, name: editGroupName } : g
        )
      );
      
      setShowEditGroupModal(false);
      setEditingGroup(null);
      setEditGroupName('');
      
      try {
        await window.electronAPI.updateCategoryGroup(editingGroup.id, userId, {
          name: editGroupName
        });
      } catch (dbError) {
        console.error('Error updating in database:', dbError);
      }
      
    } catch (error) {
      console.error('Error updating category group:', error);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm('Are you sure you want to delete this group?')) return;
    
    try {
      if (editingGroup && editingGroup.id === groupId) {
        setShowEditGroupModal(false);
        setEditingGroup(null);
        setEditGroupName('');
      }
      
      setCategoryGroups(prevGroups => prevGroups.filter(g => g.id !== groupId));
      
      setBudgetData(prev => ({
        ...prev,
        categories: prev.categories.map(cat => 
          cat.groupId === groupId ? { ...cat, groupId: null } : cat
        )
      }));
      
      try {
        await window.electronAPI.deleteCategoryGroup(groupId, userId);
      } catch (dbError) {
        console.error('Error deleting from database:', dbError);
      }
    } catch (error) {
      console.error('Error deleting category group:', error);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const getCategoriesByGroup = (groupId) => {
    return budgetData.categories.filter(c => c.groupId === groupId);
  };

  return (
    <div style={styles.container}>
      {/* Left side - Budget Table */}
      <div style={styles.budgetTableContainer}>
        {/* Header with Month Selector and Unassigned Funds */}
        <div style={styles.header}>
          <div style={styles.titleSection}>
            <h1 style={styles.title}>ProspertyMap</h1>
            <p style={styles.description}>Current month's budget allocation</p>
          </div>
          
          {/* Unassigned Funds Card */}
          <div style={styles.unassignedCard}>
            <div style={styles.unassignedIcon}>💰</div>
            <div style={styles.unassignedContent}>
              <div style={styles.unassignedLabel}>Ready to Assign</div>
              <div style={styles.unassignedValue}>
                {formatCurrency(budgetSummary.unassigned)}
              </div>
              <div style={styles.unassignedSubtext}>
                Available for {new Date().toLocaleString('default', { month: 'long' })}
              </div>
            </div>
          </div>
        </div>
        
        {/* Month Selector and Add Group Button */}
        <div style={styles.controlsRow}>
          <div style={styles.monthSelector}>
            <button style={styles.monthNavButton}>◀</button>
            <span style={styles.currentMonth}>
              {new Date().toLocaleString('default', { month: 'long', year: 'numeric' })}
            </span>
            <button style={styles.monthNavButton}>▶</button>
          </div>
          
          <button 
            style={styles.addGroupButton}
            onClick={() => setShowAddGroupModal(true)}
          >
            + Add Category Group
          </button>
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
                </tr>
              </thead>
              <tbody>
                {categoryGroups.map((group) => {
                  const groupCategories = getCategoriesByGroup(group.id);
                  
                  return (
                    <React.Fragment key={group.id}>
                      {/* Category Group Header */}
                      <tr style={styles.categoryGroupRow}>
                        <td colSpan="4" style={styles.categoryGroupCell}>
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
                        groupCategories.map((cat) => (
                          <tr key={cat.id} style={styles.categoryRow}>
                            <td style={styles.categoryCell}>
                              <span style={styles.categoryName}>{cat.name}</span>
                            </td>
                            <td style={styles.amountCell}>
                              {formatCurrency(cat.assigned || 0)}
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
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr style={styles.emptyGroupRow}>
                          <td colSpan="4" style={styles.emptyGroupCell}>
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
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Right side - Summary View with Smart Auto-Assign */}
      <div style={styles.rightColumn}>
        <SummaryView 
          totalAvailable={budgetSummary.totalAvailable}
          totalActivity={budgetSummary.totalActivity}
          totalAssigned={budgetSummary.totalAssigned}
          unassigned={budgetSummary.unassigned}
          categories={budgetData.categories}
          onAutoAssign={handleAutoAssign}
        />
        
        <AutoAssignView 
          readyToAssign={budgetSummary.unassigned}
        />
        
        <FutureMonthsView 
          futureAssignments={2340.50}
          nextMonthTarget={5000}
          monthsAhead={1.5}
        />
      </div>

      {/* ================ MODALS ================ */}

      {/* Add Income Modal */}
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
                onChange={(e) => setIncomeData({...incomeData, amount: e.target.value})}
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
                onChange={(e) => setIncomeData({...incomeData, date: e.target.value})}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Memo (Optional)</label>
              <input
                type="text"
                style={styles.input}
                value={incomeData.memo}
                onChange={(e) => setIncomeData({...incomeData, memo: e.target.value})}
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

      {/* Record Payment Modal */}
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
                onChange={(e) => setPaymentData({...paymentData, amount: e.target.value})}
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
                onChange={(e) => setPaymentData({...paymentData, categoryId: e.target.value})}
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
                onChange={(e) => setPaymentData({...paymentData, payee: e.target.value})}
                placeholder="Who did you pay?"
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date</label>
              <input
                type="date"
                style={styles.input}
                value={paymentData.date}
                onChange={(e) => setPaymentData({...paymentData, date: e.target.value})}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Memo (Optional)</label>
              <input
                type="text"
                style={styles.input}
                value={paymentData.memo}
                onChange={(e) => setPaymentData({...paymentData, memo: e.target.value})}
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

      {/* Move Money Modal */}
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
                onChange={(e) => setMoveMoneyData({...moveMoneyData, amount: e.target.value})}
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
                onChange={(e) => setMoveMoneyData({...moveMoneyData, fromCategoryId: e.target.value})}
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
                onChange={(e) => setMoveMoneyData({...moveMoneyData, toCategoryId: e.target.value})}
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
    marginBottom: '2rem'
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
  tableContainer: {
    background: '#0f2e1c',
    borderRadius: '0.75rem',
    overflow: 'hidden',
    border: '1px solid #374151'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse'
  },
  tableHead: {
    background: '#0f2e1c'
  },
  tableHeader: {
    padding: '1rem',
    textAlign: 'left',
    color: '#9CA3AF',
    fontWeight: '500',
    fontSize: '0.875rem',
    borderBottom: '2px solid #374151'
  },
  categoryGroupRow: {
    background: '#065f46',
    borderTop: '1px solid #047857',
    borderBottom: '1px solid #047857'
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
    borderBottom: '1px solid #374151'
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
  emptyGroupRow: {
    background: '#0f2e1c'
  },
  emptyGroupCell: {
    padding: '1rem',
    textAlign: 'center',
    color: '#6B7280',
    fontStyle: 'italic'
  },
  totalRow: {
    background: '#0f2e1c',
    borderTop: '2px solid #0f2e1c'
  },
  totalCell: {
    padding: '1rem',
    color: 'white',
    fontWeight: '600'
  },
  totalAmount: {
    padding: '1rem',
    color: 'white',
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
    background: '#1F2937',
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
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    transition: 'all 0.2s ease'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
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
  }
};

export default PropertyMapView;