// src/views/CashFlowView.jsx
import React, { useState, useEffect } from 'react';

const CashFlowView = ({ 
  budgetData = { categories: [] },
  transactions = [],
  accounts = [],
  creditCards = [],
  loans = []
}) => {
  const [selectedMonth, setSelectedMonth] = useState(new Date());
  const [cashFlowData, setCashFlowData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Format currency helper
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount || 0);
  };

  // Format percentage
  const formatPercentage = (value) => {
    return `${(value || 0).toFixed(1)}%`;
  };

  // Get color based on value
  const getValueColor = (value) => {
    if (value > 0) return '#4ADE80';
    if (value < 0) return '#F87171';
    return '#9CA3AF';
  };

  // Calculate cash flow for selected month
  useEffect(() => {
    calculateCashFlow();
  }, [selectedMonth, budgetData, transactions, accounts, creditCards, loans]);

  const calculateCashFlow = () => {
    setLoading(true);
    
    try {
      // Get month boundaries
      const year = selectedMonth.getFullYear();
      const month = selectedMonth.getMonth();
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

      // 2. BUDGET CALCULATION (THE PLAN)
      const budgetCategories = budgetData.categories || [];
      
      // Categorize budget assignments
      const budgeted = {
        fixed: budgetCategories
          .filter(c => c.groupId === 'fixed' || (c.name && c.name.match(/rent|mortgage|utilities|insurance/i)))
          .reduce((sum, c) => sum + (c.assigned || 0), 0),
        
        variable: budgetCategories
          .filter(c => c.groupId === 'variable' || (c.name && c.name.match(/groceries|dining|transportation|entertainment/i)))
          .reduce((sum, c) => sum + (c.assigned || 0), 0),
        
        debt: budgetCategories
          .filter(c => c.groupId === 'debt' || (c.name && c.name.match(/credit card|loan|debt/i)))
          .reduce((sum, c) => sum + (c.assigned || 0), 0),
        
        savings: budgetCategories
          .filter(c => c.groupId === 'savings' || (c.name && c.name.match(/savings|emergency|invest/i)))
          .reduce((sum, c) => sum + (c.assigned || 0), 0)
      };

      budgeted.total = budgeted.fixed + budgeted.variable + budgeted.debt + budgeted.savings;

      // 3. ACTUAL SPENDING CALCULATION (THE REALITY)
      const actual = {
        fixed: monthTransactions
          .filter(t => t.amount < 0 && t.category?.match(/rent|mortgage|utilities|insurance/i))
          .reduce((sum, t) => sum + Math.abs(t.amount), 0),
        
        variable: monthTransactions
          .filter(t => t.amount < 0 && t.category?.match(/groceries|dining|transportation|entertainment/i))
          .reduce((sum, t) => sum + Math.abs(t.amount), 0),
        
        debt: monthTransactions
          .filter(t => t.amount < 0 && t.category?.match(/credit card|loan|debt|payment/i))
          .reduce((sum, t) => sum + Math.abs(t.amount), 0),
        
        savings: monthTransactions
          .filter(t => t.amount < 0 && t.category?.match(/savings|emergency|invest|transfer/i))
          .reduce((sum, t) => sum + Math.abs(t.amount), 0)
      };

      actual.total = actual.fixed + actual.variable + actual.debt + actual.savings;

      // 4. VARIANCE CALCULATION
      const variance = {
        fixed: actual.fixed - budgeted.fixed,
        variable: actual.variable - budgeted.variable,
        debt: actual.debt - budgeted.debt,
        savings: actual.savings - budgeted.savings,
        total: actual.total - budgeted.total
      };

      // 5. CASHFLOW RESULT
      const netCashflow = totalIncome - actual.total;

      // 6. ACCOUNT BALANCE CHANGES
      // Get starting balances (end of previous month)
      const startingChecking = accounts
        .filter(a => a.type === 'checking')
        .reduce((sum, a) => sum + (a.balance || 0), 0);
      
      const startingSavings = accounts
        .filter(a => a.type === 'savings')
        .reduce((sum, a) => sum + (a.balance || 0), 0);

      // Calculate ending balances (current)
      const endingChecking = startingChecking + (netCashflow * 0.7); // Simplified - in reality would track actual
      const endingSavings = startingSavings + (netCashflow * 0.3);

      // 7. DEBT CALCULATIONS
      const totalCreditCardDebt = creditCards.reduce((sum, c) => sum + Math.abs(c.balance || 0), 0);
      const totalLoanDebt = loans.reduce((sum, l) => sum + Math.abs(l.balance || 0), 0);
      const totalDebt = totalCreditCardDebt + totalLoanDebt;

      // Debt paid this month (from transactions)
      const debtPaidThisMonth = actual.debt;

      // 8. NET WORTH
      const totalAssets = endingChecking + endingSavings;
      const netWorth = totalAssets - totalDebt;

      // Previous month net worth (simplified)
      const prevTotalAssets = startingChecking + startingSavings;
      const prevNetWorth = prevTotalAssets - totalDebt; // Assuming debt same for simplicity
      const netWorthChange = netWorth - prevNetWorth;

      setCashFlowData({
        income: totalIncome,
        budgeted,
        actual,
        variance,
        netCashflow,
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

  const handleMonthChange = (direction) => {
    const newDate = new Date(selectedMonth);
    newDate.setMonth(selectedMonth.getMonth() + direction);
    setSelectedMonth(newDate);
  };

  if (loading || !cashFlowData) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p>Calculating your cash flow...</p>
      </div>
    );
  }

  const monthName = selectedMonth.toLocaleString('default', { month: 'long', year: 'numeric' });

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
            <span style={styles.summaryValue}>{formatCurrency(cashFlowData.budgeted.total)}</span>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>💸</div>
          <div style={styles.summaryContent}>
            <span style={styles.summaryLabel}>Actual Spending</span>
            <span style={styles.summaryValue}>{formatCurrency(cashFlowData.actual.total)}</span>
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

      {/* Budget vs Actual Comparison */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>📋 Budget vs. Actual</h2>
        <div style={styles.comparisonTable}>
          {/* Header */}
          <div style={styles.tableHeader}>
            <span style={styles.tableHeaderCell}>Category</span>
            <span style={styles.tableHeaderCell}>Budgeted</span>
            <span style={styles.tableHeaderCell}>Actual</span>
            <span style={styles.tableHeaderCell}>Variance</span>
          </div>

          {/* Fixed Expenses */}
          <div style={styles.tableRow}>
            <span style={styles.tableCategory}>Fixed Expenses</span>
            <span style={styles.tableAmount}>{formatCurrency(cashFlowData.budgeted.fixed)}</span>
            <span style={styles.tableAmount}>{formatCurrency(cashFlowData.actual.fixed)}</span>
            <span style={{
              ...styles.tableAmount,
              color: getValueColor(-cashFlowData.variance.fixed)
            }}>
              {cashFlowData.variance.fixed > 0 ? '+' : ''}{formatCurrency(cashFlowData.variance.fixed)}
            </span>
          </div>

          {/* Variable Expenses */}
          <div style={styles.tableRow}>
            <span style={styles.tableCategory}>Variable Expenses</span>
            <span style={styles.tableAmount}>{formatCurrency(cashFlowData.budgeted.variable)}</span>
            <span style={styles.tableAmount}>{formatCurrency(cashFlowData.actual.variable)}</span>
            <span style={{
              ...styles.tableAmount,
              color: getValueColor(-cashFlowData.variance.variable)
            }}>
              {cashFlowData.variance.variable > 0 ? '+' : ''}{formatCurrency(cashFlowData.variance.variable)}
            </span>
          </div>

          {/* Debt Payments */}
          <div style={styles.tableRow}>
            <span style={styles.tableCategory}>Debt Payments</span>
            <span style={styles.tableAmount}>{formatCurrency(cashFlowData.budgeted.debt)}</span>
            <span style={styles.tableAmount}>{formatCurrency(cashFlowData.actual.debt)}</span>
            <span style={{
              ...styles.tableAmount,
              color: getValueColor(-cashFlowData.variance.debt)
            }}>
              {cashFlowData.variance.debt > 0 ? '+' : ''}{formatCurrency(cashFlowData.variance.debt)}
            </span>
          </div>

          {/* Savings */}
          <div style={styles.tableRow}>
            <span style={styles.tableCategory}>Savings</span>
            <span style={styles.tableAmount}>{formatCurrency(cashFlowData.budgeted.savings)}</span>
            <span style={styles.tableAmount}>{formatCurrency(cashFlowData.actual.savings)}</span>
            <span style={{
              ...styles.tableAmount,
              color: getValueColor(-cashFlowData.variance.savings)
            }}>
              {cashFlowData.variance.savings > 0 ? '+' : ''}{formatCurrency(cashFlowData.variance.savings)}
            </span>
          </div>

          {/* Divider */}
          <div style={styles.tableDivider}></div>

          {/* Total Row */}
          <div style={styles.tableTotalRow}>
            <span style={styles.tableTotalLabel}>TOTAL</span>
            <span style={styles.tableTotalAmount}>{formatCurrency(cashFlowData.budgeted.total)}</span>
            <span style={styles.tableTotalAmount}>{formatCurrency(cashFlowData.actual.total)}</span>
            <span style={{
              ...styles.tableTotalAmount,
              color: getValueColor(-cashFlowData.variance.total)
            }}>
              {cashFlowData.variance.total > 0 ? '+' : ''}{formatCurrency(cashFlowData.variance.total)}
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
            {formatCurrency(cashFlowData.actual.total)} Spending
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
        {/* Debt Summary */}
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

        {/* Net Worth */}
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
                  Consider adding this to your {cashFlowData.variance.savings < 0 ? 'savings' : 'debt repayment'}.
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
                  Review your {cashFlowData.variance.variable > 0 ? 'variable expenses' : 'fixed costs'}.
                </p>
              </div>
            </div>
          ) : (
            <div style={styles.insightCard}>
              <span style={styles.insightIcon}>⚖️</span>
              <div>
                <h4 style={styles.insightTitle}>Breakeven</h4>
                <p style={styles.insightText}>
                  You spent exactly what you earned. No progress on savings, but no new debt.
                </p>
              </div>
            </div>
          )}

          {cashFlowData.variance.variable > 0 && (
            <div style={styles.insightCard}>
              <span style={styles.insightIcon}>📊</span>
              <div>
                <h4 style={styles.insightTitle}>Overspent in Variable</h4>
                <p style={styles.insightText}>
                  You overspent by {formatCurrency(cashFlowData.variance.variable)} in variable expenses.
                  This was covered by {cashFlowData.variance.savings < 0 ? 'reduced savings' : 'future income'}.
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
                  {cashFlowData.debt.paidThisMonth > cashFlowData.budgeted.debt && ' Exceeding your budget!'}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Define styles without any document references
const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1200px',
    margin: '0 auto',
    color: 'white'
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
    borderTopColor: '#3B82F6',
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
    background: 'linear-gradient(135deg, #F59E0B, #10B981)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  monthSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    background: '#1F2937',
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
    justifyContent: 'center',
    ':hover': {
      background: '#4B5563'
    }
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
    background: '#1F2937',
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
    background: '#1F2937',
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
    background: '#111827',
    borderRadius: '0.5rem',
    fontWeight: '600',
    color: '#9CA3AF',
    fontSize: '0.875rem'
  },
  tableHeaderCell: {
    textAlign: 'right',
    '&:first-child': {
      textAlign: 'left'
    }
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr 1fr 1fr',
    padding: '0.75rem',
    borderBottom: '1px solid #374151'
  },
  tableCategory: {
    textAlign: 'left'
  },
  tableAmount: {
    textAlign: 'right'
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
    background: '#111827',
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
    background: '#1F2937',
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
    background: '#1F2937',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.5rem'
  },
  accountSection: {
    background: '#1F2937',
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
    background: '#111827',
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
    background: '#111827',
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
    background: '#1F2937',
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
    background: '#111827',
    borderRadius: '0.5rem',
    marginTop: '1rem',
    padding: '1rem'
  },
  netWorthSection: {
    background: '#1F2937',
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
    background: '#1F2937',
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
    background: '#111827',
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

// Add the keyframe animation to a global stylesheet or use a CSS module
// For now, we'll rely on the browser's default animation support

export default CashFlowView;