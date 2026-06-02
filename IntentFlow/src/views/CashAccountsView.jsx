// src/views/CashAccountsView.jsx
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/router';
import { showAppToast } from '../components/AppToast';
import ConnectBankCTA from '../components/ConnectBankCTA';
import CashAccountRow from '../components/accounts/CashAccountRow';
import {
  deleteCashAccountViaApi,
  getCashAccountDeleteConfirmMessage,
  isCashAccountType,
  isSavingsType,
  loadCashAccountsViaApi,
  normalizeAccountId,
  partitionCashAccounts,
} from '../utils/cashAccountUtils';
import {
  confirmNoDuplicateAccount,
  maskFromAccountNumber,
} from '../utils/plaidDuplicateCheck';
import { isPlaidLinkedAccount } from '../utils/plaidAccountUtils';
import {
  coerceStoredAccountType,
  getAccountTypeSelectOptions,
  isCashAccountTypeValue,
  mapAccountTypeToCategory,
  resolveDisplayAccountType,
} from '../utils/accountTypeOptions.jsx';
import {
  notifyAccountsChanged,
  subscribeAccountsChanged,
} from '../utils/accountRefreshEvents.jsx';

// ✅ HELPER FUNCTIONS
const parseNumber = (value, fallback = null) => {
  const num = parseFloat(value);
  return !isNaN(num) ? num : fallback;
};

const cleanString = (value) => value?.trim() || null;
const cleanNumberString = (value) => value?.replace(/\s/g, '') || null;

const CashAccountsView = () => {
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
  const [editErrors, setEditErrors] = useState({});
  const [isEditing, setIsEditing] = useState(false);
  const [deletingAccountId, setDeletingAccountId] = useState(null);
  /** When true, edit modal Account Type lists all canonical DB types (not only cash). */
  const [editShowAllAccountTypes, setEditShowAllAccountTypes] = useState(false);

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

    const storedType = coerceStoredAccountType(
      resolveDisplayAccountType(editingAccount) || editingAccount.type
    );
    setEditShowAllAccountTypes(!isCashAccountTypeValue(storedType));
    setEditFormData({
      name: editingAccount.name || '',
      type: storedType,
      balance: editingAccount.balance !== undefined && editingAccount.balance !== null
        ? editingAccount.balance.toString()
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

  const loadAccounts = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) {
      setLoading(true);
      setError(null);
    }

    try {
      const result = await loadCashAccountsViaApi();
      if (result.success) {
        setAccounts(result.data || []);
        if (!quiet) setError(null);
      } else if (!quiet) {
        setError(result.error || 'Failed to load accounts');
      }
    } catch (error) {
      console.error('❌ Error loading accounts:', error);
      if (!quiet) setError(error.message);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, []);

  const loadAccountsRef = useRef(loadAccounts);
  loadAccountsRef.current = loadAccounts;

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  useEffect(() => subscribeAccountsChanged(() => loadAccountsRef.current({ quiet: true })), []);

  // ✅ FIXED: safer masking helper
  const maskNumber = (number) => {
    if (!number) return '';
    const str = String(number);
    if (str.length <= 4) return str;
    const maskLength = Math.min(str.length - 4, 12);
    return '•'.repeat(maskLength) + str.slice(-4);
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

    if (!inlineFormData.name?.trim()) {
      newErrors.name = 'Account name is required';
    }

    if (inlineFormData.type === 'checking' || inlineFormData.type === 'savings') {
      if (!inlineFormData.account_number?.trim()) {
        newErrors.account_number = 'Account number is required';
      }
      if (!inlineFormData.routing_number?.trim()) {
        newErrors.routing_number = 'Routing number is required';
      } else if (inlineFormData.routing_number.replace(/\D/g, '').length !== 9) {
        newErrors.routing_number = 'Routing number must be 9 digits';
      }
    }

    setInlineErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const validateEditForm = () => {
    const newErrors = {};
    if (!editFormData.name?.trim()) newErrors.name = 'Account name is required';
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

  // ✅ FIXED: handleCreateInlineAccount with safe parsing and unified event name
  const handleCreateInlineAccount = async () => {
    console.log('🚀🚀🚀 [DEBUG] handleCreateInlineAccount STARTED');
    console.log('[DEBUG] inlineFormData:', JSON.stringify(inlineFormData, null, 2));
    if (!validateInlineForm()) return;

    const mask = maskFromAccountNumber(inlineFormData.account_number);
    const proceed = await confirmNoDuplicateAccount({
      type: inlineFormData.type,
      mask,
      name: inlineFormData.name,
      institution: inlineFormData.institution,
    });
    if (!proceed) return;

    setIsSubmitting(true);
    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in to create an account');
        return;
      }

      const userId = userResult.data.id;

      const accountData = {
        name: cleanString(inlineFormData.name),
        type: inlineFormData.type,
        account_type: inlineFormData.type,
        balance: parseNumber(inlineFormData.balance, 0),
        initial_balance: parseNumber(inlineFormData.balance, 0),
        currency: 'USD',
        institution: cleanString(inlineFormData.institution),
        account_number: cleanNumberString(inlineFormData.account_number),
        routing_number: cleanNumberString(inlineFormData.routing_number),
        debit_card_number: cleanNumberString(inlineFormData.debit_card_number),
        daily_withdrawal_limit: parseNumber(inlineFormData.daily_withdrawal_limit),
        overdraft_protection: !!inlineFormData.overdraft_protection,
        interest_rate: parseNumber(inlineFormData.interest_rate),
        notes: cleanString(inlineFormData.notes),
        user_id: userId,
        userId: userId,
        forceCreate: true,
      };

      console.log('📝 Creating account with data:', accountData);
      console.log('🔍🔍🔍 ABOUT TO CALL API with accountData:', JSON.stringify(accountData, null, 2));

      const result = await window.electronAPI.createAccount(accountData);

      console.log('🔍🔍🔍 API RESULT:', result);

      if (!result) {
        throw new Error('No response received from account service');
      }
      if (!result.success) {
        throw new Error(result.error || 'Failed to create account');
      }

      const createdAccount = result.data || null;
      if (createdAccount && createdAccount.id) {
        setAccounts(prev => [...prev, createdAccount]);
      }

      console.log('✅ Account created successfully:', createdAccount || result);
      setShowInlineModal(false);
      resetInlineForm();
      notifyAccountsChanged({ reason: 'cash-account-created' });
      await loadAccounts();
      alert('✅ Account created successfully!');
    } catch (error) {
      console.error('❌ Error creating account:', error);
      alert(`Error: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ✅ FIXED: handleUpdateAccount with safe parsing and NO forced negative balance
  const handleUpdateAccount = async () => {
    if (!validateEditForm()) return;

    if (!editingAccount?.id) {
      alert('No account selected');
      return;
    }

    setIsEditing(true);

    try {
      const userResult = await window.electronAPI.getCurrentUser();

      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return;
      }

      const userId = userResult.data.id;

      const linked = isPlaidLinkedAccount(editingAccount);
      const accountType = coerceStoredAccountType(editFormData.type);
      const wasCash = isCashAccountTypeValue(editingAccount?.type);
      const willBeCash = isCashAccountTypeValue(accountType);

      if (wasCash && !willBeCash) {
        const ok = window.confirm(
          `Change this account to "${accountType}"?\n\nIt will be removed from Cash Accounts and managed under Credit Cards or Loans instead.`
        );
        if (!ok) {
          setIsEditing(false);
          return;
        }
      }

      const updates = {
        ...(linked ? {} : { name: cleanString(editFormData.name) }),
        ...(linked ? {} : { balance: parseNumber(editFormData.balance, 0) }),
        ...(linked ? {} : { institution: cleanString(editFormData.institution) }),
        ...(linked
          ? {}
          : {
              type: accountType,
              account_type_category: mapAccountTypeToCategory(accountType),
            }),
        account_number: cleanNumberString(editFormData.account_number),
        routing_number: cleanString(editFormData.routing_number),
        debit_card_number: cleanNumberString(editFormData.debit_card_number),
        daily_withdrawal_limit: parseNumber(editFormData.daily_withdrawal_limit),
        overdraft_protection: !!editFormData.overdraft_protection,
        interest_rate: parseNumber(editFormData.interest_rate),
        notes: cleanString(editFormData.notes)
      };

      console.log('📝 Updating account:', editingAccount.id, updates);

      const result = await window.electronAPI.updateAccount(
        editingAccount.id,
        userId,
        updates
      );

      console.log('API result:', result);

      if (result.success) {
        alert('✅ Account updated successfully');
        setShowEditModal(false);
        setEditingAccount(null);
        notifyAccountsChanged({ reason: 'cash-account-updated' });
        await loadAccounts();
      } else {
        alert('❌ Error updating account: ' + (result.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error updating account:', error);
      alert('❌ Error updating account: ' + (error.message || 'Unknown error'));
    } finally {
      setIsEditing(false);
    }
  };

  /** Single delete path for checking and savings (same API, same handlers). */
  const handleDeleteCashAccount = async (account) => {
    if (!account) return;
    const id = normalizeAccountId(account.id);
    if (!id || deletingAccountId) return;

    if (!isCashAccountType(account)) {
      alert('Only checking and savings accounts can be deleted from this page.');
      return;
    }

    if (!window.confirm(getCashAccountDeleteConfirmMessage(account.name, account))) {
      return;
    }

    setDeletingAccountId(id);
    try {
      const result = await deleteCashAccountViaApi(account);

      if (result?.success) {
        setAccounts((prev) => prev.filter((a) => normalizeAccountId(a.id) !== id));
        setShowEditModal(false);
        setEditingAccount(null);
        notifyAccountsChanged({ reason: 'cash-account-deleted' });
        await loadAccounts({ quiet: true });
        showAppToast('Account removed', 'success');
      } else {
        const msg =
          result?.code === 'PLAID_ACCOUNT_DELETE_BLOCKED'
            ? 'This account is linked via Plaid. Use Linked Banks to manage the connection.'
            : result?.error || 'Unknown error';
        alert('Failed to delete account: ' + msg);
        await loadAccounts({ quiet: true });
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      alert('Error: ' + (error.message || 'Delete failed'));
    } finally {
      setDeletingAccountId(null);
    }
  };

  const handleEditClick = (account) => {
    setEditingAccount(account);
    setShowEditModal(true);
  };

  const handleAccountClick = (accountId) => {
    router.push(`/accounts/${accountId}`);
  };

  // ✅ FIXED: safer formatCurrency
  const formatCurrency = (amount) => {
    const value = typeof amount === 'number' ? amount : 0;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(value);
  };

  const getAccountIcon = (type) => {
    const t = String(type || '').toLowerCase();
    return t === 'checking' ? '🏦' : '💰';
  };

  const { checking: checkingAccounts, savings: savingsAccounts, all: cashAccounts } =
    useMemo(() => partitionCashAccounts(accounts), [accounts]);

  const combinedCashBalance = useMemo(
    () =>
      cashAccounts.reduce((sum, account) => {
        const balance = Number(account?.balance);
        return sum + (Number.isFinite(balance) ? balance : 0);
      }, 0),
    [cashAccounts]
  );

  const renderCashAccountSection = (title, sectionAccounts, emptyLabel) => (
    <div style={styles.section}>
      <h2 style={styles.sectionHeaderTitle}>{title}</h2>
      <div style={styles.accountList}>
        {sectionAccounts.map((account) => (
          <CashAccountRow
            key={normalizeAccountId(account.id)}
            account={account}
            styles={styles}
            deletingAccountId={deletingAccountId}
            onAccountClick={handleAccountClick}
            onEdit={handleEditClick}
            onDelete={handleDeleteCashAccount}
            formatCurrency={formatCurrency}
            getAccountIcon={getAccountIcon}
          />
        ))}
        {sectionAccounts.length === 0 && (
          <div style={styles.emptyState}>
            <ConnectBankCTA label={emptyLabel} />
          </div>
        )}
      </div>
    </div>
  );

  // Determine if showing bank fields
  const showBankFields = inlineFormData.type === 'checking' || inlineFormData.type === 'savings';
  const showEditBankFields = isCashAccountTypeValue(editFormData.type);
  const editTypeOptions = getAccountTypeSelectOptions({
    cashOnly: !editShowAllAccountTypes,
  });

  console.log('🎨🎨🎨 [RENDER] CashAccountsView rendering');
  console.log('[RENDER] accounts.length:', accounts.length);
  console.log('[RENDER] accounts details:', accounts.map(a => ({ id: a.id, name: a.name, type: a.type, balance: a.balance })));
  console.log('[RENDER] checkingAccounts length:', checkingAccounts.length);
  console.log('[RENDER] savingsAccounts length:', savingsAccounts.length);

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
          <button type="button" onClick={() => loadAccounts()} style={styles.retryButton}>
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
        <div style={styles.headerRight}>
          <div
            style={styles.combinedBalanceCard}
            aria-label={`Combined checking and savings balance: ${formatCurrency(combinedCashBalance)}`}
          >
            <div style={styles.combinedBalanceLabel}>Combined Checking & Savings</div>
            <div style={styles.combinedBalanceAmount}>{formatCurrency(combinedCashBalance)}</div>
            <div style={styles.combinedBalanceMeta}>
              {cashAccounts.length} connected account{cashAccounts.length === 1 ? '' : 's'}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowInlineModal(true)}
            style={styles.addButton}
          >
            <span>+</span> New Account
          </button>
        </div>
      </div>

      <div style={styles.accountsContainer}>
        {renderCashAccountSection('CHECKING ACCOUNTS', checkingAccounts, 'checking accounts')}
        {renderCashAccountSection('SAVINGS ACCOUNTS', savingsAccounts, 'savings accounts')}
      </div>

      {/* INLINE ADD ACCOUNT MODAL */}
      {showInlineModal && (
        <div style={styles.modalOverlay} onClick={() => setShowInlineModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>Add New Account</h2>
              <button onClick={() => setShowInlineModal(false)} style={styles.closeButton}>×</button>
            </div>

            <form onSubmit={(e) => { 
  console.log('🔴🔴🔴 FORM SUBMIT EVENT TRIGGERED!');
  e.preventDefault(); 
  handleCreateInlineAccount(); 
}}>
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
                <button 
                  type="submit" 
                  style={styles.saveButton} 
                  disabled={isSubmitting}
                  onClick={() => console.log('🔴🔴🔴 CREATE ACCOUNT BUTTON CLICKED!')}
                >
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
              {isPlaidLinkedAccount(editingAccount) && (
                <div style={styles.plaidBanner}>
                  Bank-linked account: balance and name sync from Linked Banks. You can still edit notes and bank details below.
                </div>
              )}
              <div style={styles.formGroup}>
                <label style={styles.label}>Account Name <span style={styles.required}>*</span></label>
                <input
                  type="text"
                  name="name"
                  value={editFormData.name}
                  onChange={handleEditChange}
                  style={{ ...styles.input, ...(editErrors.name && styles.inputError) }}
                  placeholder="Account name"
                  readOnly={isPlaidLinkedAccount(editingAccount)}
                  disabled={isPlaidLinkedAccount(editingAccount)}
                />
                {editErrors.name && <div style={styles.fieldError}>{editErrors.name}</div>}
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Account Type <span style={styles.required}>*</span></label>
                {!isPlaidLinkedAccount(editingAccount) && (
                  <label style={styles.checkboxRow}>
                    <input
                      type="checkbox"
                      checked={editShowAllAccountTypes}
                      onChange={(e) => {
                        const showAll = e.target.checked;
                        setEditShowAllAccountTypes(showAll);
                        if (
                          !showAll &&
                          !isCashAccountTypeValue(editFormData.type)
                        ) {
                          setEditFormData((prev) => ({ ...prev, type: 'checking' }));
                        }
                      }}
                    />
                    <span>Show all account types (credit, loan, investment, other)</span>
                  </label>
                )}
                <select
                  name="type"
                  value={
                    editTypeOptions.some((o) => o.value === editFormData.type)
                      ? editFormData.type
                      : editTypeOptions[0]?.value || 'checking'
                  }
                  onChange={handleEditChange}
                  style={styles.select}
                  disabled={isPlaidLinkedAccount(editingAccount)}
                  title={
                    isPlaidLinkedAccount(editingAccount)
                      ? 'Account type is set by your bank connection'
                      : undefined
                  }
                >
                  {editShowAllAccountTypes ? (
                    <>
                      <optgroup label="Cash accounts">
                        {getAccountTypeSelectOptions({ cashOnly: true }).map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Other account types">
                        {getAccountTypeSelectOptions({ cashOnly: false })
                          .filter((opt) => opt.group === 'other')
                          .map((opt) => (
                            <option key={opt.value} value={opt.value}>
                              {opt.label}
                            </option>
                          ))}
                      </optgroup>
                    </>
                  ) : (
                    editTypeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))
                  )}
                </select>
                {isPlaidLinkedAccount(editingAccount) ? (
                  <div style={styles.fieldHint}>
                    Type is managed via Linked Banks for bank-connected accounts (
                    {coerceStoredAccountType(editingAccount?.type)}).
                  </div>
                ) : (
                  <div style={styles.fieldHint}>
                    Saved to the database <code style={styles.code}>accounts.type</code> column.
                  </div>
                )}
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
                    readOnly={isPlaidLinkedAccount(editingAccount)}
                    disabled={isPlaidLinkedAccount(editingAccount)}
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
                <button
                  type="button"
                  onClick={() => handleDeleteCashAccount(editingAccount)}
                  style={styles.modalDeleteButton}
                  disabled={deletingAccountId === normalizeAccountId(editingAccount.id)}
                >
                  {deletingAccountId === normalizeAccountId(editingAccount.id)
                    ? 'Removing…'
                    : 'Delete Account'}
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
    color: '#0047AB'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1.5rem',
    marginBottom: '2rem'
  },
  headerRight: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
    flexShrink: 0,
  },
  combinedBalanceCard: {
    textAlign: 'right',
    padding: '0.75rem 1rem',
    background: 'rgba(255, 255, 255, 0.08)',
    border: '1px solid rgba(147, 197, 253, 0.35)',
    borderRadius: '0.75rem',
    minWidth: '12rem',
  },
  combinedBalanceLabel: {
    fontSize: '0.75rem',
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    color: '#93C5FD',
    marginBottom: '0.25rem',
  },
  combinedBalanceAmount: {
    fontSize: '1.75rem',
    fontWeight: '700',
    color: '#4ADE80',
    lineHeight: 1.2,
  },
  combinedBalanceMeta: {
    marginTop: '0.35rem',
    fontSize: '0.75rem',
    color: '#9CA3AF',
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
    background: '#0047AB',
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
  sectionHeaderTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '1rem',
    color: '#0047AB'
  },
  accountList: {
    background: '#0047AB',
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
    gap: '0.75rem',
    position: 'relative',
    zIndex: 1,
    flexShrink: 0,
  },
  accountIcon: {
    fontSize: '1.5rem'
  },
  plaidBanner: {
    background: 'rgba(0, 71, 171, 0.2)',
    border: '1px solid rgba(147, 197, 253, 0.35)',
    borderRadius: '0.5rem',
    padding: '0.75rem 1rem',
    marginBottom: '1rem',
    fontSize: '0.85rem',
    color: '#BFDBFE',
    lineHeight: 1.45,
  },
  accountName: {
    fontWeight: '600',
    color: '#FFFFFF'
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
    border: '4px solid #0047AB',
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
    background: '#0047AB',
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
    background: '#0047AB',
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
    background: '#0047AB',
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
  fieldHint: {
    color: '#9CA3AF',
    fontSize: '0.75rem',
    marginTop: '0.35rem',
    lineHeight: 1.4,
  },
  checkboxRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '0.5rem',
    fontSize: '0.8rem',
    color: '#CBD5E1',
    cursor: 'pointer',
  },
  code: {
    fontSize: '0.7rem',
    color: '#93C5FD',
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#0047AB',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '0.9rem'
  },
  textarea: {
    width: '100%',
    padding: '0.75rem',
    background: '#0047AB',
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
    background: '#0047AB',
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
    background: '#0047AB',
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
    background: '#0047AB',
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
    background: 'linear-gradient(135deg, #0047AB, #001a40)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.9rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  modalDeleteButton: {
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