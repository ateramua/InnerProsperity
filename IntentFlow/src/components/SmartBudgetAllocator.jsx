import React, { useState } from 'react';
import GoalReportsView from '../components/GoalReportsView';
import SmartBudgetAllocator from '../components/SmartBudgetAllocator';

const SmartBudgetAllocator = ({ 
  categories, 
  unassignedFunds, 
  formatCurrency, 
  calculateTargetProgress,
  onApplyAllocation 
}) => {
  const [allocationMethod, setAllocationMethod] = useState('priority');
  const [allocationPlan, setAllocationPlan] = useState([]);
  const [showPreview, setShowPreview] = useState(false);

  const calculateAllocation = () => {
    const activeCategories = categories.filter(c => !c.archived);
    let allocations = [];
    let remainingFunds = unassignedFunds;

    switch (allocationMethod) {
      case 'priority':
        const prioritized = activeCategories.map(cat => {
          const info = calculateTargetProgress(cat);
          let priority = 5;
          let neededAmount = 0;

          if ((cat.available || 0) < 0) {
            priority = 1;
            neededAmount = Math.abs(cat.available || 0);
          } else if (info.status === 'partial' && cat.target_type === 'monthly') {
            priority = 2;
            neededAmount = info.needed;
          } else if (info.status === 'unfunded' && cat.target_type === 'monthly') {
            priority = 3;
            neededAmount = info.needed;
          } else if (info.status === 'in-progress' && cat.target_type === 'by_date') {
            priority = 4;
            neededAmount = info.monthlyNeeded || info.needed;
          } else if (info.status === 'in-progress' && cat.target_type === 'balance') {
            priority = 5;
            neededAmount = info.needed;
          }

          return { ...cat, priority, neededAmount, info };
        }).filter(c => c.priority < 6 && c.neededAmount > 0)
          .sort((a, b) => a.priority - b.priority);

        for (const cat of prioritized) {
          if (remainingFunds <= 0) break;
          let amountToAssign = Math.min(cat.neededAmount, remainingFunds);
          if (amountToAssign > 0) {
            allocations.push({
              categoryId: cat.id,
              name: cat.name,
              amount: amountToAssign,
              reason: `Priority ${cat.priority}`
            });
            remainingFunds -= amountToAssign;
          }
        }
        break;

      case 'balanced':
        const underfunded = activeCategories.filter(cat => {
          const info = calculateTargetProgress(cat);
          return info.status === 'partial' || info.status === 'unfunded' || info.status === 'in-progress';
        }).map(cat => {
          const info = calculateTargetProgress(cat);
          return { ...cat, neededAmount: info.needed };
        }).filter(c => c.neededAmount > 0);

        if (underfunded.length > 0) {
          const amountPerCategory = remainingFunds / underfunded.length;
          underfunded.forEach(cat => {
            if (remainingFunds > 0) {
              let amountToAssign = Math.min(amountPerCategory, cat.neededAmount, remainingFunds);
              if (amountToAssign > 0) {
                allocations.push({
                  categoryId: cat.id,
                  name: cat.name,
                  amount: amountToAssign,
                  reason: 'Balanced distribution'
                });
                remainingFunds -= amountToAssign;
              }
            }
          });
        }
        break;
    }

    setAllocationPlan(allocations);
    setShowPreview(true);
  };

  const handleApply = () => {
    if (allocationPlan.length > 0) {
      onApplyAllocation(allocationPlan);
      setShowPreview(false);
      setAllocationPlan([]);
    }
  };

  const getTotalAllocation = () => {
    return allocationPlan.reduce((sum, a) => sum + a.amount, 0);
  };

  if (unassignedFunds <= 0) {
    return (
      <div style={styles.container}>
        <h3 style={styles.title}>🤖 Smart Budget Allocator</h3>
        <div style={styles.noFundsMessage}>
          💰 Add income to enable smart allocation
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>🤖 Smart Budget Allocator</h3>
      <p style={styles.description}>
        Available: {formatCurrency(unassignedFunds)}
      </p>

      <div style={styles.methodSelector}>
        <select 
          value={allocationMethod} 
          onChange={(e) => setAllocationMethod(e.target.value)}
          style={styles.select}
        >
          <option value="priority">🎯 Priority-Based (Urgent first)</option>
          <option value="balanced">⚖️ Balanced (Spread evenly)</option>
        </select>
      </div>

      <button 
        onClick={calculateAllocation} 
        style={styles.calculateButton}
      >
        Generate Plan
      </button>

      {showPreview && allocationPlan.length > 0 && (
        <div style={styles.previewContainer}>
          <div style={styles.allocationList}>
            {allocationPlan.map((alloc, index) => (
              <div key={index} style={styles.allocationItem}>
                <span style={styles.allocationName}>{alloc.name}</span>
                <span style={styles.allocationAmount}>{formatCurrency(alloc.amount)}</span>
              </div>
            ))}
          </div>
          
          <div style={styles.previewFooter}>
            <div style={styles.totalAllocation}>
              Total: {formatCurrency(getTotalAllocation())}
            </div>
            <button onClick={handleApply} style={styles.applyButton}>
              Apply
            </button>
            <button onClick={() => setShowPreview(false)} style={styles.cancelButton}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    backgroundColor: '#1E3A8A',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '20px',
    border: '1px solid #334155'
  },
  title: {
    color: '#FFFFFF',
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '8px'
  },
  description: {
    color: '#94A3B8',
    fontSize: '12px',
    marginBottom: '12px'
  },
  methodSelector: {
    marginBottom: '12px'
  },
  select: {
    width: '100%',
    padding: '8px 12px',
    backgroundColor: '#0F172A',
    border: '1px solid #334155',
    borderRadius: '8px',
    color: '#FFFFFF',
    fontSize: '13px'
  },
  calculateButton: {
    width: '100%',
    padding: '10px',
    backgroundColor: '#8B5CF6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500',
    fontSize: '14px'
  },
  previewContainer: {
    marginTop: '12px',
    backgroundColor: '#0F172A',
    borderRadius: '8px',
    padding: '12px'
  },
  allocationList: {
    maxHeight: '200px',
    overflowY: 'auto'
  },
  allocationItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px',
    borderBottom: '1px solid #334155',
    fontSize: '12px'
  },
  allocationName: {
    color: '#FFFFFF'
  },
  allocationAmount: {
    color: '#60A5FA',
    fontWeight: '500'
  },
  previewFooter: {
    marginTop: '12px',
    paddingTop: '12px',
    borderTop: '1px solid #334155',
    display: 'flex',
    gap: '8px',
    alignItems: 'center'
  },
  totalAllocation: {
    flex: 1,
    fontSize: '12px',
    color: '#4ADE80'
  },
  applyButton: {
    padding: '6px 12px',
    backgroundColor: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  cancelButton: {
    padding: '6px 12px',
    backgroundColor: '#374151',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '12px'
  },
  noFundsMessage: {
    padding: '12px',
    backgroundColor: '#0F172A',
    borderRadius: '8px',
    textAlign: 'center',
    color: '#F59E0B',
    fontSize: '13px'
  }
};

export default SmartBudgetAllocator;