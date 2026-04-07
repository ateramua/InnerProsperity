import React, { useState } from 'react';

const SmartBudgetAllocator = ({ 
  categories, 
  unassignedFunds, 
  formatCurrency, 
  calculateTargetProgress,
  onApplyAllocation 
}) => {
  const [allocationPlan, setAllocationPlan] = useState([]);
  const [showPreview, setShowPreview] = useState(false);

  const calculateAllocation = () => {
    const activeCategories = categories.filter(c => !c.archived);
    let allocations = [];
    let remainingFunds = unassignedFunds;

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

      return { ...cat, priority, neededAmount };
    }).filter(c => c.priority < 6 && c.neededAmount > 0)
      .sort((a, b) => a.priority - b.priority);

    for (const cat of prioritized) {
      if (remainingFunds <= 0) break;
      let amountToAssign = Math.min(cat.neededAmount, remainingFunds);
      if (amountToAssign > 0) {
        allocations.push({
          categoryId: cat.id,
          name: cat.name,
          amount: amountToAssign
        });
        remainingFunds -= amountToAssign;
      }
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
        Available to allocate: {formatCurrency(unassignedFunds)}
      </p>
      <button onClick={calculateAllocation} style={styles.button}>
        Generate Allocation Plan
      </button>
      {showPreview && allocationPlan.length > 0 && (
        <div style={styles.preview}>
          <div style={styles.previewTitle}>Allocation Plan:</div>
          {allocationPlan.map((alloc, i) => (
            <div key={i} style={styles.item}>
              <span>{alloc.name}</span>
              <span style={styles.amount}>{formatCurrency(alloc.amount)}</span>
            </div>
          ))}
          <div style={styles.total}>
            Total: {formatCurrency(allocationPlan.reduce((s, a) => s + a.amount, 0))}
          </div>
          <button onClick={handleApply} style={styles.applyButton}>
            Apply Allocation
          </button>
          <button onClick={() => setShowPreview(false)} style={styles.cancelButton}>
            Cancel
          </button>
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
  button: {
    width: '100%',
    padding: '10px',
    backgroundColor: '#8B5CF6',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: 'pointer',
    fontWeight: '500'
  },
  preview: {
    marginTop: '12px',
    backgroundColor: '#0F172A',
    borderRadius: '8px',
    padding: '12px'
  },
  previewTitle: {
    color: '#94A3B8',
    fontSize: '11px',
    marginBottom: '8px'
  },
  item: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px',
    borderBottom: '1px solid #334155',
    fontSize: '12px',
    color: '#FFFFFF'
  },
  amount: {
    color: '#60A5FA',
    fontWeight: '500'
  },
  total: {
    padding: '8px',
    textAlign: 'right',
    fontSize: '12px',
    fontWeight: '600',
    color: '#4ADE80',
    borderTop: '1px solid #334155',
    marginTop: '4px'
  },
  applyButton: {
    width: '100%',
    padding: '8px',
    backgroundColor: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    marginTop: '8px',
    fontWeight: '500'
  },
  cancelButton: {
    width: '100%',
    padding: '8px',
    backgroundColor: '#374151',
    color: 'white',
    border: 'none',
    borderRadius: '6px',
    cursor: 'pointer',
    marginTop: '8px'
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
