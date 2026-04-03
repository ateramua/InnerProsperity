// src/views/CashAccountsView.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

const CashAccountsView = ({ accounts: propAccounts }) => {
  const router = useRouter();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showInlineModal, setShowInlineModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  
  // Inline modal state (self-contained for adding)
  const [inlineFormData, setInlineFormData] = useState({
    name: '',
    type: 'checking',
    balance: '',
    institution: '',
    account_number: '',
    routing_number: '',
    debit_card_number: '',
    daily_withdrawal_limit: '',
    overdraft_protection: false,
    interest_rate: '',
    notes: ''
  });
  const [inlineErrors, setInlineErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Edit modal state
  const [editFormData, setEditFormData] = useState({
    name: '',
    balance: '',
    institution: '',
    account_number: '',
    routing_number: '',
    debit_card_number: '',
    daily_withdrawal_limit: '',
    overdraft_protection: false,
    interest_rate: '',
    notes: ''
  });
  const [editErrors, setEditErrors] = useState({});
  const [isEditing, setIsEditing] = useState(false);

  // For masked display in edit modal
  const [displayAccountNumber, setDisplayAccountNumber] = useState('');
  const [isEditingAccountNumber, setIsEditingAccountNumber] = useState(false);
  const [displayRoutingNumber, setDisplayRoutingNumber] = useState('');
  const [isEditingRoutingNumber, setIsEditingRoutingNumber] = useState(false);
  const [displayDebitCardNumber, setDisplayDebitCardNumber] = useState('');
  const [isEditingDebitCardNumber, setIsEditingDebitCardNumber] = useState(false);

  // Add style for spinner animation
  useEffect(() => {
    if (typeof document !== 'undefined') {
      const style = document.createElement('style');
      style.textContent = `
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `;
      document.head.appendChild(style);
      return () => document.head.removeChild(style);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [propAccounts]);

  // Reset inline form when modal opens
  useEffect(() => {
    if (showInlineModal) {
      resetInlineForm();
    }
  }, [showInlineModal]);

  // Load editing account data when edit modal opens
  useEffect(() => {
    if (showEditModal && editingAccount) {
      loadEditingAccountData();
    }
  }, [showEditModal, editingAccount]);

  const resetInlineForm = () => {
    setInlineFormData({
      name: '',
      type: 'checking',
      balance: '',
      institution: '',
      account_number: '',
      routing_number: '',
      debit_card_number: '',
      daily_withdrawal_limit: '',
      overdraft_protection: false,
      interest_rate: '',
      notes: ''
    });
    setInlineErrors({});
  };

  const loadEditingAccountData = () => {
    if (!editingAccount) return;
    
    setEditFormData({
      name: editingAccount.name || '',
      balance: editingAccount.balance !== undefined && editingAccount.balance !== null 
        ? Math.abs(editingAccount.balance).toString() 
        : '',
      institution: editingAccount.institution || '',
      account_number: editingAccount.account_number || '',
      routing_number: editingAccount.routing_number || '',
      debit_card_number: editingAccount.debit_card_number || '',
      daily_withdrawal_limit: editingAccount.daily_withdrawal_limit || '',
      overdraft_protection: editingAccount.overdraft_protection || false,
      interest_rate: editingAccount.interest_rate || '',
      notes: editingAccount.notes || ''
    });
    
    setDisplayAccountNumber(maskNumber(editingAccount.account_number || ''));
    setDisplayRoutingNumber(maskNumber(editingAccount.routing_number || ''));
    setDisplayDebitCardNumber(maskNumber(editingAccount.debit_card_number || ''));
    setIsEditingAccountNumber(false);
    setIsEditingRoutingNumber(false);
    setIsEditingDebitCardNumber(false);
    setEditErrors({});
  };

  const loadAccounts = async (force = false) => {
    console.log('💰 CashAccountsView - Loading accounts...');
    setLoading(true);

    try {
      if (!force && propAccounts && Array.isArray(propAccounts) && propAccounts.length > 0) {
        console.log('💰 Using propAccounts:', propAccounts.length);
        const cashAccounts = propAccounts.filter(a =>
          a.type === 'checking' || a.type === 'savings'
        );
        setAccounts(cashAccounts);
        setLoading(false);
        return;
      }

      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        console.error('❌ No user logged in');
        setError('Please log in to view accounts');
        setLoading(false);
        return;
      }
      const userId = userResult.data.id;
      const accountsResult = await window.electronAPI.getAccountsSummary(userId);
      if (accountsResult?.success) {
        const allAccounts = accountsResult.data || [];
        const cashAccounts = allAccounts.filter(a =>
          a.type === 'checking' || a.type === 'savings'
        );
        setAccounts(cashAccounts);
      } else {
        setError(accountsResult?.error || 'Failed to load accounts');
      }
    } catch (error) {
      console.error('❌ Error loading accounts:', error);
      setError(error.message);
    } finally {
      setLoading(false);
    }
  };

  // Masking helpers
  const maskNumber = (number) => {
    if (!number || number.length === 0) return '';
    if (number.length <= 4) return number;
    const asterisks = '•'.repeat(Math.min(number.length - 4, 12));
    return asterisks + number.slice(-4);
  };

  const formatAccountNumber = (value) => {
    const digits = value.replace(/\D/g, '');
    const limited = digits.slice(0, 16);
    const groups = limited.match(/.{1,4}/g);
    return groups ? groups.join(' ') : limited;
  };

  const formatRoutingNumber = (value) => {
    const digits = value.replace(/\D/g, '');
    return digits.slice(0, 9);
  };

  const validateInlineForm = () => {
    const newErrors = {};
    if (!inlineFormData.name.trim()) newErrors.name = 'Account name is required';
    if (!inlineFormData.account_number) newErrors.account_number = 'Account number is required';
    if (!inlineFormData.routing_number) newErrors.routing_number = 'Routing number is required';
    setInlineErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateEditForm = () => {
    const newErrors = {};
    if (!editFormData.name.trim()) newErrors.name = 'Account name is required';
    setEditErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleInlineChange = (e) => {
    const { name, value, type, checked } = e.target;
    setInlineFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (inlineErrors[name]) {
      setInlineErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleEditChange = (e) => {
    const { name, value, type, checked } = e.target;
    setEditFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
    if (editErrors[name]) {
      setEditErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };

  const handleInlineAccountNumberChange = (e) => {
    const formatted = formatAccountNumber(e.target.value);
    setInlineFormData(prev => ({ ...prev, account_number: formatted }));
  };

  const handleInlineRoutingNumberChange = (e) => {
    const formatted = formatRoutingNumber(e.target.value);
    setInlineFormData(prev => ({ ...prev, routing_number: formatted }));
  };

  const handleInlineDebitCardNumberChange = (e) => {
    const formatted = formatAccountNumber(e.target.value);
    setInlineFormData(prev => ({ ...prev, debit_card_number: formatted }));
  };

  const handleEditAccountNumberChange = (e) => {
    const formatted = formatAccountNumber(e.target.value);
    setEditFormData(prev => ({ ...prev, account_number: formatted }));
    setDisplayAccountNumber(maskNumber(formatted.replace(/\s/g, '')));
  };

  const handleEditRoutingNumberChange = (e) => {
    const formatted = formatRoutingNumber(e.target.value);
    setEditFormData(prev => ({ ...prev, routing_number: formatted }));
    setDisplayRoutingNumber(maskNumber(formatted));
  };

  const handleEditDebitCardNumberChange = (e) => {
    const formatted = formatAccountNumber(e.target.value);
    setEditFormData(prev => ({ ...prev, debit_card_number: formatted }));
    setDisplayDebitCardNumber(maskNumber(formatted.replace(/\s/g, '')));
  };

  const handleCreateInlineAccount = async () => {
    if (!validateInlineForm()) return;
    
    setIsSubmitting(true);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in to create an account');
        return;
      }

      const userId = userResult.data.id;

      const accountData = {
        name: inlineFormData.name.trim(),
        type: inlineFormData.type,
        accountTypeCategory: 'budget',
        balance: parseFloat(inlineFormData.balance) || 0,
        currency: 'USD',
        institution: inlineFormData.institution.trim() || null,
        account_number: inlineFormData.account_number.replace(/\s/g, '') || null,
        routing_number: inlineFormData.routing_number || null,
        debit_card_number: inlineFormData.debit_card_number.replace(/\s/g, '') || null,
        daily_withdrawal_limit: inlineFormData.daily_withdrawal_limit ? parseFloat(inlineFormData.daily_withdrawal_limit) : null,
        overdraft_protection: inlineFormData.overdraft_protection,
        interest_rate: inlineFormData.interest_rate ? parseFloat(inlineFormData.interest_rate) : null,
        notes: inlineFormData.notes.trim() || null,
        userId: userId
      };

      console.log('📝 Creating account with data:', accountData);

      const result = await window.electronAPI.createAccount(accountData);

      if (result.success) {
        console.log('✅ Account created successfully:', result.data);
        setShowInlineModal(false);
        resetInlineForm();
        await loadAccounts(true);
        window.dispatchEvent(new Event('accounts-changed'));
        alert('✅ Account created successfully!');
      } else {
        console.error('❌ Failed to create account:', result.error);
        alert(`Failed to create account: ${result.error}`);
      }
    } catch (error) {
      console.error('❌ Error creating account:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateAccount = async () => {
    if (!validateEditForm()) return;
    
    setIsEditing(true);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return;
      }
      
      const userId = userResult.data.id;
      
      const updates = {
        name: editFormData.name.trim(),
        balance: editFormData.balance ? -Math.abs(parseFloat(editFormData.balance)) : 0,
        institution: editFormData.institution.trim() || null,
        account_number: editFormData.account_number.replace(/\s/g, '') || null,
        routing_number: editFormData.routing_number || null,
        debit_card_number: editFormData.debit_card_number.replace(/\s/g, '') || null,
        daily_withdrawal_limit: editFormData.daily_withdrawal_limit ? parseFloat(editFormData.daily_withdrawal_limit) : null,
        overdraft_protection: editFormData.overdraft_protection,
        interest_rate: editFormData.interest_rate ? parseFloat(editFormData.interest_rate) : null,
        notes: editFormData.notes.trim() || null
      };

      console.log('📝 Updating account:', editingAccount.id, updates);

      const result = await window.electronAPI.updateAccount(editingAccount.id, userId, updates);
      
      if (result.success) {
        alert('✅ Account updated successfully');
        setShowEditModal(false);
        setEditingAccount(null);
        await loadAccounts(true);
        window.dispatchEvent(new CustomEvent('accounts-updated'));
      } else {
        alert('❌ Error updating account: ' + result.error);
      }
    } catch (error) {
      console.error('Error updating account:', error);
      alert('❌ Error updating account: ' + error.message);
    } finally {
      setIsEditing(false);
    }
  };

  const handleDeleteAccount = async (accountId, accountName) => {
    if (!window.confirm(`Are you sure you want to delete "${accountName}"? This action cannot be undone.`)) {
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

      if (result.success) {
        alert('✅ Account deleted successfully');
        setShowEditModal(false);
        setEditingAccount(null);
        await loadAccounts(true);
        window.dispatchEvent(new Event('accounts-changed'));
      } else {
        alert('Failed to delete account: ' + result.error);
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Error: ' + error.message);
    }
  };

  const handleEditClick = (account) => {
    setEditingAccount(account);
    setShowEditModal(true);
  };

  const handleAccountClick = (accountId) => {
    router.push(`/accounts/${accountId}`);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const getAccountIcon = (type) => {
    return type === 'checking' ? '🏦' : '💰';
  };

  // Determine if showing bank fields
  const showBankFields = inlineFormData.type === 'checking' || inlineFormData.type === 'savings';
  const showEditBankFields = editingAccount?.type === 'checking' || editingAccount?.type === 'savings';

  if (loading) {
    return (
      <div style={styles.container}>
        <div style={styles.loadingState}>
          <div style={styles.loadingSpinner}></div>
          <p>Loading accounts...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.container}>
        <div style={styles.errorState}>
          <p>❌ {error}</p>
          <button onClick={() => loadAccounts(true)} style={styles.retryButton}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>Accounts</h1>
          <p style={styles.description}>Manage your checking and savings accounts</p>
        </div>
        <button
          onClick={() => setShowInlineModal(true)}
          style={styles.addButton}
        >
          <span>+</span> New Account
        </button>
      </div>

      <div style={styles.accountsContainer}>
        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>CHECKING ACCOUNTS</h2>
          <div style={styles.accountList}>
            {accounts.filter(a => a.type === 'checking').map(account => (
              <div
                key={account.id}
                style={styles.accountRow}
              >
                <div style={styles.accountInfo} onClick={() => handleAccountClick(account.id)}>
                  <span style={styles.accountIcon}>{getAccountIcon(account.type)}</span>
                  <div>
                    <div style={styles.accountName}>{account.name}</div>
                    <div style={styles.accountMeta}>
                      {account.institution || 'No institution'}
                      {account.account_number && ` • •••• ${account.account_number.slice(-4)}`}
                    </div>
                  </div>
                </div>
                <div style={styles.accountActions}>
                  <div style={styles.accountBalance}>
                    <div style={styles.balanceAmount}>
                      {formatCurrency(account.balance)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEditClick(account); }}
                    style={styles.editButton}
                    title="Edit Account"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteAccount(account.id, account.name); }}
                    style={styles.deleteButton}
                    title="Delete Account"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
            {accounts.filter(a => a.type === 'checking').length === 0 && (
              <div style={styles.emptyState}>
                No checking accounts yet. Click "New Account" to add one.
              </div>
            )}
          </div>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>SAVINGS ACCOUNTS</h2>
          <div style={styles.accountList}>
            {accounts.filter(a => a.type === 'savings').map(account => (
              <div
                key={account.id}
                style={styles.accountRow}
              >
                <div style={styles.accountInfo} onClick={() => handleAccountClick(account.id)}>
                  <span style={styles.accountIcon}>{getAccountIcon(account.type)}</span>
                  <div>
                    <div style={styles.accountName}>{account.name}</div>
                    <div style={styles.accountMeta}>
                      {account.institution || 'No institution'}
                      {account.account_number && ` • •••• ${account.account_number.slice(-4)}`}
                    </div>
                  </div>
                </div>
                <div style={styles.accountActions}>
                  <div style={styles.accountBalance}>
                    <div style={styles.balanceAmount}>
                      {formatCurrency(account.balance)}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleEditClick(account); }}
                    style={styles.editButton}
                    title="Edit Account"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteAccount(account.id, account.name); }}
                    style={styles.deleteButton}
                    title="Delete Account"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            ))}
            {accounts.filter(a => a.type === 'savings').length === 0 && (
              <div style={styles.emptyState}>
                No savings accounts yet. Click "New Account" to add one.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* INLINE ADD ACCOUNT MODAL */}
      {showInlineModal && (
        <div style={styles.modalOverlay} onClick={() => setShowInlineModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Add New Account</h2>
              <button onClick={() => setShowInlineModal(false)} style={styles.closeButton}>×</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleCreateInlineAccount(); }}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Account Name <span style={styles.required}>*</span></label>
                <input
                  type="text"
                  name="name"
                  value={inlineFormData.name}
                  onChange={handleInlineChange}
                  style={{ ...styles.input, ...(inlineErrors.name && styles.inputError) }}
                  placeholder="e.g., Main Checking, High Yield Savings"
                  autoFocus
                />
                {inlineErrors.name && <div style={styles.fieldError}>{inlineErrors.name}</div>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Account Type <span style={styles.required}>*</span></label>
                <select
                  name="type"
                  value={inlineFormData.type}
                  onChange={handleInlineChange}
                  style={styles.select}
                >
                  <option value="checking">🏦 Checking Account</option>
                  <option value="savings">💰 Savings Account</option>
                </select>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Current Balance</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    name="balance"
                    value={inlineFormData.balance}
                    onChange={handleInlineChange}
                    step="0.01"
                    style={styles.inputWithSymbol}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Institution / Bank</label>
                <input
                  type="text"
                  name="institution"
                  value={inlineFormData.institution}
                  onChange={handleInlineChange}
                  style={styles.input}
                  placeholder="e.g., Chase Bank, Bank of America"
                />
              </div>

              {showBankFields && (
                <>
                  <div style={styles.sectionDivider}>
                    <span style={styles.sectionTitle}>Bank Account Details</span>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Account Number <span style={styles.required}>*</span></label>
                    <input
                      type="text"
                      name="account_number"
                      value={inlineFormData.account_number}
                      onChange={handleInlineAccountNumberChange}
                      style={{ ...styles.input, ...(inlineErrors.account_number && styles.inputError) }}
                      placeholder="Enter account number (up to 16 digits)"
                      maxLength="19"
                    />
                    {inlineErrors.account_number && <div style={styles.fieldError}>{inlineErrors.account_number}</div>}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Routing Number <span style={styles.required}>*</span></label>
                    <input
                      type="text"
                      name="routing_number"
                      value={inlineFormData.routing_number}
                      onChange={handleInlineRoutingNumberChange}
                      style={{ ...styles.input, ...(inlineErrors.routing_number && styles.inputError) }}
                      placeholder="9-digit routing number"
                      maxLength="9"
                    />
                    {inlineErrors.routing_number && <div style={styles.fieldError}>{inlineErrors.routing_number}</div>}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Debit Card Number (Optional)</label>
                    <input
                      type="text"
                      name="debit_card_number"
                      value={inlineFormData.debit_card_number}
                      onChange={handleInlineDebitCardNumberChange}
                      style={styles.input}
                      placeholder="Enter debit card number (up to 16 digits)"
                      maxLength="19"
                    />
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Daily Withdrawal Limit</label>
                    <div style={styles.inputWrapper}>
                      <span style={styles.currencySymbol}>$</span>
                      <input
                        type="number"
                        name="daily_withdrawal_limit"
                        value={inlineFormData.daily_withdrawal_limit}
                        onChange={handleInlineChange}
                        step="0.01"
                        min="0"
                        style={styles.inputWithSymbol}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        name="overdraft_protection"
                        checked={inlineFormData.overdraft_protection}
                        onChange={handleInlineChange}
                        style={styles.checkbox}
                      />
                      Enable Overdraft Protection
                    </label>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Interest Rate (APY %)</label>
                    <input
                      type="number"
                      name="interest_rate"
                      value={inlineFormData.interest_rate}
                      onChange={handleInlineChange}
                      step="0.01"
                      min="0"
                      max="100"
                      style={styles.input}
                      placeholder="e.g., 0.50"
                    />
                  </div>
                </>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>Notes</label>
                <textarea
                  name="notes"
                  value={inlineFormData.notes}
                  onChange={handleInlineChange}
                  rows="3"
                  style={styles.textarea}
                  placeholder="Add any additional notes about this account..."
                />
              </div>

              <div style={styles.modalActions}>
                <button type="submit" style={styles.saveButton} disabled={isSubmitting}>
                  {isSubmitting ? 'Creating...' : 'Create Account'}
                </button>
                <button type="button" onClick={() => setShowInlineModal(false)} style={styles.cancelButton}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT ACCOUNT MODAL */}
      {showEditModal && editingAccount && (
        <div style={styles.modalOverlay} onClick={() => setShowEditModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Edit Account</h2>
              <button onClick={() => setShowEditModal(false)} style={styles.closeButton}>×</button>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleUpdateAccount(); }}>
              <div style={styles.formGroup}>
                <label style={styles.label}>Account Name <span style={styles.required}>*</span></label>
                <input
                  type="text"
                  name="name"
                  value={editFormData.name}
                  onChange={handleEditChange}
                  style={{ ...styles.input, ...(editErrors.name && styles.inputError) }}
                  placeholder="Account name"
                />
                {editErrors.name && <div style={styles.fieldError}>{editErrors.name}</div>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Current Balance</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    name="balance"
                    value={editFormData.balance}
                    onChange={handleEditChange}
                    step="0.01"
                    style={styles.inputWithSymbol}
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Institution / Bank</label>
                <input
                  type="text"
                  name="institution"
                  value={editFormData.institution}
                  onChange={handleEditChange}
                  style={styles.input}
                  placeholder="e.g., Chase Bank"
                />
              </div>

              {showEditBankFields && (
                <>
                  <div style={styles.sectionDivider}>
                    <span style={styles.sectionTitle}>Bank Account Details</span>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Account Number</label>
                    {!isEditingAccountNumber && displayAccountNumber && editingAccount?.account_number ? (
                      <div style={styles.maskedDisplay}>
                        <span style={styles.maskedValue}>{displayAccountNumber}</span>
                        <button type="button" onClick={() => { setIsEditingAccountNumber(true); setDisplayAccountNumber(''); }} style={styles.editMaskedButton}>Edit</button>
                      </div>
                    ) : (
                      <input
                        type="text"
                        name="account_number"
                        value={editFormData.account_number}
                        onChange={handleEditAccountNumberChange}
                        style={styles.input}
                        placeholder="Enter account number"
                        maxLength="19"
                      />
                    )}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Routing Number</label>
                    {!isEditingRoutingNumber && displayRoutingNumber && editingAccount?.routing_number ? (
                      <div style={styles.maskedDisplay}>
                        <span style={styles.maskedValue}>{displayRoutingNumber}</span>
                        <button type="button" onClick={() => { setIsEditingRoutingNumber(true); setDisplayRoutingNumber(''); }} style={styles.editMaskedButton}>Edit</button>
                      </div>
                    ) : (
                      <input
                        type="text"
                        name="routing_number"
                        value={editFormData.routing_number}
                        onChange={handleEditRoutingNumberChange}
                        style={styles.input}
                        placeholder="9-digit routing number"
                        maxLength="9"
                      />
                    )}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Debit Card Number</label>
                    {!isEditingDebitCardNumber && displayDebitCardNumber && editingAccount?.debit_card_number ? (
                      <div style={styles.maskedDisplay}>
                        <span style={styles.maskedValue}>{displayDebitCardNumber}</span>
                        <button type="button" onClick={() => { setIsEditingDebitCardNumber(true); setDisplayDebitCardNumber(''); }} style={styles.editMaskedButton}>Edit</button>
                      </div>
                    ) : (
                      <input
                        type="text"
                        name="debit_card_number"
                        value={editFormData.debit_card_number}
                        onChange={handleEditDebitCardNumberChange}
                        style={styles.input}
                        placeholder="Enter debit card number"
                        maxLength="19"
                      />
                    )}
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Daily Withdrawal Limit</label>
                    <div style={styles.inputWrapper}>
                      <span style={styles.currencySymbol}>$</span>
                      <input
                        type="number"
                        name="daily_withdrawal_limit"
                        value={editFormData.daily_withdrawal_limit}
                        onChange={handleEditChange}
                        step="0.01"
                        min="0"
                        style={styles.inputWithSymbol}
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.checkboxLabel}>
                      <input
                        type="checkbox"
                        name="overdraft_protection"
                        checked={editFormData.overdraft_protection}
                        onChange={handleEditChange}
                        style={styles.checkbox}
                      />
                      Enable Overdraft Protection
                    </label>
                  </div>

                  <div style={styles.formGroup}>
                    <label style={styles.label}>Interest Rate (APY %)</label>
                    <input
                      type="number"
                      name="interest_rate"
                      value={editFormData.interest_rate}
                      onChange={handleEditChange}
                      step="0.01"
                      min="0"
                      max="100"
                      style={styles.input}
                      placeholder="e.g., 0.50"
                    />
                  </div>
                </>
              )}

              <div style={styles.formGroup}>
                <label style={styles.label}>Notes</label>
                <textarea
                  name="notes"
                  value={editFormData.notes}
                  onChange={handleEditChange}
                  rows="3"
                  style={styles.textarea}
                  placeholder="Add any additional notes..."
                />
              </div>

              <div style={styles.modalActions}>
                <button type="submit" style={styles.saveButton} disabled={isEditing}>
                  {isEditing ? 'Saving...' : 'Save Changes'}
                </button>
                <button type="button" onClick={() => handleDeleteAccount(editingAccount.id, editingAccount.name)} style={styles.deleteButton}>
                  Delete Account
                </button>
                <button type="button" onClick={() => setShowEditModal(false)} style={styles.cancelButton}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    width: '100%',
    padding: '2rem',
    color: 'white'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem'
  },
  description: {
    fontSize: '1rem',
    color: '#9CA3AF'
  },
  addButton: {
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  accountsContainer: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2rem'
  },
  section: {
    marginBottom: '1rem'
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: '#9CA3AF'
  },
  accountList: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    overflow: 'hidden'
  },
  accountRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #374151',
    transition: 'background 0.2s'
  },
  accountInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    flex: 1,
    cursor: 'pointer'
  },
  accountActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem'
  },
  accountIcon: {
    fontSize: '1.5rem'
  },
  accountName: {
    fontWeight: '600',
    color: 'white'
  },
  accountMeta: {
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  accountBalance: {
    textAlign: 'right'
  },
  balanceAmount: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: '#4ADE80'
  },
  editButton: {
    background: 'none',
    border: 'none',
    color: '#F59E0B',
    fontSize: '1.25rem',
    cursor: 'pointer',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    transition: 'all 0.2s'
  },
  deleteButton: {
    background: 'none',
    border: 'none',
    color: '#EF4444',
    fontSize: '1.25rem',
    cursor: 'pointer',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    transition: 'all 0.2s'
  },
  emptyState: {
    padding: '2rem',
    textAlign: 'center',
    color: '#6B7280'
  },
  loadingState: {
    padding: '3rem',
    textAlign: 'center',
    color: '#9CA3AF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem'
  },
  loadingSpinner: {
    width: '40px',
    height: '40px',
    border: '4px solid #3B82F6',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '1rem'
  },
  errorState: {
    padding: '3rem',
    textAlign: 'center',
    color: '#F87171',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem'
  },
  retryButton: {
    padding: '0.5rem 1rem',
    background: '#3B82F6',
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
    borderRadius: '1rem',
    padding: '2rem',
    width: '90%',
    maxWidth: '550px',
    maxHeight: '90vh',
    overflowY: 'auto'
  },
  modalHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem'
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white',
    margin: 0
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '2rem',
    cursor: 'pointer',
    padding: '0 0.5rem'
  },
  formGroup: {
    marginBottom: '1.25rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    fontWeight: '500'
  },
  required: {
    color: '#EF4444',
    marginLeft: '0.25rem'
  },
  hint: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.7rem',
    color: '#6B7280'
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.9rem'
  },
  inputError: {
    borderColor: '#EF4444'
  },
  fieldError: {
    color: '#EF4444',
    fontSize: '0.7rem',
    marginTop: '0.25rem'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.9rem'
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.9rem',
    fontFamily: 'inherit',
    resize: 'vertical'
  },
  inputWrapper: {
    position: 'relative'
  },
  currencySymbol: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9CA3AF',
    fontSize: '0.9rem'
  },
  inputWithSymbol: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 1.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.9rem'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    cursor: 'pointer'
  },
  checkbox: {
    width: '18px',
    height: '18px',
    cursor: 'pointer'
  },
  sectionDivider: {
    margin: '1rem 0 1rem 0',
    borderBottom: '1px solid #374151',
    paddingBottom: '0.5rem'
  },
  sectionTitle: {
    color: '#60A5FA',
    fontSize: '0.8rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.5px'
  },
  maskedDisplay: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    background: '#111827',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    border: '1px solid #374151'
  },
  maskedValue: {
    flex: 1,
    fontFamily: 'monospace',
    fontSize: '1rem',
    letterSpacing: '1px',
    color: '#4ADE80',
    fontWeight: '600'
  },
  editMaskedButton: {
    padding: '0.25rem 0.75rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.75rem'
  },
  modalActions: {
    display: 'flex',
    gap: '0.75rem',
    marginTop: '1.5rem'
  },
  saveButton: {
    flex: 1,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  deleteButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
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
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer'
  }
};

export default CashAccountsView;