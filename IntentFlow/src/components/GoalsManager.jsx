import React, { useState, useEffect } from 'react';
import { useCategoryGoalSync } from '../hooks/useCategoryGoalSync';

export default function GoalsManager({ goals: initialGoals, categories, accounts, onUpdate }) {
  const [goals, setGoals] = useState(initialGoals || []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState(null);
  // Update the newGoal state (around line 15-20)
  const [newGoal, setNewGoal] = useState({
    name: '',
    target_amount: '',
    current_amount: '0',
    target_date: '',
    category_id: '',
    account_id: '',
    target_type: 'balance', // 'balance', 'monthly', 'by_date'
    notes: ''
  });

  // Calculate goal progress and projections
  // Update calculateGoalProgress function (around line 25-40)
  const calculateGoalProgress = (goal) => {
    switch (goal.target_type) {
      case 'monthly':
        const progress = (goal.current_amount / goal.target_amount) * 100;
        return {
          progress: Math.min(progress, 100),
          remaining: goal.target_amount - goal.current_amount,
          isCompleted: progress >= 100,
          displayType: 'monthly',
          neededThisMonth: Math.max(0, goal.target_amount - goal.current_amount)
        };

      case 'balance':
        const balanceProgress = (goal.current_amount / goal.target_amount) * 100;
        return {
          progress: Math.min(balanceProgress, 100),
          remaining: goal.target_amount - goal.current_amount,
          isCompleted: balanceProgress >= 100,
          displayType: 'balance'
        };

      case 'by_date':
        const dateProgress = (goal.current_amount / goal.target_amount) * 100;
        const today = new Date();
        const targetDate = new Date(goal.target_date);
        const monthsRemaining = (targetDate.getFullYear() - today.getFullYear()) * 12 +
          (targetDate.getMonth() - today.getMonth());
        const remaining = goal.target_amount - goal.current_amount;
        const monthlyNeeded = monthsRemaining > 0 ? remaining / monthsRemaining : remaining;

        return {
          progress: Math.min(dateProgress, 100),
          remaining,
          isCompleted: dateProgress >= 100,
          displayType: 'by_date',
          monthsRemaining: Math.max(0, monthsRemaining),
          monthlyNeeded: Math.max(0, monthlyNeeded)
        };

      default:
        return {
          progress: (goal.current_amount / goal.target_amount) * 100,
          remaining: goal.target_amount - goal.current_amount,
          isCompleted: goal.current_amount >= goal.target_amount
        };
    }
  };
  
  // Enhanced sync function that updates both local state and database
const syncGoalWithCategory = async (goalId, newAmount, category) => {
  // Update local state
  setGoals(prevGoals => 
    prevGoals.map(g => {
      if (g.id === goalId) {
        console.log(`✅ Syncing goal "${g.name}" to $${newAmount} (from category "${category?.name}")`);
        return {
          ...g,
          current_amount: newAmount
        };
      }
      return g;
    })
  );
  
  // Update database if API available
  if (window.electronAPI?.updateGoal) {
    try {
      await window.electronAPI.updateGoal(goalId, {
        current_amount: newAmount
      });
    } catch (error) {
      console.error('Error syncing goal with database:', error);
    }
  }
};

  // Add this with your other state and hooks
  const { syncGoal } = useCategoryGoalSync(goals, categories, syncGoalWithCategory);
  const handleAddGoal = async (e) => {
    e.preventDefault();

    // Validate inputs
    if (!newGoal.name.trim()) {
      alert('Please enter a goal name');
      return;
    }
    if (!newGoal.target_amount || parseFloat(newGoal.target_amount) <= 0) {
      alert('Please enter a valid target amount');
      return;
    }
    if (!newGoal.target_date) {
      alert('Please select a target date');
      return;
    }

    try {
      console.log('Creating goal:', newGoal);

      // TODO: Add IPC handler for creating goals
      // For now, simulate success
      const mockResult = {
        success: true,
        data: {
          id: Date.now(),
          ...newGoal,
          target_amount: parseFloat(newGoal.target_amount),
          current_amount: parseFloat(newGoal.current_amount) || 0
        }
      };

      if (mockResult.success) {
        // Add to local state
        const updatedGoals = [...goals, mockResult.data];
        setGoals(updatedGoals);

        setShowAddForm(false);
        setNewGoal({
          name: '',
          target_amount: '',
          current_amount: '0',
          target_date: '',
          category_id: '',
          account_id: '',
          notes: ''
        });

        if (onUpdate) onUpdate();
        alert('✅ Goal created successfully!');
      } else {
        alert('❌ Failed to create goal: ' + (mockResult.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error creating goal:', error);
      alert('Error creating goal: ' + error.message);
    }
  };

  const handleUpdateGoal = async () => {
    if (!editingGoal) return;

    try {
      console.log('Updating goal:', editingGoal);

      // TODO: Add IPC handler for updating goals
      const mockResult = { success: true };

      if (mockResult.success) {
        const updatedGoals = goals.map(g =>
          g.id === editingGoal.id ? editingGoal : g
        );
        setGoals(updatedGoals);
        setEditingGoal(null);
        if (onUpdate) onUpdate();
        alert('✅ Goal updated successfully!');
      }
    } catch (error) {
      console.error('Error updating goal:', error);
      alert('Error updating goal: ' + error.message);
    }
  };

  const handleDeleteGoal = async (goalId) => {
    if (!confirm('Are you sure you want to delete this goal?')) {
      return;
    }

    try {
      console.log('Deleting goal:', goalId);

      // TODO: Add IPC handler for deleting goals
      const mockResult = { success: true };

      if (mockResult.success) {
        const updatedGoals = goals.filter(g => g.id !== goalId);
        setGoals(updatedGoals);
        if (onUpdate) onUpdate();
        alert('✅ Goal deleted successfully!');
      }
    } catch (error) {
      console.error('Error deleting goal:', error);
      alert('Error deleting goal: ' + error.message);
    }
  };

  const handleContribute = async (goal) => {
    const amount = prompt(`Enter amount to contribute to "${goal.name}":`, '100');
    if (amount && !isNaN(parseFloat(amount))) {
      const contributionAmount = parseFloat(amount);

      // Ask if they want to create a transaction
      const createTransaction = confirm(
        `Create a transaction for this contribution?\n\n` +
        `This will move $${contributionAmount} from your checking/savings to the goal.`
      );

      if (createTransaction) {
        // Show account selector
        const accountId = prompt(
          `Select account to contribute from:\n` +
          accounts.map(a => `${a.id}: ${a.name} (${formatCurrency(a.balance)})`).join('\n')
        );

        if (accountId) {
          // Create the transaction
          const transaction = {
            date: new Date().toISOString().split('T')[0],
            payee: `Transfer to ${goal.name}`,
            amount: -contributionAmount, // Negative because it's money leaving
            categoryId: goal.category_id,
            accountId: parseInt(accountId),
            memo: `Goal contribution`,
            cleared: true
          };

          try {
            // Add transaction
            const result = await window.electronAPI.addTransaction(transaction);
            if (result.success) {
              // Update goal current amount
              const updatedGoals = goals.map(g => {
                if (g.id === goal.id) {
                  return {
                    ...g,
                    current_amount: g.current_amount + contributionAmount
                  };
                }
                return g;
              });
              setGoals(updatedGoals);
              alert(`✅ Added $${contributionAmount} to "${goal.name}"`);
            }
          } catch (error) {
            console.error('Error contributing to goal:', error);
            alert('❌ Failed to add contribution');
          }
        }
      } else {
        // Just update goal without transaction
        const updatedGoals = goals.map(g => {
          if (g.id === goal.id) {
            return {
              ...g,
              current_amount: g.current_amount + contributionAmount
            };
          }
          return g;
        });
        setGoals(updatedGoals);
        alert(`✅ Added $${contributionAmount} to "${goal.name}"`);
      }
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div style={{ padding: '20px', color: 'white' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>🎯</span> Savings Goals
        </h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
          style={{
            background: '#3B82F6',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <span>+</span> New Goal
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px',
        marginBottom: '25px'
      }}>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid #3B82F6'
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Goals</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{goals.length}</div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid #10B981'
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Target</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {formatCurrency(goals.reduce((sum, g) => sum + g.target_amount, 0))}
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid #F59E0B'
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Saved</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#F59E0B' }}>
            {formatCurrency(goals.reduce((sum, g) => sum + g.current_amount, 0))}
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid #8B5CF6'
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Overall Progress</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {goals.length > 0
              ? ((goals.reduce((sum, g) => sum + g.current_amount, 0) /
                goals.reduce((sum, g) => sum + g.target_amount, 0)) * 100).toFixed(1)
              : 0}%
          </div>
        </div>
      </div>

      {/* Add Goal Form */}
      {showAddForm && (
        <div style={{
          background: '#1F2937',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #3B82F6'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Create New Goal</h3>
          <form onSubmit={handleAddGoal} style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '15px'
          }}>
            <input
              type="text"
              placeholder="Goal Name"
              value={newGoal.name}
              onChange={(e) => setNewGoal({ ...newGoal, name: e.target.value })}
              required
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            />
            <input
              type="number"
              placeholder="Target Amount"
              value={newGoal.target_amount}
              onChange={(e) => setNewGoal({ ...newGoal, target_amount: e.target.value })}
              required
              min="0.01"
              step="0.01"
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            />
            <input
              type="date"
              placeholder="Target Date"
              value={newGoal.target_date}
              onChange={(e) => setNewGoal({ ...newGoal, target_date: e.target.value })}
              required
              min={new Date().toISOString().split('T')[0]}
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            />
            <select
              value={newGoal.category_id}
              onChange={(e) => setNewGoal({ ...newGoal, category_id: e.target.value })}
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            >
              <option value="">Link to Category (optional)</option>
              {categories.filter(c => c.category_type === 'savings').map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={newGoal.account_id}
              onChange={(e) => setNewGoal({ ...newGoal, account_id: e.target.value })}
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            >
              <option value="">Select Account</option>
              {accounts.filter(a => a.type === 'savings' || a.type === 'checking').map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            {/* Add this after your existing form fields, before the notes textarea */}

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                Target Type
              </label>
              <select
                value={newGoal.target_type}
                onChange={(e) => setNewGoal({ ...newGoal, target_type: e.target.value })}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '4px'
                }}
              >
                <option value="balance">Balance Goal (Save a specific amount)</option>
                <option value="monthly">Monthly Funding Goal (Assign each month)</option>
                <option value="by_date">Target Date Goal (Save by a date)</option>
              </select>
            </div>
            <textarea
              placeholder="Notes (optional)"
              value={newGoal.notes}
              onChange={(e) => setNewGoal({ ...newGoal, notes: e.target.value })}
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px',
                gridColumn: '1 / -1'
              }}
              rows="2"
            />
            <div style={{ display: 'flex', gap: '10px', gridColumn: '1 / -1' }}>
              <button
                type="submit"
                style={{
                  background: '#10B981',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Create Goal
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                style={{
                  background: '#6B7280',
                  color: 'white',
                  border: 'none',
                  padding: '10px 20px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Edit Goal Form */}
      {editingGoal && (
        <div style={{
          background: '#1F2937',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #F59E0B'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Edit Goal</h3>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '15px'
          }}>
            <input
              type="text"
              placeholder="Goal Name"
              value={editingGoal.name}
              onChange={(e) => setEditingGoal({ ...editingGoal, name: e.target.value })}
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            />
            <input
              type="number"
              placeholder="Target Amount"
              value={editingGoal.target_amount}
              onChange={(e) => setEditingGoal({ ...editingGoal, target_amount: e.target.value })}
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            />
            <input
              type="date"
              placeholder="Target Date"
              value={editingGoal.target_date}
              onChange={(e) => setEditingGoal({ ...editingGoal, target_date: e.target.value })}
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            />
            <select
              value={editingGoal.category_id || ''}
              onChange={(e) => setEditingGoal({ ...editingGoal, category_id: e.target.value })}
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            >
              <option value="">Link to Category (optional)</option>
              {categories.filter(c => c.category_type === 'savings').map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={editingGoal.account_id || ''}
              onChange={(e) => setEditingGoal({ ...editingGoal, account_id: e.target.value })}
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            >
              <option value="">Select Account</option>
              {accounts.filter(a => a.type === 'savings' || a.type === 'checking').map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <textarea
              placeholder="Notes (optional)"
              value={editingGoal.notes || ''}
              onChange={(e) => setEditingGoal({ ...editingGoal, notes: e.target.value })}
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px',
                gridColumn: '1 / -1'
              }}
              rows="2"
            />
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '15px' }}>
            <button
              onClick={handleUpdateGoal}
              style={{
                flex: 1,
                background: '#F59E0B',
                color: 'white',
                border: 'none',
                padding: '10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Save Changes
            </button>
            <button
              onClick={() => setEditingGoal(null)}
              style={{
                flex: 1,
                background: '#6B7280',
                color: 'white',
                border: 'none',
                padding: '10px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Goals Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
        gap: '20px'
      }}>
        {goals.map(goal => {
          const stats = calculateGoalProgress(goal);

          return (
            <div
              key={goal.id}
              style={{
                background: '#1F2937',
                borderRadius: '12px',
                padding: '20px',
                border: stats.isCompleted ? '2px solid #10B981' :
                  stats.isBehind ? '2px solid #F59E0B' : '1px solid #374151',
                position: 'relative',
                overflow: 'hidden'
              }}
            >
              {/* Status Badge (if completed) */}
              {stats.isCompleted && (
                <div style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  background: '#10B981',
                  color: 'white',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  ✓ Completed
                </div>
              )}

              {/* Goal Header - with target type badge */}
              <div style={{ marginBottom: '15px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <h3 style={{ margin: 0, fontSize: '18px' }}>{goal.name}</h3>
                  <span style={{
                    background: goal.target_type === 'monthly' ? '#3B82F620' :
                      goal.target_type === 'balance' ? '#10B98120' : '#8B5CF620',
                    color: goal.target_type === 'monthly' ? '#3B82F6' :
                      goal.target_type === 'balance' ? '#10B981' : '#8B5CF6',
                    padding: '2px 8px',
                    borderRadius: '12px',
                    fontSize: '10px',
                    fontWeight: 'bold'
                  }}>
                    {goal.target_type === 'monthly' ? 'Monthly' :
                      goal.target_type === 'balance' ? 'Balance Goal' : 'Target Date'}
                  </span>
                </div>
                {goal.notes && (
                  <div style={{ color: '#9CA3AF', fontSize: '12px', marginTop: '4px' }}>
                    {goal.notes}
                  </div>
                )}
              </div>

              {/* Amounts */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                marginBottom: '15px'
              }}>
                <div>
                  <div style={{ color: '#9CA3AF', fontSize: '11px' }}>Target</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
                    {formatCurrency(goal.target_amount)}
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ color: '#9CA3AF', fontSize: '11px' }}>Current</div>
                  <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#F59E0B' }}>
                    {formatCurrency(goal.current_amount)}
                  </div>
                </div>
              </div>

              {/* Progress Bar */}
              <div style={{ marginBottom: '15px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '12px',
                  color: '#9CA3AF',
                  marginBottom: '5px'
                }}>
                  <span>Progress</span>
                  <span>{stats.progress.toFixed(1)}%</span>
                </div>
                <div style={{
                  width: '100%',
                  height: '8px',
                  background: '#374151',
                  borderRadius: '4px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${stats.progress}%`,
                    height: '100%',
                    background: stats.isCompleted ? '#10B981' : '#3B82F6',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease'
                  }} />
                </div>
              </div>

              {/* Goal Details - shows different info based on target type */}
              <div style={{
                background: '#111827',
                padding: '12px',
                borderRadius: '6px',
                marginBottom: '15px'
              }}>
                {/* Monthly target specific info */}
                {stats.displayType === 'monthly' && (
                  <>
                    <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '4px' }}>
                      Monthly Progress
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                      {formatCurrency(goal.current_amount)} / {formatCurrency(goal.target_amount)}
                    </div>
                    <div style={{ fontSize: '12px', color: stats.neededThisMonth > 0 ? '#F59E0B' : '#10B981' }}>
                      {stats.neededThisMonth > 0
                        ? `Need ${formatCurrency(stats.neededThisMonth)} more this month`
                        : 'Monthly target met!'}
                    </div>
                  </>
                )}

                {/* Balance target specific info */}
                {stats.displayType === 'balance' && (
                  <>
                    <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '4px' }}>
                      Remaining
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#EF4444' }}>
                      {formatCurrency(stats.remaining)}
                    </div>
                    <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                      To reach your goal
                    </div>
                  </>
                )}

                {/* By-date target specific info */}
                {stats.displayType === 'by_date' && stats.monthsRemaining > 0 && (
                  <>
                    <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '4px' }}>
                      Monthly Contribution Needed
                    </div>
                    <div style={{ fontSize: '14px', fontWeight: 'bold', color: '#F59E0B' }}>
                      {formatCurrency(stats.monthlyNeeded)} / month
                    </div>
                    <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                      {stats.monthsRemaining} months remaining until {new Date(goal.target_date).toLocaleDateString()}
                    </div>
                  </>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={() => handleContribute(goal)}
                  style={{
                    flex: 1,
                    background: '#10B981',
                    color: 'white',
                    border: 'none',
                    padding: '8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                >
                  + Contribute
                </button>
                <button
                  onClick={() => setEditingGoal(goal)}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: '1px solid #3B82F6',
                    color: '#3B82F6',
                    padding: '8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteGoal(goal.id)}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: '1px solid #EF4444',
                    color: '#EF4444',
                    padding: '8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: 'bold'
                  }}
                >
                  Delete
                </button>
              </div>

              {/* Quick Tips */}
              {!stats.isCompleted && stats.monthlyNeeded > 0 && (
                <div style={{
                  marginTop: '10px',
                  padding: '8px',
                  background: '#111827',
                  borderRadius: '4px',
                  fontSize: '12px',
                  color: '#9CA3AF'
                }}>
                  💡 {stats.monthlyNeeded <= 100
                    ? `Just ${formatCurrency(stats.monthlyNeeded)}/month - you can do this!`
                    : stats.monthlyNeeded <= 500
                      ? `Save ${formatCurrency(stats.monthlyNeeded)}/month to reach your goal`
                      : `Consider extending your timeline to reduce monthly contributions`
                  }
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}