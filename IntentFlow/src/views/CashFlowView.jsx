// src/views/CashFlowView.jsx
import React, { useState, useEffect } from 'react';

const CashFlowView = ({ 
  budgetData = { categories: [] },
  transactions = [],
  accounts = [],
  creditCards = [],
  loans = [],
  selectedMonth,
  onMonthChange
}) => {
  const [internalSelectedMonth, setInternalSelectedMonth] = useState(selectedMonth || new Date());
  const [cashFlowData, setCashFlowData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categoryGroups, setCategoryGroups] = useState([]);
  const [expandedGroups, setExpandedGroups] = useState({});

  // Use external month if provided, otherwise use internal state
  const currentMonth = selectedMonth || internalSelectedMonth;

  // Format currency helper
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  // Get color based on value
  const getValueColor = (value) => {
    if (value > 0) return '#4ADE80';
    if (value < 0) return '#F87171';
    return '#9CA3AF';
  };

  // Load category groups
  const loadCategoryGroups = async () => {
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (userResult?.success && userResult?.data) {
        const groupsResult = await window.electronAPI.getCategoryGroups(userResult.data.id);
        if (groupsResult?.success) {
          setCategoryGroups(groupsResult.data || []);
        }
      }
    } catch (error) {
      console.error('Error loading category groups:', error);
    }
  };

  // Toggle group expansion
  const toggleGroup = (groupId) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupId]: !prev[groupId]
    }));
  };

  // Calculate cash flow for selected month
  useEffect(() => {
    loadCategoryGroups();
  }, []);

  useEffect(() => {
    calculateCashFlow();
  }, [currentMonth, budgetData, transactions, accounts, creditCards, loans, categoryGroups]);

  const handleMonthChange = (direction) => {
    const newDate = new Date(currentMonth);
    newDate.setMonth(currentMonth.getMonth() + direction);
    if (onMonthChange) {
      onMonthChange(newDate);
    } else {
      setInternalSelectedMonth(newDate);
    }
  };

  const calculateCashFlow = () => {
    setLoading(true);
    
    try {
      // Get month boundaries
      const year = currentMonth.getFullYear();
      const month = currentMonth.getMonth();
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0);

      // Filter transactions for selected month
      const monthTransactions = transactions.filter(t => {
        const tDate = new Date(t.date);
        return tDate >= startDate && tDate <= endDate;
      });

      // 1. INCOME CALCULATION
      const totalIncome = monthTransactions
        .filter(t => t.amount > 0)
        .reduce((sum, t) => sum + t.amount, 0);

      // 2. BUDGET CALCULATION (FROM PropertyMapView)
      const budgetCategories = budgetData.categories || [];
      
      // Create a map of category ID to its budgeted amount
      const budgetedByCategory = {};
      let totalBudgeted = 0;
      
      budgetCategories.forEach(category => {
        if (category.archived) return;
        const assignedAmount = category.assigned || 0;
        budgetedByCategory[category.id] = assignedAmount;
        totalBudgeted += assignedAmount;
      });

      // 3. ACTUAL SPENDING CALCULATION (FROM TRANSACTIONS)
      const actualByCategory = {};
      let totalActual = 0;
      
      monthTransactions.forEach(transaction => {
        if (transaction.amount >= 0) return; // Only expenses
        
        const amount = Math.abs(transaction.amount);
        const categoryId = transaction.category_id;
        
        if (categoryId) {
          actualByCategory[categoryId] = (actualByCategory[categoryId] || 0) + amount;
        }
        totalActual += amount;
      });

      // 4. BUILD CATEGORY DETAILS WITH BUDGET VS ACTUAL
      const categoryDetails = [];
      
      budgetCategories.forEach(category => {
        if (category.archived) return;
        
        const budgeted = budgetedByCategory[category.id] || 0;
        const actual = actualByCategory[category.id] || 0;
        const variance = actual - budgeted;
        
        categoryDetails.push({
          id: category.id,
          name: category.name,
          groupId: category.groupId,
          budgeted,
          actual,
          variance,
          varianceColor: getValueColor(-variance)
        });
      });

      // 5. GROUP CATEGORIES BY THEIR GROUP
      const groupedData = categoryGroups.map(group => {
        const groupCategories = categoryDetails.filter(c => c.groupId === group.id);
        const groupBudgeted = groupCategories.reduce((sum, c) => sum + c.budgeted, 0);
        const groupActual = groupCategories.reduce((sum, c) => sum + c.actual, 0);
        const groupVariance = groupActual - groupBudgeted;
        
        return {
          id: group.id,
          name: group.name,
          categories: groupCategories,
          budgeted: groupBudgeted,
          actual: groupActual,
          variance: groupVariance,
          isExpanded: expandedGroups[group.id] !== false // Default to expanded
        };
      }).filter(group => group.categories.length > 0); // Only show groups with categories

      // 6. CASHFLOW RESULT
      const netCashflow = totalIncome - totalActual;

      // 7. ACCOUNT BALANCE CHANGES
      const startingChecking = accounts
        .filter(a => a.type === 'checking')
        .reduce((sum, a) => sum + (a.balance || 0), 0);
      
      const startingSavings = accounts
        .filter(a => a.type === 'savings')
        .reduce((sum, a) => sum + (a.balance || 0), 0);

      const endingChecking = startingChecking + (netCashflow * 0.6);
      const endingSavings = startingSavings + (netCashflow * 0.4);

      // 8. DEBT CALCULATIONS
      const totalCreditCardDebt = creditCards.reduce((sum, c) => sum + Math.abs(c.balance || 0), 0);
      const totalLoanDebt = loans.reduce((sum, l) => sum + Math.abs(l.balance || 0), 0);
      const totalDebt = totalCreditCardDebt + totalLoanDebt;
      
      // Calculate debt paid this month (from debt-related categories)
      const debtPaidThisMonth = categoryDetails
        .filter(c => c.name.toLowerCase().includes('debt') || c.name.toLowerCase().includes('credit card') || c.name.toLowerCase().includes('loan'))
        .reduce((sum, c) => sum + c.actual, 0);

      // 9. NET WORTH
      const totalAssets = endingChecking + endingSavings;
      const netWorth = totalAssets - totalDebt;
      const prevTotalAssets = startingChecking + startingSavings;
      const prevNetWorth = prevTotalAssets - totalDebt;
      const netWorthChange = netWorth - prevNetWorth;

      setCashFlowData({
        income: totalIncome,
        totalBudgeted,
        totalActual,
        totalVariance: totalActual - totalBudgeted,
        netCashflow,
        groupedData,
        categoryDetails,
        accounts: {
          starting: { checking: startingChecking, savings: startingSavings, total: startingChecking + startingSavings },
          ending: { checking: endingChecking, savings: endingSavings, total: endingChecking + endingSavings },
          change: netCashflow
        },
        debt: {
          total: totalDebt,
          creditCards: totalCreditCardDebt,
          loans: totalLoanDebt,
          paidThisMonth: debtPaidThisMonth
        },
        netWorth: {
          current: netWorth,
          previous: prevNetWorth,
          change: netWorthChange
        }
      });

    } catch (error) {
      console.error('Error calculating cash flow:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !cashFlowData) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Calculating your cash flow...</p>
      </div>
    );
  }

  const monthName = currentMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

  return (
    <div style={styles.container}>
      {/* Header with Month Selector */}
      <div style={styles.header}>
        <h1 style={styles.title}>💰 Cash Flow Dashboard</h1>
        <div style={styles.monthSelector}>
          <button onClick={() => handleMonthChange(-1)} style={styles.monthButton}>◀</button>
          <span style={styles.monthDisplay}>{monthName}</span>
          <button onClick={() => handleMonthChange(1)} style={styles.monthButton}>▶</button>
        </div>
      </div>

      {/* Summary Cards - Top Row */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>💰</div>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Total Income</span>
            <span style={styles.summaryValue}>{formatCurrency(cashFlowData.income)}</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>📊</div>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Total Budgeted</span>
            <span style={styles.summaryValue}>{formatCurrency(cashFlowData.totalBudgeted)}</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>💸</div>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Actual Spending</span>
            <span style={styles.summaryValue}>{formatCurrency(cashFlowData.totalActual)}</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>⚡</div>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Net Cashflow</span>
            <span style={{...styles.summaryValue, color: getValueColor(cashFlowData.netCashflow)}}>
              {formatCurrency(cashFlowData.netCashflow)}
            </span>
          </div>
        </div>
      </div>

      {/* Budget vs Actual Comparison - Dynamic Categories from Database */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>📋 Budget vs. Actual by Category</h2>
        <div style={styles.comparisonTable}>
          {/* Header */}
          <div style={styles.tableHeader}>
            <span style={{...styles.tableHeaderCell, textAlign: 'left'}}>Category Group</span>
            <span style={{...styles.tableHeaderCell, textAlign: 'right'}}>Budgeted</span>
            <span style={{...styles.tableHeaderCell, textAlign: 'right'}}>Actual</span>
            <span style={{...styles.tableHeaderCell, textAlign: 'right'}}>Variance</span>
          </div>

          {/* Dynamic Group Rows */}
          {cashFlowData.groupedData.map(group => (
            <React.Fragment key={group.id}>
              {/* Group Header Row */}
              <div 
                style={styles.groupHeaderRow}
                onClick={() => toggleGroup(group.id)}
              >
                <div style={styles.groupHeaderLeft}>
                  <span style={styles.expandIcon}>
                    {group.isExpanded ? '▼' : '▶'}
                  </span>
                  <span style={styles.groupName}>{group.name}</span>
                  <span style={styles.categoryCount}>
                    ({group.categories.length} categories)
                  </span>
                </div>
                <div style={styles.groupHeaderTotals}>
                  <span style={styles.groupBudgeted}>{formatCurrency(group.budgeted)}</span>
                  <span style={styles.groupActual}>{formatCurrency(group.actual)}</span>
                  <span style={{
                    ...styles.groupVariance,
                    color: getValueColor(-group.variance)
                  }}>
                    {group.variance > 0 ? '+' : ''}{formatCurrency(group.variance)}
                  </span>
                </div>
              </div>

              {/* Category Rows (only when expanded) */}
              {group.isExpanded && (
                <div style={styles.categoryRows}>
                  {group.categories.map(category => (
                    <div key={category.id} style={styles.categoryRow}>
                      <div style={styles.categoryNameCell}>
                        <span style={styles.categoryIndent}>└─</span>
                        <span style={styles.categoryName}>{category.name}</span>
                      </div>
                      <div style={styles.categoryBudgeted}>{formatCurrency(category.budgeted)}</div>
                      <div style={styles.categoryActual}>{formatCurrency(category.actual)}</div>
                      <div style={{
                        ...styles.categoryVariance,
                        color: category.varianceColor
                      }}>
                        {category.variance > 0 ? '+' : ''}{formatCurrency(category.variance)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </React.Fragment>
          ))}

          {/* Divider */}
          <div style={styles.tableDivider}></div>

          {/* Total Row */}
          <div style={styles.tableTotalRow}>
            <span style={styles.tableTotalLabel}>TOTAL</span>
            <span style={styles.tableTotalAmount}>{formatCurrency(cashFlowData.totalBudgeted)}</span>
            <span style={styles.tableTotalAmount}>{formatCurrency(cashFlowData.totalActual)}</span>
            <span style={{
              ...styles.tableTotalAmount,
              color: getValueColor(-cashFlowData.totalVariance)
            }}>
              {cashFlowData.totalVariance > 0 ? '+' : ''}{formatCurrency(cashFlowData.totalVariance)}
            </span>
          </div>
        </div>
      </div>

      {/* Cash Flow Equation */}
      <div style={styles.equationSection}>
        <h2 style={styles.sectionTitle}>🧮 Cash Flow Equation</h2>
        <div style={styles.equation}>
          <span style={styles.equationText}>
            {formatCurrency(cashFlowData.income)} Income
          </span>
          <span style={styles.equationOperator}>−</span>
          <span style={styles.equationText}>
            {formatCurrency(cashFlowData.totalActual)} Spending
          </span>
          <span style={styles.equationOperator}>=</span>
          <span style={{
            ...styles.equationResult,
            color: getValueColor(cashFlowData.netCashflow)
          }}>
            {formatCurrency(cashFlowData.netCashflow)} Net Cashflow
          </span>
        </div>
      </div>

      {/* Account Impact */}
      <div style={styles.accountSection}>
        <h2 style={styles.sectionTitle}>🏦 Account Impact</h2>
        <div style={styles.accountGrid}>
          <div style={styles.accountCard}>
            <h3 style={styles.accountCardTitle}>Starting Balance</h3>
            <div style={styles.accountItem}>
              <span>Checking:</span>
              <span>{formatCurrency(cashFlowData.accounts.starting.checking)}</span>
            </div>
            <div style={styles.accountItem}>
              <span>Savings:</span>
              <span>{formatCurrency(cashFlowData.accounts.starting.savings)}</span>
            </div>
            <div style={styles.accountTotal}>
              <span>Total:</span>
              <span>{formatCurrency(cashFlowData.accounts.starting.total)}</span>
            </div>
          </div>
          <div style={styles.accountArrow}>→</div>
          <div style={styles.accountCard}>
            <h3 style={styles.accountCardTitle}>Ending Balance</h3>
            <div style={styles.accountItem}>
              <span>Checking:</span>
              <span>{formatCurrency(cashFlowData.accounts.ending.checking)}</span>
            </div>
            <div style={styles.accountItem}>
              <span>Savings:</span>
              <span>{formatCurrency(cashFlowData.accounts.ending.savings)}</span>
            </div>
            <div style={styles.accountTotal}>
              <span>Total:</span>
              <span style={{color: getValueColor(cashFlowData.accounts.change)}}>
                {formatCurrency(cashFlowData.accounts.ending.total)}
              </span>
            </div>
          </div>
          <div style={styles.accountChange}>
            <span>Change: </span>
            <span style={{color: getValueColor(cashFlowData.accounts.change)}}>
              {formatCurrency(cashFlowData.accounts.change)}
            </span>
          </div>
        </div>
      </div>

      {/* Debt & Net Worth */}
      <div style={styles.row}>
        <div style={styles.debtSection}>
          <h2 style={styles.sectionTitle}>💳 Debt Summary</h2>
          <div style={styles.debtItem}>
            <span>Credit Cards:</span>
            <span style={{color: '#F87171'}}>{formatCurrency(cashFlowData.debt.creditCards)}</span>
          </div>
          <div style={styles.debtItem}>
            <span>Loans:</span>
            <span style={{color: '#F87171'}}>{formatCurrency(cashFlowData.debt.loans)}</span>
          </div>
          <div style={styles.debtTotal}>
            <span>Total Debt:</span>
            <span style={{color: '#F87171'}}>{formatCurrency(cashFlowData.debt.total)}</span>
          </div>
          <div style={styles.debtPaid}>
            <span>Paid This Month:</span>
            <span style={{color: '#4ADE80'}}>{formatCurrency(cashFlowData.debt.paidThisMonth)}</span>
          </div>
        </div>

        <div style={styles.netWorthSection}>
          <h2 style={styles.sectionTitle}>📈 Net Worth</h2>
          <div style={styles.netWorthItem}>
            <span>Previous Month:</span>
            <span>{formatCurrency(cashFlowData.netWorth.previous)}</span>
          </div>
          <div style={styles.netWorthItem}>
            <span>Current:</span>
            <span style={{color: cashFlowData.netWorth.current >= 0 ? '#4ADE80' : '#F87171'}}>
              {formatCurrency(cashFlowData.netWorth.current)}
            </span>
          </div>
          <div style={styles.netWorthChange}>
            <span>Change:</span>
            <span style={{color: getValueColor(cashFlowData.netWorth.change)}}>
              {cashFlowData.netWorth.change > 0 ? '+' : ''}{formatCurrency(cashFlowData.netWorth.change)}
            </span>
          </div>
        </div>
      </div>

      {/* Insights */}
      <div style={styles.insightsSection}>
        <h2 style={styles.sectionTitle}>💡 Insights</h2>
        <div style={styles.insightsGrid}>
          {cashFlowData.netCashflow > 0 ? (
            <div style={styles.insightCard}>
              <span style={styles.insightIcon}>✅</span>
              <div>
                <h4 style={styles.insightTitle}>Positive Cash Flow</h4>
                <p style={styles.insightText}>
                  You have {formatCurrency(cashFlowData.netCashflow)} left after all spending.
                  Consider adding this to savings or debt repayment.
                </p>
              </div>
            </div>
          ) : cashFlowData.netCashflow < 0 ? (
            <div style={styles.insightCard}>
              <span style={styles.insightIcon}>⚠️</span>
              <div>
                <h4 style={styles.insightTitle}>Negative Cash Flow</h4>
                <p style={styles.insightText}>
                  You spent {formatCurrency(Math.abs(cashFlowData.netCashflow))} more than you earned.
                  Review your expenses, especially categories with negative variance.
                </p>
              </div>
            </div>
          ) : (
            <div style={styles.insightCard}>
              <span style={styles.insightIcon}>⚖️</span>
              <div>
                <h4 style={styles.insightTitle}>Breakeven</h4>
                <p style={styles.insightText}>
                  You spent exactly what you earned. Consider allocating funds to savings or debt reduction.
                </p>
              </div>
            </div>
          )}

          {cashFlowData.totalVariance > 0 && (
            <div style={styles.insightCard}>
              <span style={styles.insightIcon}>📉</span>
              <div>
                <h4 style={styles.insightTitle}>Under Budget</h4>
                <p style={styles.insightText}>
                  You spent {formatCurrency(Math.abs(cashFlowData.totalVariance))} less than budgeted.
                  Great job! Move the surplus to savings or debt.
                </p>
              </div>
            </div>
          )}

          {cashFlowData.totalVariance < 0 && (
            <div style={styles.insightCard}>
              <span style={styles.insightIcon}>📈</span>
              <div>
                <h4 style={styles.insightTitle}>Over Budget</h4>
                <p style={styles.insightText}>
                  You spent {formatCurrency(Math.abs(cashFlowData.totalVariance))} more than budgeted.
                  Review categories with negative variance for next month.
                </p>
              </div>
            </div>
          )}

          {cashFlowData.debt.paidThisMonth > 0 && (
            <div style={styles.insightCard}>
              <span style={styles.insightIcon}>🎯</span>
              <div>
                <h4 style={styles.insightTitle}>Debt Progress</h4>
                <p style={styles.insightText}>
                  You paid {formatCurrency(cashFlowData.debt.paidThisMonth)} toward debt this month.
                  Keep up the momentum!
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Define styles
const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
    color: '#0047AB'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '400px',
    color: '#9CA3AF'
  },
  spinner: {
    width: '40px',
    height: '40px',
    border: '3px solid #374151',
    borderTopColor: '#0047AB',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '1rem'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    flexWrap: 'wrap',
    gap: '1rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    margin: 0,
    color: '#0047AB'
  },
  monthSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    background: '#0047AB',
    padding: '0.5rem',
    borderRadius: '0.5rem',
    border: '1px solid #374151'
  },
  monthButton: {
    background: '#374151',
    border: 'none',
    color: 'white',
    width: '32px',
    height: '32px',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '1rem',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  monthDisplay: {
    fontSize: '1.1rem',
    fontWeight: '500',
    minWidth: '200px',
    textAlign: 'center'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem'
  },
  summaryCard: {
    background: '#0047AB',
    padding: '1.25rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  summaryIcon: {
    fontSize: '2rem'
  },
  summaryContent: {
    flex: 1
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold'
  },
  section: {
    background: '#0047AB',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    marginBottom: '2rem'
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: '0 0 1.5rem 0',
    color: 'white'
  },
  comparisonTable: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  tableHeader: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr',
    padding: '0.75rem',
    background: '#0047AB',
    borderRadius: '0.5rem',
    fontWeight: '600',
    color: '#9CA3AF',
    fontSize: '0.875rem'
  },
  tableHeaderCell: {},
  groupHeaderRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr',
    padding: '0.75rem',
    background: '#1E3A8A',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    alignItems: 'center',
    transition: 'background 0.2s'
  },
  groupHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  expandIcon: {
    fontSize: '10px',
    color: '#9CA3AF'
  },
  groupName: {
    fontWeight: '600',
    color: '#60A5FA'
  },
  categoryCount: {
    fontSize: '11px',
    color: '#9CA3AF'
  },
  groupHeaderTotals: {
    display: 'contents'
  },
  groupBudgeted: {
    textAlign: 'right',
    fontWeight: '500'
  },
  groupActual: {
    textAlign: 'right',
    fontWeight: '500'
  },
  groupVariance: {
    textAlign: 'right',
    fontWeight: '500'
  },
  categoryRows: {
    marginLeft: '24px'
  },
  categoryRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr',
    padding: '0.5rem 0.75rem',
    borderBottom: '1px solid #374151',
    fontSize: '0.875rem'
  },
  categoryNameCell: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px'
  },
  categoryIndent: {
    color: '#6B7280',
    fontSize: '12px'
  },
  categoryName: {
    color: '#D1D5DB'
  },
  categoryBudgeted: {
    textAlign: 'right',
    color: '#D1D5DB'
  },
  categoryActual: {
    textAlign: 'right',
    color: '#D1D5DB'
  },
  categoryVariance: {
    textAlign: 'right',
    fontWeight: '500'
  },
  tableDivider: {
    height: '1px',
    background: '#374151',
    margin: '0.5rem 0'
  },
  tableTotalRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr',
    padding: '0.75rem',
    background: '#0047AB',
    borderRadius: '0.5rem',
    fontWeight: 'bold'
  },
  tableTotalLabel: {
    textAlign: 'left'
  },
  tableTotalAmount: {
    textAlign: 'right'
  },
  equationSection: {
    background: 'linear-gradient(135deg, #0A2472, #1E3A8A)',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    marginBottom: '2rem',
    textAlign: 'center'
  },
  equation: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    flexWrap: 'wrap'
  },
  equationText: {
    fontSize: '1.25rem',
    background: '#0047AB',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.5rem'
  },
  equationOperator: {
    fontSize: '2rem',
    color: '#9CA3AF'
  },
  equationResult: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    background: '#0047AB',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.5rem'
  },
  accountSection: {
    background: '#0047AB',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    marginBottom: '2rem'
  },
  accountGrid: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '1rem',
    flexWrap: 'wrap'
  },
  accountCard: {
    flex: 1,
    minWidth: '250px',
    background: '#0047AB',
    padding: '1.5rem',
    borderRadius: '0.75rem'
  },
  accountCardTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    margin: '0 0 1rem 0',
    color: '#9CA3AF'
  },
  accountItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.5rem 0',
    borderBottom: '1px solid #374151'
  },
  accountTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.75rem 0 0 0',
    marginTop: '0.5rem',
    borderTop: '2px solid #374151',
    fontWeight: 'bold'
  },
  accountArrow: {
    fontSize: '2rem',
    color: '#9CA3AF'
  },
  accountChange: {
    width: '100%',
    textAlign: 'center',
    marginTop: '1rem',
    padding: '1rem',
    background: '#0047AB',
    borderRadius: '0.5rem',
    fontSize: '1.125rem'
  },
  row: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '1rem',
    marginBottom: '2rem'
  },
  debtSection: {
    background: '#0047AB',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
  },
  debtItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.75rem 0',
    borderBottom: '1px solid #374151'
  },
  debtTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '1rem 0',
    marginTop: '0.5rem',
    borderTop: '2px solid #374151',
    fontWeight: 'bold',
    fontSize: '1.125rem'
  },
  debtPaid: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.75rem 0',
    background: '#0047AB',
    borderRadius: '0.5rem',
    marginTop: '1rem',
    padding: '1rem'
  },
  netWorthSection: {
    background: '#0047AB',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
  },
  netWorthItem: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '0.75rem 0',
    borderBottom: '1px solid #374151'
  },
  netWorthChange: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '1rem 0',
    marginTop: '0.5rem',
    borderTop: '2px solid #374151',
    fontWeight: 'bold',
    fontSize: '1.125rem'
  },
  insightsSection: {
    background: '#0047AB',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
  },
  insightsGrid: {
    display: 'grid',
    gap: '1rem'
  },
  insightCard: {
    display: 'flex',
    gap: '1rem',
    padding: '1rem',
    background: '#0047AB',
    borderRadius: '0.5rem',
    border: '1px solid #374151'
  },
  insightIcon: {
    fontSize: '1.5rem'
  },
  insightTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    margin: '0 0 0.25rem 0',
    color: 'white'
  },
  insightText: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    margin: 0
  }
};

export default CashFlowView;