// src/pages/mobile-budget.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import DatabaseProxy from '../services/databaseProxy.mjs';

export default function MobileBudget() {
  const [categories, setCategories] = useState([]);
  const [categoryGroups, setCategoryGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [readyToAssign, setReadyToAssign] = useState(1240.50);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [showAddGroupModal, setShowAddGroupModal] = useState(false);
  const [showAddCategoryModal, setShowAddCategoryModal] = useState(false);
  const [showEditGroupModal, setShowEditGroupModal] = useState(false);
  const [showEditCategoryModal, setShowEditCategoryModal] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [editingCategory, setEditingCategory] = useState(null);
  const [newGroupName, setNewGroupName] = useState('');
  const [editGroupName, setEditGroupName] = useState('');
  const [newCategoryData, setNewCategoryData] = useState({
    name: '',
    groupId: '',
    targetAmount: '',
    targetType: 'monthly',
    targetDate: '',
    assigned: 0
  });
  const [showSummaryView, setShowSummaryView] = useState(false);
  const [showAutoAssign, setShowAutoAssign] = useState(false);

  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    loadBudgetData();
  }, []);


  const loadBudgetData = async () => {
    setIsLoading(true);
    try {
      // Load categories
      const categoriesResult = await DatabaseProxy.getCategories(user?.id);
      if (categoriesResult?.success) {
        setCategories(categoriesResult.data || []);
      }

      // Load category groups
      const groupsResult = await DatabaseProxy.getCategoryGroups(user?.id);
      if (groupsResult?.success) {
        setCategoryGroups(groupsResult.data || []);

        // Initialize all groups as expanded
        const initialExpanded = {};
        groupsResult.data.forEach(group => {
          initialExpanded[group.id] = true;
        });
        setExpandedGroups(initialExpanded);
      }
    } catch (error) {
      console.error('Error loading budget data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  const getCategoriesByGroup = (groupId) => {
    return categories.filter(c => c.group_id === groupId);
  };

  const getGroupTotal = (groupId) => {
    const groupCategories = getCategoriesByGroup(groupId);
    return groupCategories.reduce((sum, cat) => sum + (cat.assigned || 0), 0);
  };

  const calculateTargetProgress = (category) => {
    if (!category.target_amount || category.target_amount === 0) {
      return { progress: 0, status: 'no-target', needed: 0 };
    }

    const progress = ((category.assigned || 0) / category.target_amount) * 100;
    const needed = Math.max(0, category.target_amount - (category.assigned || 0));

    return { progress, needed, status: progress >= 100 ? 'funded' : 'partial' };
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatCompact = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
    return `$${amount.toFixed(0)}`;
  };

  const monthName = selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  // Handle Group CRUD
  const handleAddGroup = async () => {
    if (!newGroupName.trim()) {
      alert('Please enter a group name');
      return;
    }

    try {
      console.log('📝 Adding group with data:', {
        user_id: user?.id,
        name: newGroupName,
        sort_order: categoryGroups.length
      });

      const groupData = {
        user_id: user?.id,
        name: newGroupName,
        sort_order: categoryGroups.length
      };

      const result = await DatabaseProxy.createCategoryGroup(groupData);

      console.log('📝 DatabaseProxy result:', result);

      if (result?.success) {
        console.log('✅ Group added successfully, reloading data...');
        await loadBudgetData();
        setShowAddGroupModal(false);
        setNewGroupName('');
        alert('✅ Group added successfully!');
      } else {
        console.error('❌ Failed to add group:', result?.error || 'Unknown error');
        alert('❌ Failed to add group: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('❌ Exception in handleAddGroup:', error);
      alert('Error adding group: ' + error.message);
    }
  };

  const handleEditGroup = async () => {
    if (!editGroupName.trim() || !selectedGroup) return;

    try {
      const result = await DatabaseProxy.updateCategoryGroup(selectedGroup.id, user?.id, {
        name: editGroupName
      });

      if (result?.success) {
        await loadBudgetData();
        setShowEditGroupModal(false);
        setSelectedGroup(null);
        setEditGroupName('');
      }
    } catch (error) {
      console.error('Error updating group:', error);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm('Are you sure you want to delete this group? Categories will be moved to Uncategorized.')) return;

    try {
      const result = await DatabaseProxy.deleteCategoryGroup(groupId, user?.id);
      if (result?.success) {
        await loadBudgetData();
      }
    } catch (error) {
      console.error('Error deleting group:', error);
    }
  };

  // Handle Category CRUD
  const handleAddCategory = async () => {
    if (!newCategoryData.name.trim() || !newCategoryData.groupId) return;

    try {
      const result = await DatabaseProxy.createCategory({
        user_id: user?.id,
        name: newCategoryData.name,
        group_id: newCategoryData.groupId,
        target_amount: parseFloat(newCategoryData.targetAmount) || 0,
        target_type: newCategoryData.targetType,
        target_date: newCategoryData.targetDate || null,
        assigned: parseFloat(newCategoryData.assigned) || 0
      });

      if (result?.success) {
        await loadBudgetData();
        setShowAddCategoryModal(false);
        setNewCategoryData({
          name: '',
          groupId: '',
          targetAmount: '',
          targetType: 'monthly',
          targetDate: '',
          assigned: 0
        });
      }
    } catch (error) {
      console.error('Error adding category:', error);
    }
  };

  const handleEditCategory = async () => {
    if (!editingCategory) return;

    try {
      const result = await DatabaseProxy.updateCategory(editingCategory.id, {
        name: newCategoryData.name,
        group_id: newCategoryData.groupId,
        target_amount: parseFloat(newCategoryData.targetAmount) || 0,
        target_type: newCategoryData.targetType,
        target_date: newCategoryData.targetDate || null,
        assigned: parseFloat(newCategoryData.assigned) || 0
      });

      if (result?.success) {
        await loadBudgetData();
        setShowEditCategoryModal(false);
        setEditingCategory(null);
      }
    } catch (error) {
      console.error('Error updating category:', error);
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!confirm('Are you sure you want to delete this category?')) return;

    try {
      const result = await DatabaseProxy.deleteCategory(categoryId);
      if (result?.success) {
        await loadBudgetData();
      }
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  // Auto-assign function
  const handleAutoAssign = (method) => {
    if (readyToAssign <= 0) {
      alert('No funds available to assign');
      return;
    }

    setShowAutoAssign(false);

    // Simple auto-assign logic
    const underfunded = categories.filter(c => {
      const targetInfo = calculateTargetProgress(c);
      return targetInfo.needed > 0;
    });

    if (underfunded.length === 0) {
      alert('No underfunded categories found');
      return;
    }

    // Distribute readyToAssign evenly
    const amountPerCategory = readyToAssign / underfunded.length;

    alert(`✅ Auto-assigned ${formatCurrency(readyToAssign)} to ${underfunded.length} categories`);
    // In a real app, you'd update the categories here
  };

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Loading ProsperityMap...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => router.back()} style={styles.backButton}>
          ←
        </button>
        <h1 style={styles.title}>📊 ProsperityMap</h1>
        <button style={styles.menuButton} onClick={() => setShowSummaryView(!showSummaryView)}>
          {showSummaryView ? '📋' : '📊'}
        </button>
      </div>

      {/* Month Selector and Ready to Assign */}
      <div style={styles.controlsRow}>
        <div style={styles.monthSelector}>
          <button style={styles.monthNavButton} onClick={() => {
            const newDate = new Date(selectedMonth);
            newDate.setMonth(selectedMonth.getMonth() - 1);
            setSelectedMonth(newDate);
          }}>←</button>
          <span style={styles.currentMonth}>{monthName}</span>
          <button style={styles.monthNavButton} onClick={() => {
            const newDate = new Date(selectedMonth);
            newDate.setMonth(selectedMonth.getMonth() + 1);
            setSelectedMonth(newDate);
          }}>→</button>
        </div>

        <div style={styles.readyToAssignCard}>
          <div>
            <span style={styles.readyLabel}>Ready to Assign</span>
            <span style={styles.readyAmount}>{formatCurrency(readyToAssign)}</span>
          </div>
          <button style={styles.assignButton} onClick={() => setShowAutoAssign(true)}>Assign</button>
        </div>
      </div>

      {/* Summary View Toggle */}
      {showSummaryView ? (
        <div style={styles.summaryView}>
          <h3 style={styles.summaryTitle}>Budget Summary</h3>
          <div style={styles.summaryGrid}>
            <div style={styles.summaryItem}>
              <span>Total Budgeted</span>
              <strong>{formatCurrency(categories.reduce((s, c) => s + (c.assigned || 0), 0))}</strong>
            </div>
            <div style={styles.summaryItem}>
              <span>Total Spent</span>
              <strong style={{ color: '#F87171' }}>
                {formatCurrency(categories.reduce((s, c) => s + Math.abs(c.activity || 0), 0))}
              </strong>
            </div>
            <div style={styles.summaryItem}>
              <span>Available</span>
              <strong style={{ color: '#4ADE80' }}>
                {formatCurrency(categories.reduce((s, c) => s + (c.available || 0), 0))}
              </strong>
            </div>
            <div style={styles.summaryItem}>
              <span>Underfunded</span>
              <strong style={{ color: '#F59E0B' }}>
                {formatCurrency(categories.reduce((s, c) => {
                  const target = calculateTargetProgress(c);
                  return s + target.needed;
                }, 0))}
              </strong>
            </div>
          </div>
        </div>
      ) : (
        /* Category Groups and Categories */
        <div style={styles.categoriesContainer}>
          {/* Add Group Button */}
          <button style={styles.addGroupButton} onClick={() => setShowAddGroupModal(true)}>
            + Add Category Group
          </button>

          {categoryGroups.length === 0 ? (
            <div style={styles.emptyState}>
              <p style={styles.emptyText}>No category groups yet</p>
              <p style={styles.emptySubtext}>Create your first group to start budgeting</p>
            </div>
          ) : (
            categoryGroups.map((group) => {
              const groupCategories = getCategoriesByGroup(group.id);
              const groupTotal = getGroupTotal(group.id);
              const isExpanded = expandedGroups[group.id];

              return (
                <div key={group.id} style={styles.categoryGroup}>
                  {/* Group Header */}
                  <div style={styles.groupHeader} onClick={() => toggleGroup(group.id)}>
                    <div style={styles.groupHeaderLeft}>
                      <span style={styles.expandIcon}>{isExpanded ? '▼' : '▶'}</span>
                      <h3 style={styles.groupName}>{group.name}</h3>
                    </div>
                    <div style={styles.groupHeaderRight}>
                      <span style={styles.groupTotal}>{formatCompact(groupTotal)}</span>
                      <div style={styles.groupActions}>
                        <button style={styles.groupEditButton} onClick={(e) => {
                          e.stopPropagation();
                          setSelectedGroup(group);
                          setEditGroupName(group.name);
                          setShowEditGroupModal(true);
                        }}>✏️</button>
                        <button style={styles.groupDeleteButton} onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteGroup(group.id);
                        }}>🗑️</button>
                      </div>
                    </div>
                  </div>

                  {/* Categories */}
                  {isExpanded && (
                    <div style={styles.categoriesList}>
                      {/* Add Category Button */}
                      <button style={styles.addCategoryButton} onClick={() => {
                        setSelectedGroup(group);
                        setNewCategoryData({ ...newCategoryData, groupId: group.id });
                        setShowAddCategoryModal(true);
                      }}>
                        + Add Category
                      </button>

                      {groupCategories.length === 0 ? (
                        <p style={styles.emptyGroupText}>No categories in this group</p>
                      ) : (
                        groupCategories.map((category) => {
                          const targetInfo = calculateTargetProgress(category);
                          const hasTarget = category.target_amount > 0;
                          const isUnderfunded = targetInfo.needed > 0;

                          return (
                            <div key={category.id} style={styles.categoryItem}>
                              <div style={styles.categoryHeader}>
                                <div style={styles.categoryLeft}>
                                  <span style={styles.categoryName}>{category.name}</span>
                                  {hasTarget && (
                                    <span style={{
                                      ...styles.targetBadge,
                                      color: targetInfo.status === 'funded' ? '#10B981' : '#F59E0B'
                                    }}>
                                      🎯 {formatCompact(category.target_amount)}
                                    </span>
                                  )}
                                </div>
                                <div style={styles.categoryRight}>
                                  <span style={styles.categoryAssigned}>
                                    {formatCompact(category.assigned || 0)}
                                  </span>
                                  <div style={styles.categoryActions}>
                                    <button style={styles.categoryEditButton} onClick={() => {
                                      setEditingCategory(category);
                                      setNewCategoryData({
                                        name: category.name,
                                        groupId: category.group_id,
                                        targetAmount: category.target_amount || '',
                                        targetType: category.target_type || 'monthly',
                                        targetDate: category.target_date || '',
                                        assigned: category.assigned || 0
                                      });
                                      setShowEditCategoryModal(true);
                                    }}>✏️</button>
                                    <button style={styles.categoryDeleteButton} onClick={() => handleDeleteCategory(category.id)}>🗑️</button>
                                  </div>
                                </div>
                              </div>

                              {/* Amounts */}
                              <div style={styles.categoryAmounts}>
                                <div style={styles.amountColumn}>
                                  <span style={styles.amountLabel}>Activity</span>
                                  <span style={{
                                    ...styles.amountValue,
                                    color: (category.activity || 0) < 0 ? '#F87171' : '#4ADE80'
                                  }}>
                                    {formatCompact(category.activity || 0)}
                                  </span>
                                </div>
                                <div style={styles.amountColumn}>
                                  <span style={styles.amountLabel}>Available</span>
                                  <span style={{
                                    ...styles.amountValue,
                                    color: (category.available || 0) < 0 ? '#F87171' : '#4ADE80'
                                  }}>
                                    {formatCompact(category.available || 0)}
                                  </span>
                                </div>
                              </div>

                              {/* Progress Bar */}
                              {hasTarget && (
                                <div style={styles.progressSection}>
                                  <div style={styles.progressBar}>
                                    <div style={{
                                      ...styles.progressFill,
                                      width: `${Math.min(targetInfo.progress, 100)}%`
                                    }} />
                                  </div>
                                  {isUnderfunded && (
                                    <span style={styles.neededText}>
                                      Need {formatCurrency(targetInfo.needed)} more
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Bottom Navigation */}
      <div style={styles.bottomNav}>
        <button style={{ ...styles.navItem, ...(router.pathname === '/mobile-home' ? styles.activeNavItem : {}) }}
          onClick={() => router.push('/mobile-home')}>
          <span style={styles.navIcon}>🏠</span>
          <span style={styles.navLabel}>Home</span>
        </button>
        <button style={{ ...styles.navItem, ...(router.pathname === '/mobile-budget' ? styles.activeNavItem : {}) }}
          onClick={() => router.push('/mobile-budget')}>
          <span style={styles.navIcon}>📊</span>
          <span style={styles.navLabel}>ProsperityMap</span>
        </button>
        <button style={styles.navItem}>
          <span style={styles.navIcon}>➕</span>
          <span style={styles.navLabel}>Add</span>
        </button>
        <button style={{ ...styles.navItem, ...(router.pathname === '/mobile-credit-cards' ? styles.activeNavItem : {}) }}
          onClick={() => router.push('/mobile-credit-cards')}>
          <span style={styles.navIcon}>💳</span>
          <span style={styles.navLabel}>Cards</span>
        </button>
        <button style={{ ...styles.navItem, ...(router.pathname === '/mobile-cashflow' ? styles.activeNavItem : {}) }}
          onClick={() => router.push('/mobile-cashflow')}>
          <span style={styles.navIcon}>💰</span>
          <span style={styles.navLabel}>Cash Flow</span>
        </button>
        <button style={{ ...styles.navItem, ...(router.pathname === '/mobile-settings' ? styles.activeNavItem : {}) }}
          onClick={() => router.push('/mobile-settings')}>
          <span style={styles.navIcon}>⚙️</span>
          <span style={styles.navLabel}>Settings</span>
        </button>
      </div>

      {/* Add Group Modal */}
      {showAddGroupModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddGroupModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Category Group</h3>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="Group name"
              style={styles.modalInput}
              autoFocus
            />
            <div style={styles.modalActions}>
              <button style={styles.modalCancelButton} onClick={() => setShowAddGroupModal(false)}>Cancel</button>
              <button style={styles.modalSaveButton} onClick={handleAddGroup}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Group Modal */}
      {showEditGroupModal && (
        <div style={styles.modalOverlay} onClick={() => setShowEditGroupModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Edit Group</h3>
            <input
              type="text"
              value={editGroupName}
              onChange={(e) => setEditGroupName(e.target.value)}
              placeholder="Group name"
              style={styles.modalInput}
              autoFocus
            />
            <div style={styles.modalActions}>
              <button style={styles.modalCancelButton} onClick={() => setShowEditGroupModal(false)}>Cancel</button>
              <button style={styles.modalSaveButton} onClick={handleEditGroup}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Category Modal */}
      {showAddCategoryModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddCategoryModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Category to {selectedGroup?.name}</h3>

            <input
              type="text"
              value={newCategoryData.name}
              onChange={(e) => setNewCategoryData({ ...newCategoryData, name: e.target.value })}
              placeholder="Category name"
              style={styles.modalInput}
              autoFocus
            />

            <select
              value={newCategoryData.targetType}
              onChange={(e) => setNewCategoryData({ ...newCategoryData, targetType: e.target.value })}
              style={styles.modalSelect}
            >
              <option value="monthly">Monthly Goal</option>
              <option value="balance">Balance Goal</option>
              <option value="by_date">Save by Date</option>
            </select>

            <div style={styles.modalRow}>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Target Amount</label>
                <input
                  type="number"
                  value={newCategoryData.targetAmount}
                  onChange={(e) => setNewCategoryData({ ...newCategoryData, targetAmount: e.target.value })}
                  placeholder="0.00"
                  style={styles.modalInput}
                />
              </div>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Initial Assigned</label>
                <input
                  type="number"
                  value={newCategoryData.assigned}
                  onChange={(e) => setNewCategoryData({ ...newCategoryData, assigned: e.target.value })}
                  placeholder="0.00"
                  style={styles.modalInput}
                />
              </div>
            </div>

            {newCategoryData.targetType === 'by_date' && (
              <input
                type="date"
                value={newCategoryData.targetDate}
                onChange={(e) => setNewCategoryData({ ...newCategoryData, targetDate: e.target.value })}
                style={styles.modalInput}
              />
            )}

            <div style={styles.modalActions}>
              <button style={styles.modalCancelButton} onClick={() => setShowAddCategoryModal(false)}>Cancel</button>
              <button style={styles.modalSaveButton} onClick={handleAddCategory}>Create</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {showEditCategoryModal && (
        <div style={styles.modalOverlay} onClick={() => setShowEditCategoryModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Edit Category</h3>

            <input
              type="text"
              value={newCategoryData.name}
              onChange={(e) => setNewCategoryData({ ...newCategoryData, name: e.target.value })}
              placeholder="Category name"
              style={styles.modalInput}
            />

            <select
              value={newCategoryData.targetType}
              onChange={(e) => setNewCategoryData({ ...newCategoryData, targetType: e.target.value })}
              style={styles.modalSelect}
            >
              <option value="monthly">Monthly Goal</option>
              <option value="balance">Balance Goal</option>
              <option value="by_date">Save by Date</option>
            </select>

            <div style={styles.modalRow}>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Target Amount</label>
                <input
                  type="number"
                  value={newCategoryData.targetAmount}
                  onChange={(e) => setNewCategoryData({ ...newCategoryData, targetAmount: e.target.value })}
                  style={styles.modalInput}
                />
              </div>
              <div style={styles.modalInputGroup}>
                <label style={styles.modalLabel}>Assigned</label>
                <input
                  type="number"
                  value={newCategoryData.assigned}
                  onChange={(e) => setNewCategoryData({ ...newCategoryData, assigned: e.target.value })}
                  style={styles.modalInput}
                />
              </div>
            </div>

            {newCategoryData.targetType === 'by_date' && (
              <input
                type="date"
                value={newCategoryData.targetDate}
                onChange={(e) => setNewCategoryData({ ...newCategoryData, targetDate: e.target.value })}
                style={styles.modalInput}
              />
            )}

            <div style={styles.modalActions}>
              <button style={styles.modalCancelButton} onClick={() => setShowEditCategoryModal(false)}>Cancel</button>
              <button style={styles.modalSaveButton} onClick={handleEditCategory}>Save</button>
            </div>
          </div>
        </div>
      )}

      {/* Auto Assign Modal */}
      {showAutoAssign && (
        <div style={styles.modalOverlay} onClick={() => setShowAutoAssign(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>🤖 Auto-Assign</h3>
            <p style={styles.modalText}>
              Available: {formatCurrency(readyToAssign)}
            </p>
            <p style={styles.modalSubtext}>
              Choose how to distribute funds:
            </p>
            <div style={styles.autoAssignOptions}>
              <button style={styles.autoOption} onClick={() => handleAutoAssign('underfunded')}>
                🎯 Fund Underfunded
              </button>
              <button style={styles.autoOption} onClick={() => handleAutoAssign('evenly')}>
                ⚖️ Split Evenly
              </button>
            </div>
            <button style={styles.modalCancelButton} onClick={() => setShowAutoAssign(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0f2e1c',
    color: 'white',
    paddingBottom: '80px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f2e1c',
    color: 'white',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(255,255,255,0.1)',
    borderTopColor: '#3B82F6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },
  loadingText: {
    fontSize: '16px',
    color: '#9CA3AF',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    paddingTop: '60px',
    background: '#0047AB',
  },
  backButton: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    margin: 0,
  },
  menuButton: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
  },
  controlsRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '16px 20px',
    gap: '12px',
  },
  monthSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    background: '#1F2937',
    padding: '4px',
    borderRadius: '30px',
  },
  monthNavButton: {
    width: '36px',
    height: '36px',
    borderRadius: '18px',
    background: '#374151',
    border: 'none',
    color: 'white',
    fontSize: '16px',
    cursor: 'pointer',
  },
  currentMonth: {
    fontSize: '14px',
    fontWeight: '500',
    minWidth: '140px',
    textAlign: 'center',
  },
  readyToAssignCard: {
    flex: 1,
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
    padding: '8px 16px',
    borderRadius: '30px',
  },
  readyLabel: {
    fontSize: '11px',
    color: 'rgba(255,255,255,0.8)',
    display: 'block',
  },
  readyAmount: {
    fontSize: '16px',
    fontWeight: 'bold',
    color: 'white',
  },
  assignButton: {
    padding: '6px 12px',
    background: 'white',
    border: 'none',
    borderRadius: '20px',
    color: '#D97706',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  summaryView: {
    margin: '0 20px 20px',
    padding: '16px',
    background: '#1F2937',
    borderRadius: '16px',
  },
  summaryTitle: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 12px 0',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
  },
  summaryItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: '8px',
    background: '#111827',
    borderRadius: '8px',
    fontSize: '12px',
  },
  categoriesContainer: {
    padding: '0 20px',
  },
  addGroupButton: {
    width: '100%',
    padding: '14px',
    background: '#1F2937',
    border: '2px dashed #3B82F6',
    borderRadius: '12px',
    color: '#3B82F6',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    marginBottom: '16px',
  },
  emptyState: {
    padding: '40px 20px',
    textAlign: 'center',
    background: '#1F2937',
    borderRadius: '16px',
  },
  emptyText: {
    fontSize: '16px',
    marginBottom: '8px',
  },
  emptySubtext: {
    fontSize: '12px',
    color: '#9CA3AF',
  },
  categoryGroup: {
    marginBottom: '16px',
    background: '#1F2937',
    borderRadius: '12px',
    overflow: 'hidden',
  },
  groupHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '14px',
    background: '#0047AB',
    cursor: 'pointer',
  },
  groupHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  expandIcon: {
    fontSize: '12px',
    color: '#9CA3AF',
  },
  groupName: {
    fontSize: '15px',
    fontWeight: '600',
    margin: 0,
  },
  groupHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  groupTotal: {
    fontSize: '14px',
    fontWeight: '600',
  },
  groupActions: {
    display: 'flex',
    gap: '4px',
  },
  groupEditButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px',
  },
  groupDeleteButton: {
    background: 'none',
    border: 'none',
    color: '#EF4444',
    fontSize: '14px',
    cursor: 'pointer',
    padding: '4px',
  },
  categoriesList: {
    padding: '12px',
  },
  addCategoryButton: {
    width: '100%',
    padding: '10px',
    background: '#111827',
    border: '1px dashed #3B82F6',
    borderRadius: '8px',
    color: '#3B82F6',
    fontSize: '12px',
    cursor: 'pointer',
    marginBottom: '12px',
  },
  emptyGroupText: {
    textAlign: 'center',
    color: '#9CA3AF',
    fontSize: '12px',
    padding: '20px',
  },
  categoryItem: {
    background: '#111827',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '8px',
  },
  categoryHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '8px',
  },
  categoryLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  categoryName: {
    fontSize: '14px',
    fontWeight: '500',
  },
  targetBadge: {
    fontSize: '10px',
    padding: '2px 6px',
    background: '#374151',
    borderRadius: '4px',
  },
  categoryRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  categoryAssigned: {
    fontSize: '14px',
    fontWeight: '600',
  },
  categoryActions: {
    display: 'flex',
    gap: '4px',
  },
  categoryEditButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '4px',
  },
  categoryDeleteButton: {
    background: 'none',
    border: 'none',
    color: '#EF4444',
    fontSize: '12px',
    cursor: 'pointer',
    padding: '4px',
  },
  categoryAmounts: {
    display: 'flex',
    gap: '16px',
    marginBottom: '8px',
  },
  amountColumn: {
    flex: 1,
  },
  amountLabel: {
    fontSize: '10px',
    color: '#9CA3AF',
    display: 'block',
    marginBottom: '2px',
  },
  amountValue: {
    fontSize: '13px',
    fontWeight: '600',
  },
  progressSection: {
    marginTop: '4px',
  },
  progressBar: {
    height: '4px',
    background: '#374151',
    borderRadius: '2px',
    overflow: 'hidden',
    marginBottom: '4px',
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
  },
  neededText: {
    fontSize: '10px',
    color: '#F59E0B',
  },
  bottomNav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'flex-start',
    alignItems: 'center',
    background: '#1F2937',
    padding: '8px 12px',
    paddingBottom: '24px',
    borderTop: '1px solid #374151',
    overflowX: 'auto',
    gap: '16px',
  },
  navItem: {
    flex: '0 0 auto',
    minWidth: '60px',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 8px',
    cursor: 'pointer',
    fontSize: '12px',
  },
  activeNavItem: {
    color: '#3B82F6',
  },
  navIcon: {
    fontSize: '20px',
  },
  navLabel: {
    fontSize: '10px',
    whiteSpace: 'nowrap',
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
    zIndex: 1000,
  },
  modalContent: {
    background: '#1F2937',
    borderRadius: '16px',
    padding: '24px',
    maxWidth: '400px',
    width: '90%',
    maxHeight: '80vh',
    overflowY: 'auto',
  },
  modalTitle: {
    fontSize: '18px',
    fontWeight: '600',
    margin: '0 0 16px 0',
  },
  modalInput: {
    width: '100%',
    padding: '12px',
    marginBottom: '12px',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
  },
  modalSelect: {
    width: '100%',
    padding: '12px',
    marginBottom: '12px',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
  },
  modalRow: {
    display: 'flex',
    gap: '12px',
    marginBottom: '12px',
  },
  modalInputGroup: {
    flex: 1,
  },
  modalLabel: {
    display: 'block',
    fontSize: '11px',
    color: '#9CA3AF',
    marginBottom: '4px',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '8px',
  },
  modalCancelButton: {
    flex: 1,
    padding: '12px',
    background: '#374151',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
  },
  modalSaveButton: {
    flex: 1,
    padding: '12px',
    background: '#3B82F6',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
  },
  modalText: {
    fontSize: '14px',
    marginBottom: '8px',
  },
  modalSubtext: {
    fontSize: '12px',
    color: '#9CA3AF',
    marginBottom: '16px',
  },
  autoAssignOptions: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
  },
  autoOption: {
    flex: 1,
    padding: '12px',
    background: '#111827',
    border: '1px solid #3B82F6',
    borderRadius: '8px',
    color: 'white',
    fontSize: '13px',
    cursor: 'pointer',
  },
};

// Add keyframe animation for spinner
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);
}

