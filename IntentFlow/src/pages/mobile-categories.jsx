// src/pages/mobile-categories.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import AddTransactionModal from '../components/mobile/AddTransactionModal';
import DatabaseProxy from '../services/databaseProxy.mjs';

export default function MobileCategories() {
  const [categories, setCategories] = useState([]);
  const [categoryGroups, setCategoryGroups] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCategory, setEditingCategory] = useState(null);
  const [expandedGroups, setExpandedGroups] = useState({});
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'hidden', 'with-goals'
  const router = useRouter();
  const { user } = useAuth();

  // Form state for add/edit
  const [formData, setFormData] = useState({
    name: '',
    groupId: '',
    targetAmount: '',
    targetType: 'monthly',
    targetDate: '',
    hidden: false,
    note: ''
  });

  useEffect(() => {
    loadCategoryData();
  }, []);

  const loadCategoryData = async () => {
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
      console.error('Error loading categories:', error);
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

  const handleAddCategory = async () => {
    if (!formData.name.trim() || !formData.groupId) {
      alert('Please enter a name and select a group');
      return;
    }

    try {
      const categoryData = {
        name: formData.name,
        group_id: formData.groupId,
        user_id: user?.id,
        target_amount: formData.targetAmount ? parseFloat(formData.targetAmount) : null,
        target_type: formData.targetType,
        target_date: formData.targetDate || null,
        hidden: formData.hidden ? 1 : 0,
        assigned: 0,
        activity: 0,
        available: 0
      };

const result = await DatabaseProxy.addTransaction(transactionData);
      if (result?.success) {
        await loadCategoryData();
        setShowAddModal(false);
        resetForm();
      }
    } catch (error) {
      console.error('Error adding category:', error);
      alert('Failed to add category');
    }
  };

  const handleEditCategory = async () => {
    if (!editingCategory) return;

    try {
      const updates = {
        name: formData.name,
        group_id: formData.groupId,
        target_amount: formData.targetAmount ? parseFloat(formData.targetAmount) : null,
        target_type: formData.targetType,
        target_date: formData.targetDate || null,
        hidden: formData.hidden ? 1 : 0
      };

      const result = await window.electronAPI?.updateCategory(editingCategory.id, updates);
      if (result?.success) {
        await loadCategoryData();
        setShowEditModal(false);
        setEditingCategory(null);
        resetForm();
      }
    } catch (error) {
      console.error('Error updating category:', error);
      alert('Failed to update category');
    }
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!confirm('Are you sure you want to delete this category? Transactions using it will become uncategorized.')) {
      return;
    }

    try {
      const result = await window.electronAPI?.deleteCategory(categoryId);
      if (result?.success) {
        await loadCategoryData();
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Failed to delete category');
    }
  };

  const handleToggleHidden = async (category) => {
    try {
      const result = await window.electronAPI?.updateCategory(category.id, {
        hidden: category.hidden ? 0 : 1
      });
      if (result?.success) {
        await loadCategoryData();
      }
    } catch (error) {
      console.error('Error toggling category visibility:', error);
    }
  };

  const openEditModal = (category) => {
    setEditingCategory(category);
    setFormData({
      name: category.name || '',
      groupId: category.group_id || '',
      targetAmount: category.target_amount || '',
      targetType: category.target_type || 'monthly',
      targetDate: category.target_date || '',
      hidden: category.hidden || false,
      note: ''
    });
    setShowEditModal(true);
  };

  const resetForm = () => {
    setFormData({
      name: '',
      groupId: '',
      targetAmount: '',
      targetType: 'monthly',
      targetDate: '',
      hidden: false,
      note: ''
    });
  };

  const getFilteredCategories = () => {
    switch (filter) {
      case 'active':
        return categories.filter(c => !c.hidden);
      case 'hidden':
        return categories.filter(c => c.hidden);
      case 'with-goals':
        return categories.filter(c => c.target_amount && c.target_amount > 0);
      default:
        return categories;
    }
  };

  const getCategoriesByGroup = (groupId) => {
    const filtered = getFilteredCategories();
    return filtered.filter(c => c.group_id === groupId);
  };

  const getGroupTotal = (groupId) => {
    const groupCategories = getCategoriesByGroup(groupId);
    return groupCategories.reduce((sum, cat) => sum + (cat.assigned || 0), 0);
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

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Loading categories...</p>
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
        <h1 style={styles.title}>Categories</h1>
        <button style={styles.addButton} onClick={() => setShowAddModal(true)}>
          +
        </button>
      </div>

      {/* Stats Summary */}
      <div style={styles.statsRow}>
        <div style={styles.statCard}>
          <span style={styles.statValue}>{categories.length}</span>
          <span style={styles.statLabel}>Total</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statValue}>{categories.filter(c => !c.hidden).length}</span>
          <span style={styles.statLabel}>Active</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statValue}>{categories.filter(c => c.target_amount).length}</span>
          <span style={styles.statLabel}>Goals</span>
        </div>
        <div style={styles.statCard}>
          <span style={styles.statValue}>{categories.filter(c => c.hidden).length}</span>
          <span style={styles.statLabel}>Hidden</span>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={styles.filterBar}>
        <button
          style={{
            ...styles.filterButton,
            ...(filter === 'all' ? styles.activeFilter : {})
          }}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        <button
          style={{
            ...styles.filterButton,
            ...(filter === 'active' ? styles.activeFilter : {})
          }}
          onClick={() => setFilter('active')}
        >
          Active
        </button>
        <button
          style={{
            ...styles.filterButton,
            ...(filter === 'hidden' ? styles.activeFilter : {})
          }}
          onClick={() => setFilter('hidden')}
        >
          Hidden
        </button>
        <button
          style={{
            ...styles.filterButton,
            ...(filter === 'with-goals' ? styles.activeFilter : {})
          }}
          onClick={() => setFilter('with-goals')}
        >
          Goals
        </button>
      </div>

      {/* Categories List */}
      <div style={styles.categoriesContainer}>
        {categoryGroups.length === 0 ? (
          <div style={styles.emptyState}>
            <p style={styles.emptyText}>No category groups found</p>
            <button style={styles.emptyButton}>Create Group</button>
          </div>
        ) : (
          categoryGroups.map((group) => {
            const groupCategories = getCategoriesByGroup(group.id);
            if (groupCategories.length === 0 && filter !== 'all') return null;

            return (
              <div key={group.id} style={styles.categoryGroup}>
                {/* Group Header */}
                <div style={styles.groupHeader} onClick={() => toggleGroup(group.id)}>
                  <div style={styles.groupHeaderLeft}>
                    <span style={styles.expandIcon}>
                      {expandedGroups[group.id] ? '▼' : '▶'}
                    </span>
                    <h3 style={styles.groupName}>{group.name}</h3>
                  </div>
                  <div style={styles.groupHeaderRight}>
                    <span style={styles.groupCount}>{groupCategories.length}</span>
                    <span style={styles.groupTotal}>{formatCompact(getGroupTotal(group.id))}</span>
                  </div>
                </div>

                {/* Categories */}
                {expandedGroups[group.id] && (
                  <div style={styles.categoriesList}>
                    {groupCategories.length === 0 ? (
                      <div style={styles.emptyGroup}>
                        <p style={styles.emptyGroupText}>No categories in this group</p>
                      </div>
                    ) : (
                      groupCategories.map((category) => (
                        <div key={category.id} style={styles.categoryItem}>
                          <div style={styles.categoryHeader}>
                            <div style={styles.categoryLeft}>
                              {category.hidden ? (
                                <span style={styles.hiddenIcon}>👁️‍🗨️</span>
                              ) : (
                                <span style={styles.categoryIcon}>📂</span>
                              )}
                              <div>
                                <p style={styles.categoryName}>{category.name}</p>
                                {category.target_amount > 0 && (
                                  <p style={styles.categoryGoal}>
                                    Goal: {formatCurrency(category.target_amount)}
                                    {category.target_type === 'by_date' && category.target_date && 
                                      ` by ${new Date(category.target_date).toLocaleDateString()}`
                                    }
                                  </p>
                                )}
                              </div>
                            </div>
                            <div style={styles.categoryRight}>
                              <span style={styles.categoryAssigned}>
                                {formatCompact(category.assigned || 0)}
                              </span>
                              <div style={styles.categoryActions}>
                                <button 
                                  style={styles.editButton}
                                  onClick={() => openEditModal(category)}
                                >
                                  ✏️
                                </button>
                                <button 
                                  style={styles.moreButton}
                                  onClick={() => handleToggleHidden(category)}
                                >
                                  {category.hidden ? '👁️' : '👁️‍🗨️'}
                                </button>
                              </div>
                            </div>
                          </div>

                          {/* Progress Bar (if has goal) */}
                          {category.target_amount > 0 && (
                            <div style={styles.progressSection}>
                              <div style={styles.progressBar}>
                                <div style={{
                                  ...styles.progressFill,
                                  width: `${Math.min(100, ((category.assigned || 0) / category.target_amount) * 100)}%`
                                }} />
                              </div>
                              <div style={styles.progressStats}>
                                <span>{formatCurrency(category.assigned || 0)}</span>
                                <span>{formatCurrency(category.available || 0)} available</span>
                              </div>
                            </div>
                          )}

                          {/* Activity/Spending */}
                          <div style={styles.categoryFooter}>
                            <span style={styles.activityLabel}>
                              Activity: {formatCurrency(category.activity || 0)}
                            </span>
                            <span style={styles.availableLabel}>
                              Available: {formatCurrency(category.available || 0)}
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom Navigation */}
      <div style={styles.bottomNav}>
        <button style={styles.navItem} onClick={() => router.push('/mobile-home')}>
          <span style={styles.navIcon}>🏠</span>
          <span style={styles.navLabel}>Home</span>
        </button>
        <button style={styles.navItem} onClick={() => router.push('/mobile-budget')}>
          <span style={styles.navIcon}>📊</span>
          <span style={styles.navLabel}>Budget</span>
        </button>
        <button style={styles.navItem} onClick={() => setShowAddModal(true)}>
          <span style={styles.navIcon}>➕</span>
          <span style={styles.navLabel}>Add</span>
        </button>
        <button style={{...styles.navItem, ...styles.activeNavItem}}>
          <span style={styles.navIcon}>📂</span>
          <span style={styles.navLabel}>Categories</span>
        </button>
        <button style={styles.navItem} onClick={() => router.push('/mobile-settings')}>
          <span style={styles.navIcon}>⚙️</span>
          <span style={styles.navLabel}>Settings</span>
        </button>
      </div>

      {/* Add Category Modal */}
      {showAddModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Add Category</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Category Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., Groceries, Rent"
                style={styles.input}
                autoFocus
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Category Group *</label>
              <select
                value={formData.groupId}
                onChange={(e) => setFormData({...formData, groupId: e.target.value})}
                style={styles.select}
              >
                <option value="">Select a group</option>
                {categoryGroups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Target Amount (Optional)</label>
              <div style={styles.amountInput}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  value={formData.targetAmount}
                  onChange={(e) => setFormData({...formData, targetAmount: e.target.value})}
                  placeholder="0.00"
                  step="0.01"
                  min="0"
                  style={styles.amountField}
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Target Type</label>
              <select
                value={formData.targetType}
                onChange={(e) => setFormData({...formData, targetType: e.target.value})}
                style={styles.select}
              >
                <option value="monthly">Monthly Goal</option>
                <option value="balance">Balance Goal</option>
                <option value="by_date">Save by Date</option>
              </select>
            </div>

            {formData.targetType === 'by_date' && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Target Date</label>
                <input
                  type="date"
                  value={formData.targetDate}
                  onChange={(e) => setFormData({...formData, targetDate: e.target.value})}
                  style={styles.input}
                  min={new Date().toISOString().split('T')[0]}
                />
              </div>
            )}

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.hidden}
                  onChange={(e) => setFormData({...formData, hidden: e.target.checked})}
                />
                Hide this category by default
              </label>
            </div>

            <div style={styles.modalActions}>
              <button
                onClick={() => setShowAddModal(false)}
                style={styles.modalCancelButton}
              >
                Cancel
              </button>
              <button
                onClick={handleAddCategory}
                style={styles.modalSaveButton}
              >
                Add Category
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Category Modal */}
      {showEditModal && (
        <div style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Edit Category</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Category Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Category Group *</label>
              <select
                value={formData.groupId}
                onChange={(e) => setFormData({...formData, groupId: e.target.value})}
                style={styles.select}
              >
                <option value="">Select a group</option>
                {categoryGroups.map(group => (
                  <option key={group.id} value={group.id}>{group.name}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Target Amount</label>
              <div style={styles.amountInput}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  value={formData.targetAmount}
                  onChange={(e) => setFormData({...formData, targetAmount: e.target.value})}
                  step="0.01"
                  min="0"
                  style={styles.amountField}
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Target Type</label>
              <select
                value={formData.targetType}
                onChange={(e) => setFormData({...formData, targetType: e.target.value})}
                style={styles.select}
              >
                <option value="monthly">Monthly Goal</option>
                <option value="balance">Balance Goal</option>
                <option value="by_date">Save by Date</option>
              </select>
            </div>

            {formData.targetType === 'by_date' && (
              <div style={styles.formGroup}>
                <label style={styles.label}>Target Date</label>
                <input
                  type="date"
                  value={formData.targetDate}
                  onChange={(e) => setFormData({...formData, targetDate: e.target.value})}
                  style={styles.input}
                />
              </div>
            )}

            <div style={styles.formGroup}>
              <label style={styles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={formData.hidden}
                  onChange={(e) => setFormData({...formData, hidden: e.target.checked})}
                />
                Hide this category
              </label>
            </div>

            <div style={styles.modalActions}>
              <button
                onClick={() => {
                  setShowEditModal(false);
                  setEditingCategory(null);
                  resetForm();
                }}
                style={styles.modalCancelButton}
              >
                Cancel
              </button>
              <button
                onClick={handleEditCategory}
                style={styles.modalSaveButton}
              >
                Save Changes
              </button>
            </div>

            {editingCategory && (
              <button
                onClick={() => {
                  if (confirm('Delete this category?')) {
                    handleDeleteCategory(editingCategory.id);
                    setShowEditModal(false);
                  }
                }}
                style={styles.deleteButton}
              >
                🗑️ Delete Category
              </button>
            )}
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
  addButton: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: '#3B82F6',
    border: 'none',
    color: 'white',
    fontSize: '24px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsRow: {
    display: 'flex',
    gap: '8px',
    padding: '16px 20px',
  },
  statCard: {
    flex: 1,
    background: '#1F2937',
    padding: '12px',
    borderRadius: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  statValue: {
    fontSize: '18px',
    fontWeight: 'bold',
  },
  statLabel: {
    fontSize: '11px',
    color: '#9CA3AF',
    marginTop: '2px',
  },
  filterBar: {
    display: 'flex',
    gap: '8px',
    padding: '0 20px',
    marginBottom: '20px',
  },
  filterButton: {
    flex: 1,
    padding: '8px',
    background: '#1F2937',
    border: '1px solid #374151',
    borderRadius: '20px',
    color: '#9CA3AF',
    fontSize: '12px',
    cursor: 'pointer',
  },
  activeFilter: {
    background: '#3B82F6',
    color: 'white',
    borderColor: '#3B82F6',
  },
  categoriesContainer: {
    padding: '0 20px',
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
    padding: '16px',
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
    fontSize: '16px',
    fontWeight: '600',
    margin: 0,
  },
  groupHeaderRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  groupCount: {
    fontSize: '12px',
    color: '#9CA3AF',
    background: '#374151',
    padding: '2px 8px',
    borderRadius: '12px',
  },
  groupTotal: {
    fontSize: '14px',
    fontWeight: '600',
  },
  categoriesList: {
    padding: '8px 0',
  },
  categoryItem: {
    padding: '16px',
    borderBottom: '1px solid #374151',
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
    gap: '12px',
    flex: 1,
  },
  categoryIcon: {
    fontSize: '20px',
  },
  hiddenIcon: {
    fontSize: '20px',
    opacity: 0.6,
  },
  categoryName: {
    fontSize: '16px',
    fontWeight: '500',
    margin: 0,
    marginBottom: '2px',
  },
  categoryGoal: {
    fontSize: '11px',
    color: '#F59E0B',
    margin: 0,
  },
  categoryRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  categoryAssigned: {
    fontSize: '16px',
    fontWeight: '600',
  },
  categoryActions: {
    display: 'flex',
    gap: '8px',
  },
  editButton: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    opacity: 0.7,
  },
  moreButton: {
    background: 'none',
    border: 'none',
    fontSize: '16px',
    cursor: 'pointer',
    opacity: 0.7,
  },
  progressSection: {
    marginTop: '8px',
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
  progressStats: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    color: '#9CA3AF',
  },
  categoryFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '8px',
    fontSize: '11px',
    color: '#9CA3AF',
  },
  activityLabel: {
    color: '#F87171',
  },
  availableLabel: {
    color: '#4ADE80',
  },
  emptyGroup: {
    padding: '24px',
    textAlign: 'center',
  },
  emptyGroupText: {
    fontSize: '14px',
    color: '#9CA3AF',
    margin: 0,
  },
  emptyState: {
    padding: '60px 20px',
    textAlign: 'center',
    background: '#1F2937',
    borderRadius: '16px',
  },
  emptyText: {
    fontSize: '16px',
    color: '#9CA3AF',
    marginBottom: '16px',
  },
  emptyButton: {
    padding: '12px 24px',
    background: '#3B82F6',
    border: 'none',
    borderRadius: '12px',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
  },
  bottomNav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    background: '#1F2937',
    padding: '8px 0',
    paddingBottom: '24px',
    borderTop: '1px solid #374151',
  },
  navItem: {
    flex: 1,
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
  },
  activeNavItem: {
    color: '#3B82F6',
  },
  navIcon: {
    fontSize: '20px',
  },
  navLabel: {
    fontSize: '10px',
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
    fontSize: '20px',
    fontWeight: '600',
    margin: '0 0 20px 0',
  },
  formGroup: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    color: '#9CA3AF',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '14px',
    color: '#9CA3AF',
    cursor: 'pointer',
  },
  input: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    fontSize: '16px',
  },
  select: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    fontSize: '16px',
  },
  amountInput: {
    position: 'relative',
  },
  currencySymbol: {
    position: 'absolute',
    left: '12px',
    top: '12px',
    color: '#9CA3AF',
  },
  amountField: {
    width: '100%',
    padding: '12px',
    paddingLeft: '32px',
    borderRadius: '8px',
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    fontSize: '16px',
  },
  modalActions: {
    display: 'flex',
    gap: '12px',
    marginTop: '24px',
  },
  modalCancelButton: {
    flex: 1,
    padding: '14px',
    background: '#374151',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
  },
  modalSaveButton: {
    flex: 1,
    padding: '14px',
    background: '#3B82F6',
    border: 'none',
    borderRadius: '8px',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
  },
  deleteButton: {
    width: '100%',
    padding: '14px',
    marginTop: '16px',
    background: 'rgba(239, 68, 68, 0.1)',
    border: '1px solid #EF4444',
    borderRadius: '8px',
    color: '#EF4444',
    fontSize: '14px',
    cursor: 'pointer',
  },
};