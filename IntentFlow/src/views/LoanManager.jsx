// src/views/LoanManager.jsx
import React, { useState } from 'react';

function LoanManager({
  loans = [],
  onMakePayment,
  onEditLoan,           // used to open the unified account modal
  onAddLoan,
  onViewDetails,
  onOpenStrategist,
  onDeleteLoan,         // optional – not used in this component
}) {
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [filter, setFilter] = useState('all'); // 'all', 'auto', 'student', 'personal'

  const getFilteredLoans = () => {
    if (filter === 'all') return loans;
    return loans.filter(loan => loan.type?.toLowerCase().includes(filter));
  };

  const calculateLoanStats = (loan) => {
    const progress = ((loan.originalBalance || Math.abs(loan.balance)) - Math.abs(loan.balance)) /
                     (loan.originalBalance || Math.abs(loan.balance)) * 100;
    const remainingMonths = loan.remainingPayments ||
      Math.ceil(Math.abs(loan.balance) / loan.monthlyPayment);
    const totalInterest = (loan.monthlyPayment * remainingMonths) - Math.abs(loan.balance);
    return {
      progress: Math.max(0, Math.min(100, progress)),
      remainingMonths,
      totalInterest,
      payoffDate: new Date(Date.now() + remainingMonths * 30 * 24 * 60 * 60 * 1000)
    };
  };

  const filteredLoans = getFilteredLoans();
  const totalBalance = loans.reduce((sum, l) => sum + Math.abs(l.balance || 0), 0);
  const totalMonthlyPayment = loans.reduce((sum, l) => sum + (l.monthlyPayment || 0), 0);

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>🏦 Loan Manager</h2>
          <p style={styles.subtitle}>Track and manage all your loans</p>
        </div>
        <div style={styles.headerActions}>
          <button onClick={onOpenStrategist} style={styles.strategistButton}>
            🎯 Open Loan Strategist
          </button>
          <button onClick={onAddLoan} style={styles.addButton}>
            ➕ Add Loan
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>💰</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Total Loan Balance</div>
            <div style={styles.summaryValue}>${totalBalance.toFixed(2)}</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>📊</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Monthly Payments</div>
            <div style={styles.summaryValue}>${totalMonthlyPayment.toFixed(2)}</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>📈</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Average Interest</div>
            <div style={styles.summaryValue}>
              {(loans.reduce((sum, l) => sum + (l.interestRate || 0), 0) / (loans.length || 1)).toFixed(1)}%
            </div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>⏱️</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Total Loans</div>
            <div style={styles.summaryValue}>{loans.length}</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={styles.filterTabs}>
        <button
          onClick={() => setFilter('all')}
          style={{ ...styles.filterTab, ...(filter === 'all' ? styles.activeFilter : {}) }}
        >
          All Loans ({loans.length})
        </button>
        <button
          onClick={() => setFilter('auto')}
          style={{ ...styles.filterTab, ...(filter === 'auto' ? styles.activeFilter : {}) }}
        >
          Auto ({loans.filter(l => l.type?.toLowerCase().includes('auto')).length})
        </button>
        <button
          onClick={() => setFilter('student')}
          style={{ ...styles.filterTab, ...(filter === 'student' ? styles.activeFilter : {}) }}
        >
          Student ({loans.filter(l => l.type?.toLowerCase().includes('student')).length})
        </button>
        <button
          onClick={() => setFilter('personal')}
          style={{ ...styles.filterTab, ...(filter === 'personal' ? styles.activeFilter : {}) }}
        >
          Personal ({loans.filter(l => l.type?.toLowerCase().includes('personal')).length})
        </button>
      </div>

      {/* Loans Grid */}
      {filteredLoans.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>🏦</div>
          <h3 style={styles.emptyTitle}>No loans found</h3>
          <p style={styles.emptyText}>
            {filter === 'all'
              ? 'Add your first loan to start tracking'
              : 'No loans match the selected filter'}
          </p>
          {filter === 'all' && (
            <button onClick={onAddLoan} style={styles.emptyAddButton}>
              ➕ Add Your First Loan
            </button>
          )}
        </div>
      ) : (
        <div style={styles.loansGrid}>
          {filteredLoans.map(loan => {
            const stats = calculateLoanStats(loan);
            const isSelected = selectedLoan === loan.id;

            return (
              <div
                key={loan.id}
                style={{
                  ...styles.loanCard,
                  ...(isSelected ? styles.selectedLoan : {})
                }}
                onClick={() => setSelectedLoan(isSelected ? null : loan.id)}
              >
                {/* Loan Header */}
                <div style={styles.loanHeader}>
                  <div>
                    <h3 style={styles.loanName}>{loan.name}</h3>
                    <div style={styles.loanLender}>{loan.lender || 'Lender'}</div>
                  </div>
                  <div style={styles.loanRate}>{loan.interestRate}%</div>
                </div>

                {/* Balance */}
                <div style={styles.balanceSection}>
                  <div style={styles.balanceLabel}>Current Balance</div>
                  <div style={styles.balanceAmount}>
                    ${Math.abs(loan.balance).toFixed(2)}
                  </div>
                </div>

                {/* Progress Bar */}
                <div style={styles.progressSection}>
                  <div style={styles.progressLabel}>
                    <span>Progress: {stats.progress.toFixed(1)}%</span>
                    <span>{stats.remainingMonths} months left</span>
                  </div>
                  <div style={styles.progressBar}>
                    <div style={{ ...styles.progressFill, width: `${stats.progress}%` }} />
                  </div>
                </div>

                {/* Loan Details */}
                <div style={styles.loanDetails}>
                  <div style={styles.detailItem}>
                    <span>Monthly Payment</span>
                    <strong>${loan.monthlyPayment?.toFixed(2) || 'N/A'}</strong>
                  </div>
                  <div style={styles.detailItem}>
                    <span>Term</span>
                    <strong>{loan.term || 'N/A'} months</strong>
                  </div>
                  <div style={styles.detailItem}>
                    <span>Payoff Date</span>
                    <strong>{stats.payoffDate.toLocaleDateString()}</strong>
                  </div>
                </div>

                {/* Action Buttons */}
                <div style={styles.loanActions}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMakePayment && onMakePayment(loan.id);
                    }}
                    style={styles.paymentButton}
                  >
                    Make Payment
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditLoan && onEditLoan(loan);   // opens the unified modal
                    }}
                    style={styles.editButton}
                    title="Edit Loan"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onViewDetails && onViewDetails(loan.id);
                    }}
                    style={styles.detailsButton}
                  >
                    View Details
                  </button>
                </div>

                {/* Expanded Details */}
                {isSelected && (
                  <div style={styles.expandedDetails}>
                    <h4 style={styles.expandedTitle}>Amortization Preview</h4>
                    <div style={styles.amortizationGrid}>
                      <div style={styles.amortizationItem}>
                        <span>Principal</span>
                        <strong>${Math.abs(loan.balance).toFixed(2)}</strong>
                      </div>
                      <div style={styles.amortizationItem}>
                        <span>Total Interest</span>
                        <strong>${stats.totalInterest.toFixed(2)}</strong>
                      </div>
                      <div style={styles.amortizationItem}>
                        <span>Total Cost</span>
                        <strong>${(Math.abs(loan.balance) + stats.totalInterest).toFixed(2)}</strong>
                      </div>
                    </div>
                    <button
                      onClick={() => onOpenStrategist && onOpenStrategist()}
                      style={styles.strategistLink}
                    >
                      View in Loan Strategist →
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Styles (unchanged from original)
const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1400px',
    margin: '0 auto',
    color: 'white'
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
    margin: '0 0 0.25rem 0',
    background: 'linear-gradient(135deg, #10B981, #3B82F6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    margin: 0
  },
  headerActions: {
    display: 'flex',
    gap: '1rem'
  },
  strategistButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  addButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    cursor: 'pointer'
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
    textTransform: 'uppercase'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold'
  },
  filterTabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '2rem',
    background: '#1F2937',
    padding: '0.25rem',
    borderRadius: '0.5rem',
    width: 'fit-content'
  },
  filterTab: {
    padding: '0.5rem 1rem',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.875rem'
  },
  activeFilter: {
    background: '#3B82F6',
    color: 'white'
  },
  loansGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))',
    gap: '1.5rem'
  },
  loanCard: {
    background: '#1F2937',
    borderRadius: '1rem',
    padding: '1.5rem',
    border: '1px solid #374151',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    }
  },
  selectedLoan: {
    border: '2px solid #3B82F6'
  },
  loanHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem'
  },
  loanName: {
    fontSize: '1.125rem',
    fontWeight: '600',
    margin: '0 0 0.25rem 0',
    color: 'white'
  },
  loanLender: {
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  loanRate: {
    fontSize: '1.125rem',
    fontWeight: 'bold',
    color: '#F59E0B'
  },
  balanceSection: {
    marginBottom: '1rem'
  },
  balanceLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem'
  },
  balanceAmount: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white'
  },
  progressSection: {
    marginBottom: '1rem'
  },
  progressLabel: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem'
  },
  progressBar: {
    height: '0.5rem',
    background: '#374151',
    borderRadius: '0.25rem',
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)'
  },
  loanDetails: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.5rem',
    marginBottom: '1rem'
  },
  detailItem: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  loanActions: {
    display: 'flex',
    gap: '0.5rem'
  },
  paymentButton: {
    flex: 1,
    padding: '0.5rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  editButton: {
    flex: 1,
    padding: '0.5rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    cursor: 'pointer'
  },
  detailsButton: {
    flex: 1,
    padding: '0.5rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    cursor: 'pointer'
  },
  expandedDetails: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #374151'
  },
  expandedTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    margin: '0 0 0.75rem 0',
    color: 'white'
  },
  amortizationGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.5rem',
    marginBottom: '1rem'
  },
  amortizationItem: {
    background: '#111827',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    textAlign: 'center'
  },
  strategistLink: {
    width: '100%',
    padding: '0.5rem',
    background: 'none',
    border: '1px solid #8B5CF6',
    color: '#8B5CF6',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.75rem'
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem',
    background: '#1F2937',
    borderRadius: '1rem'
  },
  emptyIcon: {
    fontSize: '3rem',
    marginBottom: '1rem'
  },
  emptyTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '0.5rem'
  },
  emptyText: {
    color: '#9CA3AF',
    marginBottom: '1.5rem'
  },
  emptyAddButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer'
  }
};

export default LoanManager;