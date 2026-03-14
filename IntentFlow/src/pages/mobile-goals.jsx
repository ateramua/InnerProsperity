// src/pages/mobile-goals.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import AddTransactionModal from '../components/mobile/AddTransactionModal';
import DatabaseProxy from '../services/databaseProxy.mjs';

export default function MobileGoals() {
  const [goals, setGoals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'active', 'completed', 'behind'
  const router = useRouter();
  const { user } = useAuth();

  // Form state for add/edit
  const [formData, setFormData] = useState({
    name: '',
    targetAmount: '',
    currentAmount: '',
    targetDate: '',
    categoryId: '',
    accountId: '',
    icon: '🎯',
    color: '#3B82F6',
    notes: ''
  });

  useEffect(() => {
    loadGoalsData();
  }, []);

  const loadGoalsData = async () => {
    setIsLoading(true);
    try {
      // In a real app, you'd have a goals API
      // For now, we'll create mock goals from categories with targets
      
      // Load categories
 const categoriesResult = await DatabaseProxy.getCategories(user?.id);
      if (categoriesResult?.success) {
        setCategories(categoriesResult.data || []);
        
        // Create goals from categories with targets
        const categoryGoals = categoriesResult.data
          .filter(c => c.target_amount && c.target_amount > 0)
          .map(c => ({
            id: `goal-${c.id}`,
            name: c.name,
            targetAmount: c.target_amount,
            currentAmount: c.available || 0,
            targetDate: c.target_date,
            type: c.target_type || 'monthly',
            categoryId: c.id,
            category: c,
            icon: getCategoryIcon(c.name),
            color: getCategoryColor(c.name),
            progress: ((c.available || 0) / c.target_amount) * 100,
            daysLeft: c.target_date ? calculateDaysLeft(c.target_date) : null,
            status: calculateStatus(c)
          }));

        setGoals(categoryGoals);
      }

      // Load accounts
const accountsResult = await DatabaseProxy.getAccounts(user?.id);
      if (accountsResult?.success) {
        setAccounts(accountsResult.data || []);
      }
    } catch (error) {
      console.error('Error loading goals:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const getCategoryIcon = (name) => {
    const icons = {
      'emergency': '🚨',
      'vacation': '✈️',
      'travel': '✈️',
      'car': '🚗',
      'house': '🏠',
      'home': '🏠',
      'education': '📚',
      'retirement': '👴',
      'wedding': '💒',
      'gift': '🎁',
      'tech': '💻',
      'phone': '📱'
    };
    
    for (const [key, icon] of Object.entries(icons)) {
      if (name.toLowerCase().includes(key)) return icon;
    }
    return '🎯';
  };

  const getCategoryColor = (name) => {
    const colors = {
      'emergency': '#EF4444',
      'vacation': '#F59E0B',
      'travel': '#F59E0B',
      'car': '#10B981',
      'house': '#3B82F6',
      'home': '#3B82F6',
      'education': '#8B5CF6',
      'retirement': '#6366F1',
      'wedding': '#EC4899'
    };
    
    for (const [key, color] of Object.entries(colors)) {
      if (name.toLowerCase().includes(key)) return color;
    }
    return '#3B82F6';
  };

  const calculateDaysLeft = (targetDate) => {
    const today = new Date();
    const target = new Date(targetDate);
    const diffTime = target - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const calculateStatus = (category) => {
    if (!category.target_amount) return 'no-target';
    
    const progress = ((category.available || 0) / category.target_amount) * 100;
    
    if (progress >= 100) return 'completed';
    
    if (category.target_type === 'by_date' && category.target_date) {
      const daysLeft = calculateDaysLeft(category.target_date);
      const neededPerDay = (category.target_amount - (category.available || 0)) / daysLeft;
      const monthlyNeeded = neededPerDay * 30;
      const avgMonthly = category.average_spending || 0;
      
      if (daysLeft < 0) return 'overdue';
      if (daysLeft < 30 && monthlyNeeded > avgMonthly * 1.5) return 'behind';
    }
    
    if (progress < 25) return 'just-started';
    if (progress < 50) return 'in-progress';
    if (progress < 75) return 'halfway';
    return 'almost-there';
  };

  const getFilteredGoals = () => {
    switch (filter) {
      case 'active':
        return goals.filter(g => g.status !== 'completed' && g.status !== 'overdue');
      case 'completed':
        return goals.filter(g => g.status === 'completed');
      case 'behind':
        return goals.filter(g => g.status === 'behind' || g.status === 'overdue');
      default:
        return goals;
    }
  };

  const handleAddGoal = async () => {
    // In a real app, this would save to a goals table
    // For now, we'll just show an alert
    alert('Add goal functionality - would create a new goal');
    setShowAddModal(false);
  };

  const handleUpdateGoal = async () => {
    if (!editingGoal) return;
    alert('Update goal functionality - would save changes');
    setShowEditModal(false);
    setEditingGoal(null);
  };

  const handleDeleteGoal = async (goalId) => {
    if (!confirm('Are you sure you want to delete this goal?')) return;
    alert('Delete goal functionality - would remove goal');
  };

  const handleAddContribution = async (goal) => {
    const amount = prompt('Enter contribution amount:', '100');
    if (!amount) return;
    
    alert(`Contribute ${formatCurrency(parseFloat(amount))} to ${goal.name}`);
    // Would create a transaction and update goal
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount || 0);
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'No deadline';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const filteredGoals = getFilteredGoals();
  const totalTarget = goals.reduce((sum, g) => sum + g.targetAmount, 0);
  const totalProgress = goals.reduce((sum, g) => sum + (g.currentAmount || 0), 0);
  const overallProgress = totalTarget > 0 ? (totalProgress / totalTarget) * 100 : 0;
  const completedGoals = goals.filter(g => g.status === 'completed').length;

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Loading your goals...</p>
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
        <h1 style={styles.title}>Savings Goals</h1>
        <button style={styles.addButton} onClick={() => setShowAddModal(true)}>
          +
        </button>
      </div>

      {/* Overall Progress Card */}
      <div style={styles.overallCard}>
        <div style={styles.overallHeader}>
          <span style={styles.overallTitle}>Overall Progress</span>
          <span style={styles.overallStats}>
            {completedGoals}/{goals.length} completed
          </span>
        </div>
        <div style={styles.overallProgress}>
          <div style={styles.overallProgressBar}>
            <div style={{
              ...styles.overallProgressFill,
              width: `${overallProgress}%`
            }} />
          </div>
          <span style={styles.overallPercentage}>{Math.round(overallProgress)}%</span>
        </div>
        <div style={styles.overallAmounts}>
          <span>{formatCurrency(totalProgress)}</span>
          <span>of {formatCurrency(totalTarget)}</span>
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
          All ({goals.length})
        </button>
        <button
          style={{
            ...styles.filterButton,
            ...(filter === 'active' ? styles.activeFilter : {})
          }}
          onClick={() => setFilter('active')}
        >
          Active ({goals.filter(g => g.status !== 'completed').length})
        </button>
        <button
          style={{
            ...styles.filterButton,
            ...(filter === 'completed' ? styles.activeFilter : {})
          }}
          onClick={() => setFilter('completed')}
        >
          Completed ({completedGoals})
        </button>
        <button
          style={{
            ...styles.filterButton,
            ...(filter === 'behind' ? styles.activeFilter : {})
          }}
          onClick={() => setFilter('behind')}
        >
          Behind
        </button>
      </div>

      {/* Goals List */}
      <div style={styles.goalsContainer}>
        {filteredGoals.length === 0 ? (
          <div style={styles.emptyState}>
            <span style={styles.emptyIcon}>🎯</span>
            <h3 style={styles.emptyTitle}>No goals yet</h3>
            <p style={styles.emptyText}>Create your first savings goal to start tracking progress</p>
            <button style={styles.emptyButton} onClick={() => setShowAddModal(true)}>
              Create Goal
            </button>
          </div>
        ) : (
          filteredGoals.map((goal) => (
            <div key={goal.id} style={styles.goalCard}>
              {/* Goal Header */}
              <div style={styles.goalHeader}>
                <div style={styles.goalIconContainer}>
                  <span style={styles.goalIcon}>{goal.icon}</span>
                </div>
                <div style={styles.goalInfo}>
                  <h3 style={styles.goalName}>{goal.name}</h3>
                  <p style={styles.goalMeta}>
                    {goal.type === 'by_date' ? formatDate(goal.targetDate) : 'No deadline'}
                  </p>
                </div>
                <button 
                  style={styles.goalMenuButton}
                  onClick={() => {
                    setEditingGoal(goal);
                    setShowEditModal(true);
                  }}
                >
                  ⋮
                </button>
              </div>

              {/* Goal Amounts */}
              <div style={styles.goalAmounts}>
                <div style={styles.goalCurrent}>
                  <span style={styles.amountLabel}>Current</span>
                  <span style={styles.amountValue}>{formatCurrency(goal.currentAmount)}</span>
                </div>
                <div style={styles.goalTarget}>
                  <span style={styles.amountLabel}>Target</span>
                  <span style={styles.amountValue}>{formatCurrency(goal.targetAmount)}</span>
                </div>
              </div>

              {/* Progress Bar */}
              <div style={styles.goalProgress}>
                <div style={styles.progressBar}>
                  <div style={{
                    ...styles.progressFill,
                    width: `${Math.min(goal.progress, 100)}%`,
                    backgroundColor: goal.color
                  }} />
                </div>
                <span style={styles.progressPercentage}>{Math.round(goal.progress)}%</span>
              </div>

              {/* Status and Action */}
              <div style={styles.goalFooter}>
                <div style={styles.statusContainer}>
                  {goal.status === 'completed' && (
                    <span style={styles.completedBadge}>✅ Completed</span>
                  )}
                  {goal.status === 'behind' && (
                    <span style={styles.behindBadge}>⚠️ Behind schedule</span>
                  )}
                  {goal.status === 'overdue' && (
                    <span style={styles.overdueBadge}>❌ Overdue</span>
                  )}
                  {goal.status === 'just-started' && (
                    <span style={styles.startedBadge}>🆕 Just started</span>
                  )}
                  {goal.status === 'halfway' && (
                    <span style={styles.halfwayBadge}>📊 Halfway there</span>
                  )}
                  {goal.status === 'almost-there' && (
                    <span style={styles.almostBadge}>🎯 Almost there</span>
                  )}
                </div>
                <button 
                  style={styles.contributeButton}
                  onClick={() => handleAddContribution(goal)}
                >
                  Add Funds
                </button>
              </div>

              {/* Days Left (if applicable) */}
              {goal.daysLeft !== null && goal.status !== 'completed' && (
                <div style={styles.daysLeft}>
                  {goal.daysLeft > 0 ? (
                    <span>{goal.daysLeft} days left</span>
                  ) : (
                    <span style={{ color: '#EF4444' }}>Past deadline</span>
                  )}
                </div>
              )}
            </div>
          ))
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
          <span style={styles.navIcon}>🎯</span>
          <span style={styles.navLabel}>Goals</span>
        </button>
        <button style={styles.navItem} onClick={() => router.push('/mobile-settings')}>
          <span style={styles.navIcon}>⚙️</span>
          <span style={styles.navLabel}>Settings</span>
        </button>
      </div>

      {/* Add Goal Modal */}
      {showAddModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Create New Goal</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Goal Name *</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                placeholder="e.g., Emergency Fund"
                style={styles.input}
                autoFocus
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Target Amount *</label>
              <div style={styles.amountInput}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  value={formData.targetAmount}
                  onChange={(e) => setFormData({...formData, targetAmount: e.target.value})}
                  placeholder="10000"
                  step="100"
                  min="0"
                  style={styles.amountField}
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Current Amount</label>
              <div style={styles.amountInput}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  value={formData.currentAmount}
                  onChange={(e) => setFormData({...formData, currentAmount: e.target.value})}
                  placeholder="0"
                  step="100"
                  min="0"
                  style={styles.amountField}
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Target Date (Optional)</label>
              <input
                type="date"
                value={formData.targetDate}
                onChange={(e) => setFormData({...formData, targetDate: e.target.value})}
                style={styles.input}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Link to Category (Optional)</label>
              <select
                value={formData.categoryId}
                onChange={(e) => setFormData({...formData, categoryId: e.target.value})}
                style={styles.select}
              >
                <option value="">None</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Link to Account (Optional)</label>
              <select
                value={formData.accountId}
                onChange={(e) => setFormData({...formData, accountId: e.target.value})}
                style={styles.select}
              >
                <option value="">None</option>
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                placeholder="Additional details..."
                style={styles.textarea}
                rows="3"
              />
            </div>

            <div style={styles.modalActions}>
              <button
                onClick={() => setShowAddModal(false)}
                style={styles.modalCancelButton}
              >
                Cancel
              </button>
              <button
                onClick={handleAddGoal}
                style={styles.modalSaveButton}
              >
                Create Goal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Goal Modal */}
      {showEditModal && editingGoal && (
        <div style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Edit Goal</h3>
            
            <div style={styles.formGroup}>
              <label style={styles.label}>Goal Name</label>
              <input
                type="text"
                value={editingGoal.name}
                onChange={(e) => setEditingGoal({...editingGoal, name: e.target.value})}
                style={styles.input}
              />
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Target Amount</label>
              <div style={styles.amountInput}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  value={editingGoal.targetAmount}
                  onChange={(e) => setEditingGoal({...editingGoal, targetAmount: e.target.value})}
                  style={styles.amountField}
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Current Amount</label>
              <div style={styles.amountInput}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  value={editingGoal.currentAmount}
                  onChange={(e) => setEditingGoal({...editingGoal, currentAmount: e.target.value})}
                  style={styles.amountField}
                />
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Target Date</label>
              <input
                type="date"
                value={editingGoal.targetDate || ''}
                onChange={(e) => setEditingGoal({...editingGoal, targetDate: e.target.value})}
                style={styles.input}
              />
            </div>

            <div style={styles.modalActions}>
              <button
                onClick={() => setShowEditModal(false)}
                style={styles.modalCancelButton}
              >
                Cancel
              </button>
              <button
                onClick={handleUpdateGoal}
                style={styles.modalSaveButton}
              >
                Save Changes
              </button>
            </div>

            <button
              onClick={() => handleDeleteGoal(editingGoal.id)}
              style={styles.deleteButton}
            >
              🗑️ Delete Goal
            </button>
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
  overallCard: {
    margin: '20px',
    padding: '20px',
    background: 'linear-gradient(135deg, #0047AB, #0A2472)',
    borderRadius: '16px',
  },
  overallHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  overallTitle: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.7)',
  },
  overallStats: {
    fontSize: '12px',
    color: '#4ADE80',
  },
  overallProgress: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '8px',
  },
  overallProgressBar: {
    flex: 1,
    height: '8px',
    background: 'rgba(255,255,255,0.2)',
    borderRadius: '4px',
    overflow: 'hidden',
  },
  overallProgressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #4ADE80, #10B981)',
    borderRadius: '4px',
  },
  overallPercentage: {
    fontSize: '16px',
    fontWeight: 'bold',
  },
  overallAmounts: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.7)',
  },
  filterBar: {
    display: 'flex',
    gap: '8px',
    padding: '0 20px',
    marginBottom: '20px',
    flexWrap: 'wrap',
  },
  filterButton: {
    flex: 1,
    minWidth: '70px',
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
  goalsContainer: {
    padding: '0 20px',
  },
  goalCard: {
    background: '#1F2937',
    borderRadius: '16px',
    padding: '16px',
    marginBottom: '16px',
  },
  goalHeader: {
    display: 'flex',
    alignItems: 'center',
    marginBottom: '16px',
  },
  goalIconContainer: {
    width: '48px',
    height: '48px',
    borderRadius: '24px',
    background: '#374151',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: '12px',
  },
  goalIcon: {
    fontSize: '24px',
  },
  goalInfo: {
    flex: 1,
  },
  goalName: {
    fontSize: '16px',
    fontWeight: '600',
    margin: 0,
    marginBottom: '4px',
  },
  goalMeta: {
    fontSize: '12px',
    color: '#9CA3AF',
    margin: 0,
  },
  goalMenuButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '20px',
    cursor: 'pointer',
  },
  goalAmounts: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '12px',
  },
  goalCurrent: {
    flex: 1,
  },
  goalTarget: {
    flex: 1,
    textAlign: 'right',
  },
  amountLabel: {
    fontSize: '11px',
    color: '#9CA3AF',
    marginBottom: '2px',
  },
  amountValue: {
    fontSize: '18px',
    fontWeight: 'bold',
  },
  goalProgress: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    marginBottom: '16px',
  },
  progressBar: {
    flex: 1,
    height: '6px',
    background: '#374151',
    borderRadius: '3px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: '3px',
  },
  progressPercentage: {
    fontSize: '14px',
    fontWeight: '600',
  },
  goalFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusContainer: {
    flex: 1,
  },
  completedBadge: {
    fontSize: '12px',
    color: '#4ADE80',
  },
  behindBadge: {
    fontSize: '12px',
    color: '#F59E0B',
  },
  overdueBadge: {
    fontSize: '12px',
    color: '#EF4444',
  },
  startedBadge: {
    fontSize: '12px',
    color: '#3B82F6',
  },
  halfwayBadge: {
    fontSize: '12px',
    color: '#8B5CF6',
  },
  almostBadge: {
    fontSize: '12px',
    color: '#10B981',
  },
  contributeButton: {
    padding: '8px 16px',
    background: '#3B82F6',
    border: 'none',
    borderRadius: '20px',
    color: 'white',
    fontSize: '12px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  daysLeft: {
    marginTop: '12px',
    padding: '8px',
    background: '#374151',
    borderRadius: '8px',
    fontSize: '11px',
    color: '#9CA3AF',
    textAlign: 'center',
  },
  emptyState: {
    padding: '60px 20px',
    textAlign: 'center',
    background: '#1F2937',
    borderRadius: '16px',
  },
  emptyIcon: {
    fontSize: '48px',
    marginBottom: '16px',
    display: 'block',
  },
  emptyTitle: {
    fontSize: '18px',
    fontWeight: '600',
    marginBottom: '8px',
  },
  emptyText: {
    fontSize: '14px',
    color: '#9CA3AF',
    marginBottom: '20px',
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
  textarea: {
    width: '100%',
    padding: '12px',
    borderRadius: '8px',
    border: '1px solid #374151',
    background: '#111827',
    color: 'white',
    fontSize: '16px',
    fontFamily: 'inherit',
    resize: 'vertical',
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