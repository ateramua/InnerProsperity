// src/views/LoanManager.jsx
import React, { useState } from 'react';
import EditAccountModal from './EditAccountModal';

function LoanManager({
  loans = [],
  onMakePayment,
  onEditLoan,
  onAddLoan,
  onViewDetails,
  onOpenStrategist,
  onDeleteLoan,
}) {
  const [selectedLoan, setSelectedLoan] = useState(null);
  const [filter, setFilter] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);

  // Form state for new loan
  const [newLoanData, setNewLoanData] = useState({
    name: '',
    type: 'loan',
    loan_type: 'personal',
    institution: '',
    account_number: '',
    account_holder_name: '',
    balance: 0,
    original_balance: null,
    interest_rate: null,
    monthly_payment: null,
    term_months: null,
    due_date: '',
    notes: ''
  });

  const getFilteredLoans = () => {
    if (filter === 'all') return loans;
    return loans.filter(loan => loan.type?.toLowerCase().includes(filter) ||
      loan.loan_type?.toLowerCase().includes(filter));
  };

  const calculateLoanStats = (loan) => {
    const originalBalance = loan.original_balance || Math.abs(loan.balance);
    const progress = ((originalBalance - Math.abs(loan.balance)) / originalBalance) * 100;
    const monthlyPayment = loan.monthly_payment || loan.monthlyPayment;
    const remainingMonths = loan.remainingPayments ||
      Math.ceil(Math.abs(loan.balance) / (monthlyPayment || 1));
    const totalInterest = (monthlyPayment * remainingMonths) - Math.abs(loan.balance);
    return {
      progress: Math.max(0, Math.min(100, progress)),
      remainingMonths,
      totalInterest,
      payoffDate: new Date(Date.now() + remainingMonths * 30 * 24 * 60 * 60 * 1000)
    };
  };

  // Handle creating a new loan
  const handleCreateLoan = async () => {
    try {
      if (!newLoanData.name.trim()) {
        alert('Please enter a loan name');
        return;
      }

      if (!newLoanData.balance || newLoanData.balance <= 0) {
        alert('Please enter a valid loan balance');
        return;
      }

      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in to create a loan');
        return;
      }

      const userId = userResult.data.id;

      const loanData = {
        name: newLoanData.name.trim(),
        type: 'loan',
        loan_type: newLoanData.loan_type,
        account_type_category: 'loan',
        balance: -Math.abs(parseFloat(newLoanData.balance)), // Negative for liability
        original_balance: newLoanData.original_balance ? parseFloat(newLoanData.original_balance) : null,
        interest_rate: newLoanData.interest_rate ? parseFloat(newLoanData.interest_rate) : null,
        monthly_payment: newLoanData.monthly_payment ? parseFloat(newLoanData.monthly_payment) : null,
        term_months: newLoanData.term_months ? parseInt(newLoanData.term_months) : null,
        due_date: newLoanData.due_date || null,
        institution: newLoanData.institution.trim() || null,
        account_number: newLoanData.account_number.trim() || null,
        account_holder_name: newLoanData.account_holder_name.trim() || null,
        notes: newLoanData.notes.trim() || null,
        user_id: userId,
        currency: 'USD'
      };

      console.log('📝 Creating loan with data:', loanData);

      const result = await window.electronAPI.createAccount(loanData);

      if (result.success) {
        console.log('✅ Loan created successfully:', result.data);
        setShowAddModal(false);

        setNewLoanData({
          name: '',
          type: 'loan',
          loan_type: 'personal',
          institution: '',
          account_number: '',
          account_holder_name: '',
          balance: 0,
          original_balance: null,
          interest_rate: null,
          monthly_payment: null,
          term_months: null,
          due_date: '',
          notes: ''
        });

        if (onAddLoan) {
          await onAddLoan(result.data);
        }

        window.dispatchEvent(new Event('accounts-changed'));
        alert('✅ Loan created successfully!');
      } else {
        console.error('❌ Failed to create loan:', result.error);
        alert(`Failed to create loan: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Error creating loan:', error);
      alert(`Error: ${error.message}`);
    }
  };

  // Handle edit - opens EditAccountModal
  // In LoanManager.jsx, replace the handleEditClick function
  const handleEditClick = (loan) => {
    console.log('✏️ Opening EditAccountModal for loan:', loan);

    // Ensure all fields are passed to the modal
    const loanWithAllFields = {
      id: loan.id,
      name: loan.name || '',
      type: 'loan',
      balance: loan.balance || 0,
      interest_rate: loan.interest_rate || loan.interestRate || null,
      due_date: loan.due_date || null,
      institution: loan.institution || loan.lender || '',
      account_number: loan.account_number || '',  // ← Include existing account number
      account_holder_name: loan.account_holder_name || '',  // ← Include existing account holder name
      notes: loan.notes || '',
      // Loan-specific fields
      original_balance: loan.original_balance || null,
      term_months: loan.term_months || null,
      monthly_payment: loan.monthly_payment || loan.monthlyPayment || null,
      loan_type: loan.loan_type || loan.type || 'personal'
    };

    console.log('📤 Sending to modal:', loanWithAllFields);
    setEditingLoan(loanWithAllFields);
    setShowEditModal(true);
  };

  // Handle save from EditAccountModal
  const handleSaveEdit = async (accountId, updatedData) => {
    console.log('📥 Saving loan edit from EditAccountModal:', accountId, updatedData);

    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return;
      }

      const userId = userResult.data.id;

      // Build update payload for loan
      const updatePayload = {
        name: updatedData.name,
        type: 'loan',
        account_type_category: 'loan',
        institution: updatedData.institution || null,
        account_number: updatedData.account_number || null,
        account_holder_name: updatedData.account_holder_name || null,
        notes: updatedData.notes || null,
        balance: -Math.abs(parseFloat(updatedData.balance) || 0),
        interest_rate: updatedData.interest_rate ? parseFloat(updatedData.interest_rate) : null,
        due_date: updatedData.due_date || null,
        original_balance: updatedData.original_balance ? parseFloat(updatedData.original_balance) : null,
        term_months: updatedData.term_months ? parseInt(updatedData.term_months) : null,
        payment_amount: updatedData.monthly_payment ? parseFloat(updatedData.monthly_payment) : null,
        monthly_payment: updatedData.monthly_payment ? parseFloat(updatedData.monthly_payment) : null,
        loan_type: updatedData.loan_type || 'personal'
      };

      console.log('📝 Updating loan with payload:', updatePayload);

      const result = await window.electronAPI.updateAccount(accountId, userId, updatePayload);

      if (result && result.success) {
        console.log('✅ Loan updated successfully');
        setShowEditModal(false);
        setEditingLoan(null);
        window.dispatchEvent(new CustomEvent('accounts-updated'));
        alert('✅ Loan updated successfully!');
      } else {
        const errorMsg = result?.error || 'Unknown error occurred';
        console.error('❌ Failed to update loan:', errorMsg);
        alert(`Failed to update loan: ${errorMsg}`);
      }
    } catch (error) {
      console.error('❌ Error updating loan:', error);
      alert(`Error updating loan: ${error.message}`);
    }
  };

  // Handle delete from EditAccountModal
  const handleDeleteLoanAccount = async (accountId) => {
    if (!window.confirm('Are you sure you want to delete this loan? This action cannot be undone.')) {
      return;
    }

    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return;
      }

      const userId = userResult.data.id;
      const result = await window.electronAPI.deleteAccount(accountId, userId);

      if (result && result.success) {
        setShowEditModal(false);
        setEditingLoan(null);
        window.dispatchEvent(new CustomEvent('accounts-updated'));
        alert('✅ Loan deleted successfully!');
      } else {
        alert('Failed to delete loan: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting loan:', error);
      alert('Error: ' + error.message);
    }
  };

  const filteredLoans = getFilteredLoans();
  const totalBalance = loans.reduce((sum, l) => sum + Math.abs(l.balance || 0), 0);
  const totalMonthlyPayment = loans.reduce((sum, l) => sum + (l.monthly_payment || l.monthlyPayment || 0), 0);

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
          <button onClick={() => setShowAddModal(true)} style={styles.addButton}>
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
              {(loans.reduce((sum, l) => sum + (l.interest_rate || l.interestRate || 0), 0) / (loans.length || 1)).toFixed(1)}%
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
          Auto ({loans.filter(l => (l.type?.toLowerCase().includes('auto') || l.loan_type === 'auto')).length})
        </button>
        <button
          onClick={() => setFilter('student')}
          style={{ ...styles.filterTab, ...(filter === 'student' ? styles.activeFilter : {}) }}
        >
          Student ({loans.filter(l => (l.type?.toLowerCase().includes('student') || l.loan_type === 'student')).length})
        </button>
        <button
          onClick={() => setFilter('personal')}
          style={{ ...styles.filterTab, ...(filter === 'personal' ? styles.activeFilter : {}) }}
        >
          Personal ({loans.filter(l => (l.type?.toLowerCase().includes('personal') || l.loan_type === 'personal')).length})
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
            <button onClick={() => setShowAddModal(true)} style={styles.emptyAddButton}>
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
                    <div style={styles.loanLender}>{loan.lender || loan.institution || 'Lender'}</div>
                  </div>
                  <div style={styles.loanRate}>{loan.interest_rate || loan.interestRate || 0}%</div>
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
                    <strong>${(loan.monthly_payment || loan.monthlyPayment || 0).toFixed(2)}</strong>
                  </div>
                  <div style={styles.detailItem}>
                    <span>Term</span>
                    <strong>{loan.term_months || loan.term || 'N/A'} months</strong>
                  </div>
                  <div style={styles.detailItem}>
                    <span>Payoff Date</span>
                    <strong>{stats.payoffDate.toLocaleDateString()}</strong>
                  </div>
                </div>

                {/* Additional Details */}
                {(loan.account_number || loan.account_holder_name) && (
                  <div style={styles.additionalDetails}>
                    {loan.account_number && (
                      <div style={styles.detailBadge}>
                        Acct: ••••{loan.account_number.slice(-4)}
                      </div>
                    )}
                    {loan.account_holder_name && (
                      <div style={styles.detailBadge}>
                        Holder: {loan.account_holder_name}
                      </div>
                    )}
                  </div>
                )}

                {/* Action Buttons */}
                {/* Action Buttons */}
                <div style={styles.loanActions}>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onMakePayment && onMakePayment(loan.id);
                    }}
                    style={styles.paymentButton}
                  >
                    💰 Make Payment
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEditClick(loan);
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
                    style={styles.transactionsButton}
                  >
                    📋 Transactions
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

      {/* Add Loan Modal - Inline Modal */}
      {showAddModal && (
        <div style={styles.modalOverlay}>
          <div style={styles.modalContent}>
            <h2 style={styles.modalTitle}>Add New Loan</h2>

            {/* Basic Information */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Basic Information</h3>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Loan Name <span style={styles.required}>*</span>
                </label>
                <input
                  type="text"
                  value={newLoanData.name}
                  onChange={(e) => setNewLoanData({ ...newLoanData, name: e.target.value })}
                  style={styles.input}
                  placeholder="e.g., Auto Loan, Student Loan, Mortgage"
                  autoFocus
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Loan Type</label>
                <select
                  value={newLoanData.loan_type}
                  onChange={(e) => setNewLoanData({ ...newLoanData, loan_type: e.target.value })}
                  style={styles.select}
                >
                  <option value="personal">Personal Loan</option>
                  <option value="auto">Auto Loan</option>
                  <option value="student">Student Loan</option>
                  <option value="mortgage">Mortgage</option>
                  <option value="business">Business Loan</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Lender / Institution</label>
                <input
                  type="text"
                  value={newLoanData.institution}
                  onChange={(e) => setNewLoanData({ ...newLoanData, institution: e.target.value })}
                  style={styles.input}
                  placeholder="e.g., Wells Fargo, Sallie Mae, Chase"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>
                  Current Balance <span style={styles.required}>*</span>
                </label>
                <input
                  type="number"
                  value={newLoanData.balance}
                  onChange={(e) => setNewLoanData({ ...newLoanData, balance: parseFloat(e.target.value) || 0 })}
                  style={styles.input}
                  step="0.01"
                  placeholder="0.00"
                />
                <small style={styles.hint}>Current amount owed</small>
              </div>
            </div>

            {/* Loan Details */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Loan Details</h3>

              <div style={styles.formGroup}>
                <label style={styles.label}>Original Loan Amount</label>
                <input
                  type="number"
                  value={newLoanData.original_balance || ''}
                  onChange={(e) => setNewLoanData({ ...newLoanData, original_balance: parseFloat(e.target.value) || null })}
                  style={styles.input}
                  step="0.01"
                  placeholder="Original loan amount"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Interest Rate (APR)</label>
                <input
                  type="number"
                  value={newLoanData.interest_rate || ''}
                  onChange={(e) => setNewLoanData({ ...newLoanData, interest_rate: parseFloat(e.target.value) || null })}
                  style={styles.input}
                  step="0.01"
                  placeholder="e.g., 5.99"
                />
                <small style={styles.hint}>Annual Percentage Rate</small>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Monthly Payment</label>
                <input
                  type="number"
                  value={newLoanData.monthly_payment || ''}
                  onChange={(e) => setNewLoanData({ ...newLoanData, monthly_payment: parseFloat(e.target.value) || null })}
                  style={styles.input}
                  step="0.01"
                  placeholder="Monthly payment amount"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Loan Term (months)</label>
                <input
                  type="number"
                  value={newLoanData.term_months || ''}
                  onChange={(e) => setNewLoanData({ ...newLoanData, term_months: parseInt(e.target.value) || null })}
                  style={styles.input}
                  placeholder="e.g., 60 for 5 years"
                />
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Due Date</label>
                <input
                  type="date"
                  value={newLoanData.due_date}
                  onChange={(e) => setNewLoanData({ ...newLoanData, due_date: e.target.value })}
                  style={styles.input}
                />
                <small style={styles.hint}>Monthly payment due date</small>
              </div>
            </div>

            {/* Account Details */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Account Details</h3>

              <div style={styles.formGroup}>
                <label style={styles.label}>Account Number</label>
                <input
                  type="text"
                  value={newLoanData.account_number}
                  onChange={(e) => setNewLoanData({ ...newLoanData, account_number: e.target.value })}
                  style={styles.input}
                  placeholder="Enter full account number (up to 16 digits)"
                  maxLength="16"
                />
                <small style={styles.hint}>For reference only. Only last 4 digits will be visible after saving.</small>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Account Holder Name</label>
                <input
                  type="text"
                  value={newLoanData.account_holder_name}
                  onChange={(e) => setNewLoanData({ ...newLoanData, account_holder_name: e.target.value })}
                  style={styles.input}
                  placeholder="Name on the loan account"
                />
              </div>
            </div>

            {/* Notes */}
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}>Additional Notes</h3>

              <div style={styles.formGroup}>
                <label style={styles.label}>Notes</label>
                <textarea
                  value={newLoanData.notes}
                  onChange={(e) => setNewLoanData({ ...newLoanData, notes: e.target.value })}
                  style={styles.textarea}
                  rows="3"
                  placeholder="Add any additional notes about this loan..."
                />
              </div>
            </div>

            <div style={styles.modalActions}>
              <button onClick={handleCreateLoan} style={styles.saveButton}>
                Create Loan
              </button>
              <button onClick={() => setShowAddModal(false)} style={styles.cancelButton}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EditAccountModal for editing loans */}
      <EditAccountModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingLoan(null);
        }}
        onSave={handleSaveEdit}
        onDelete={handleDeleteLoanAccount}
        account={editingLoan}
      />
    </div>
  );
}

// Styles (keep all existing styles, they remain the same)
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
  transactionsButton: {
    flex: 1,
    padding: '0.5rem',
    background: 'transparent',
    border: '1px solid #3B82F6',
    color: '#3B82F6',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    cursor: 'pointer'
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
  additionalDetails: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
    flexWrap: 'wrap'
  },
  detailBadge: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    background: '#374151',
    padding: '0.125rem 0.5rem',
    borderRadius: '0.25rem',
    display: 'inline-block'
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
    maxWidth: '600px',
    maxHeight: '90vh',
    overflowY: 'auto'
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: 'white'
  },
  section: {
    marginBottom: '1.5rem',
    paddingBottom: '1rem',
    borderBottom: '1px solid #374151'
  },
  sectionTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: '1rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  formGroup: {
    marginBottom: '1rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem'
  },
  required: {
    color: '#EF4444',
    marginLeft: '0.25rem'
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.875rem',
    fontFamily: 'inherit',
    resize: 'vertical'
  },
  hint: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  modalActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '1.5rem'
  },
  saveButton: {
    flex: 1,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  cancelButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  }
};

export default LoanManager;