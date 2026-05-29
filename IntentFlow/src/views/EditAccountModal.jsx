import React, { useState, useEffect } from 'react';
import { isPlaidLinkedAccount, hasPlaidAccountBridge } from '../utils/plaidAccountUtils';
import PlaidManageConnectionLink from '../components/PlaidManageConnectionLink';

const EditAccountModal = ({
  isOpen,
  onClose,
  onSave,
  onDelete,
  account,
  mode = 'edit',
  onNavigate,
  allowDeleteWhenPlaidLinked = false,
  deleteButtonLabel = 'Delete Account',
}) => {
  const [formData, setFormData] = useState({
    name: '',
    type: '',
    balance: '',
    credit_limit: '',
    interest_rate: '',
    due_date: '',
    minimum_payment: '',
    institution: '',
    account_number: '',
    routing_number: '',
    account_holder_name: '',
    notes: '',
    // Loan-specific fields
    original_balance: '',
    term_months: '',
    monthly_payment: '',
    loan_type: '',
    // Debit card specific
    daily_withdrawal_limit: '',
    rewards_program: '',
    // Savings card specific
    transfer_limit: '',
    linked_savings_account: ''
  });

  // For displaying masked account number
  const [displayAccountNumber, setDisplayAccountNumber] = useState('');
  const [isEditingAccountNumber, setIsEditingAccountNumber] = useState(false);

  // For displaying masked routing number
  const [displayRoutingNumber, setDisplayRoutingNumber] = useState('');
  const [isEditingRoutingNumber, setIsEditingRoutingNumber] = useState(false);
  const [plaidSyncEnabled, setPlaidSyncEnabled] = useState(true);
  const [plaidBalanceLocked, setPlaidBalanceLocked] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  // Helper function to mask account number safely
  const maskAccountNumber = (number) => {
    if (!number || number.length === 0) return '';
    if (number.length <= 4) return number;
    
    const asterisksCount = Math.max(0, number.length - 4);
    const asterisks = '•'.repeat(Math.min(asterisksCount, 12));
    return asterisks + number.slice(-4);
  };

  // Helper to mask routing number (show last 4 digits only)
  const maskRoutingNumber = (number) => {
    if (!number || number.length === 0) return '';
    if (number.length <= 4) return number;
    const asterisks = '•'.repeat(Math.min(number.length - 4, 5));
    return asterisks + number.slice(-4);
  };

  useEffect(() => {
    console.log('🔍 EditAccountModal - account prop:', account);
    console.log('🔍 EditAccountModal - account type:', account?.type);
    
    if (account && isOpen) {
      // For new accounts (id === 'new'), set default values
      if (account.id === 'new') {
        setFormData({
          name: account.name || '',
          type: account.type || 'credit',  // Default type
          balance: '',
          credit_limit: account.credit_limit || account.limit || '',
          interest_rate: account.interest_rate || account.apr || '',
          due_date: account.due_date || account.dueDate || '',
          minimum_payment: '',
          institution: account.institution || '',
          account_number: '',
          routing_number: '',
          account_holder_name: account.account_holder_name || '',
          notes: account.notes || '',
          // Loan-specific defaults
          original_balance: '',
          term_months: '',
          monthly_payment: '',
          loan_type: account.loan_type || 'personal',
          // Debit card defaults
          daily_withdrawal_limit: '',
          rewards_program: '',
          // Savings card defaults
          transfer_limit: '',
          linked_savings_account: ''
        });
        setDisplayAccountNumber('');
        setDisplayRoutingNumber('');
        setIsEditingAccountNumber(true);
        setIsEditingRoutingNumber(true);
      } else {
        // For existing accounts
        const fullNumber = account.account_number || '';
        const fullRoutingNumber = account.routing_number || '';
        const balanceValue = account.balance !== undefined && account.balance !== null 
          ? Math.abs(account.balance).toString() 
          : '';
        
        setFormData({
          name: account.name || '',
          type: account.type || 'credit',
          balance: balanceValue,
          credit_limit: account.credit_limit || account.limit || '',
          interest_rate: account.interest_rate || account.apr || '',
          due_date: account.due_date || account.dueDate || '',
          minimum_payment: account.minimum_payment ?? account.minimumPayment ?? '',
          institution: account.institution || '',
          account_number: fullNumber,
          routing_number: fullRoutingNumber,
          account_holder_name: account.account_holder_name || '',
          notes: account.notes || '',
          // Loan-specific fields
          original_balance: account.original_balance ? Math.abs(account.original_balance).toString() : '',
          term_months: account.term_months || '',
          monthly_payment: account.monthly_payment || account.payment_amount || '',
          loan_type: account.loan_type || 'personal',
          // Debit card fields
          daily_withdrawal_limit: account.daily_withdrawal_limit || '',
          rewards_program: account.rewards_program || '',
          // Savings card fields
          transfer_limit: account.transfer_limit || '',
          linked_savings_account: account.linked_savings_account || ''
        });
        
        // Mask the account number for display
        setDisplayAccountNumber(maskAccountNumber(fullNumber));
        setDisplayRoutingNumber(maskRoutingNumber(fullRoutingNumber));
        setIsEditingAccountNumber(false);
        setIsEditingRoutingNumber(false);
        setPlaidSyncEnabled(account.sync_enabled !== false);
        setPlaidBalanceLocked(account.balance_locked === true);
      }
    }
  }, [account, isOpen]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle account number change with masking
  const handleAccountNumberChange = (e) => {
    let value = e.target.value;
    
    // Remove any non-digit characters
    value = value.replace(/\D/g, '');
    
    // Limit to 16 digits
    if (value.length > 16) {
      value = value.slice(0, 16);
    }
    
    setFormData(prev => ({ ...prev, account_number: value }));
    
    // Update masked display while typing
    setDisplayAccountNumber(maskAccountNumber(value));
  };

  // Handle routing number change
  const handleRoutingNumberChange = (e) => {
    let value = e.target.value;
    // Remove any non-digit characters
    value = value.replace(/\D/g, '');
    // Limit to 9 digits (standard US routing number)
    if (value.length > 9) {
      value = value.slice(0, 9);
    }
    setFormData(prev => ({ ...prev, routing_number: value }));
    setDisplayRoutingNumber(maskRoutingNumber(value));
  };

  // Toggle edit mode for account number
  const handleEditAccountNumberClick = () => {
    setIsEditingAccountNumber(true);
    setDisplayAccountNumber('');
  };

  // Toggle edit mode for routing number
  const handleEditRoutingNumberClick = () => {
    setIsEditingRoutingNumber(true);
    setDisplayRoutingNumber('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    const linked =
      account?.id && account.id !== 'new' && isPlaidLinkedAccount(account);
    
    // Prepare data for save based on account type
    const isLoan = formData.type === 'loan';
    const isChecking = formData.type === 'checking';
    const isSavings = formData.type === 'savings';
    const isDebitCard = formData.type === 'debit_card';
    const isSavingsCard = formData.type === 'savings_card';
    const isCreditCard = formData.type === 'credit';
    
    const saveData = {
      name: linked ? undefined : formData.name,
      type: linked ? undefined : formData.type,
      balance: linked
        ? undefined
        : formData.balance === ''
          ? 0
          : parseFloat(formData.balance),
      credit_limit: linked
        ? undefined
        : formData.credit_limit === ''
          ? null
          : parseFloat(formData.credit_limit),
      interest_rate: formData.interest_rate === '' ? null : parseFloat(formData.interest_rate),
      due_date: formData.due_date || null,
      minimum_payment: formData.minimum_payment === '' || formData.minimum_payment === undefined || formData.minimum_payment === null
        ? null
        : parseFloat(formData.minimum_payment),
      institution: linked ? undefined : formData.institution || null,
      account_number: formData.account_number || null,
      routing_number: (isChecking || isSavings || isDebitCard || isSavingsCard) ? (formData.routing_number || null) : null,
      account_holder_name: formData.account_holder_name || null,
      notes: formData.notes || null,
      // Loan-specific fields
      ...(isLoan && !linked && {
        original_balance: formData.original_balance === '' ? null : parseFloat(formData.original_balance),
        term_months: formData.term_months === '' ? null : parseInt(formData.term_months, 10),
        monthly_payment: formData.monthly_payment === '' ? null : parseFloat(formData.monthly_payment),
        payment_amount: formData.monthly_payment === '' ? null : parseFloat(formData.monthly_payment),
        loan_type: formData.loan_type
      }),
      // Debit card specific fields
      ...(isDebitCard && {
        daily_withdrawal_limit: formData.daily_withdrawal_limit === '' ? null : parseFloat(formData.daily_withdrawal_limit),
        rewards_program: formData.rewards_program || null
      }),
      // Savings card specific fields
      ...(isSavingsCard && {
        daily_withdrawal_limit: formData.daily_withdrawal_limit === '' ? null : parseFloat(formData.daily_withdrawal_limit),
        transfer_limit: formData.transfer_limit === '' ? null : parseFloat(formData.transfer_limit),
        linked_savings_account: formData.linked_savings_account || null,
        rewards_program: formData.rewards_program || null
      }),
      ...(account?.id &&
        account.id !== 'new' &&
        hasPlaidAccountBridge(account) && {
          sync_enabled: plaidSyncEnabled ? 1 : 0,
          balance_locked: plaidBalanceLocked ? 1 : 0,
        })
    };
    
    console.log('📤 Submitting save data:', saveData);
    console.log('📤 Account number being saved:', saveData.account_number);
    console.log('📤 Routing number being saved:', saveData.routing_number);
    console.log('📤 Account type:', formData.type);
    
    const filtered = Object.fromEntries(
      Object.entries(saveData).filter(([, v]) => v !== undefined)
    );
    const accountId = account?.id === 'new' ? 'new' : account?.id;
    await onSave(accountId, filtered);
  };

  const handleDelete = () => {
    if (onDelete && account?.id !== 'new') {
      onDelete(account.id);
    }
  };

  const handleUnlinkPlaid = async () => {
    if (!window.electronAPI?.unlinkPlaidAccount || !account?.id) return;
    const ok = window.confirm(
      'Stop syncing this account from Plaid? Your bank connection stays active for other accounts on this institution.'
    );
    if (!ok) return;
    setUnlinking(true);
    try {
      const res = await window.electronAPI.unlinkPlaidAccount(account.id);
      if (res?.success) {
        window.dispatchEvent(new CustomEvent('accounts-updated'));
        onClose();
      } else {
        window.alert(res?.error || 'Failed to unlink account');
      }
    } catch (err) {
      window.alert(err.message);
    } finally {
      setUnlinking(false);
    }
  };

  if (!isOpen) return null;

  const isNewCard = account?.id === 'new';
  const plaidLinked = !isNewCard && isPlaidLinkedAccount(account);
  const plaidBridge = !isNewCard && hasPlaidAccountBridge(account);
  const isLoan = formData.type === 'loan';
  const isChecking = formData.type === 'checking';
  const isSavings = formData.type === 'savings';
  const isDebitCard = formData.type === 'debit_card';
  const isSavingsCard = formData.type === 'savings_card';
  const isCreditCard = formData.type === 'credit';
  
  // Check if routing number should be shown
  const showRoutingNumber = isChecking || isSavings || isDebitCard || isSavingsCard;
  
  const getTitle = () => {
    if (isNewCard) {
      if (isLoan) return 'Add New Loan';
      if (isChecking) return 'Add Checking Account';
      if (isSavings) return 'Add Savings Account';
      if (isDebitCard) return 'Add Debit Card';
      if (isSavingsCard) return 'Add Savings Card';
      return 'Add Credit Card';
    } else {
      if (isLoan) return 'Edit Loan';
      if (isChecking) return 'Edit Checking Account';
      if (isSavings) return 'Edit Savings Account';
      if (isDebitCard) return 'Edit Debit Card';
      if (isSavingsCard) return 'Edit Savings Card';
      return 'Edit Credit Card';
    }
  };

  const getBalanceHint = () => {
    if (isLoan) return 'Enter the remaining loan balance';
    if (isChecking || isSavings || isSavingsCard) return 'Enter the current account balance';
    if (isDebitCard || isCreditCard) return 'Enter the current amount owed (positive number)';
    return 'Enter the current balance';
  };

  const getAccountNumberHint = () => {
    if (isChecking || isSavings || isSavingsCard) return 'Enter your account number (up to 16 digits)';
    if (isDebitCard) return 'Enter your debit card number (up to 16 digits)';
    return 'Enter account number (up to 16 digits)';
  };

  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
        <h2 style={styles.modalTitle}>{getTitle()}</h2>

        {plaidLinked && (
          <div style={styles.plaidBanner}>
            This account is synced from your bank. Balance and account details update when you sync in{' '}
            <strong>Linked Banks</strong>. You can edit notes and category-related fields here.
          </div>
        )}

        {plaidBridge && (
          <div style={styles.plaidControls}>
            <label style={styles.plaidCheckRow}>
              <input
                type="checkbox"
                checked={plaidSyncEnabled}
                onChange={(e) => setPlaidSyncEnabled(e.target.checked)}
              />
              <span>Sync balances from bank</span>
            </label>
            <label style={styles.plaidCheckRow}>
              <input
                type="checkbox"
                checked={plaidBalanceLocked}
                disabled={!plaidSyncEnabled}
                onChange={(e) => setPlaidBalanceLocked(e.target.checked)}
              />
              <span>Lock balance (ignore bank balance updates)</span>
            </label>
            <PlaidManageConnectionLink account={account} onNavigate={onNavigate} />
            <button
              type="button"
              style={styles.unlinkPlaidButton}
              onClick={handleUnlinkPlaid}
              disabled={unlinking}
            >
              {unlinking ? 'Unlinking…' : 'Unlink from Plaid (keep account)'}
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Account Name <span style={styles.required}>*</span>
            </label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              style={styles.input}
              placeholder={getPlaceholderByType(formData.type)}
              required
              readOnly={plaidLinked}
              disabled={plaidLinked}
            />
          </div>

          {/* Account Type Selector */}
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Account Type <span style={styles.required}>*</span>
            </label>
            <select
              name="type"
              value={formData.type}
              onChange={handleChange}
              style={styles.select}
              required
              disabled={plaidLinked}
            >
              <option value="credit">💳 Credit Card</option>
              <option value="debit_card">💳 Debit Card</option>
              <option value="savings_card">💳 Savings Card</option>
              <option value="checking">🏦 Checking Account</option>
              <option value="savings">🏦 Savings Account</option>
              <option value="loan">📉 Loan</option>
            </select>
          </div>

          {/* Balance Field */}
          <div style={styles.formGroup}>
            <label style={styles.label}>
              Current Balance <span style={styles.required}>*</span>
            </label>
            <div style={styles.inputWrapper}>
              <span style={styles.currencySymbol}>$</span>
              <input
                type="number"
                name="balance"
                value={formData.balance}
                onChange={(e) => {
                  const value = e.target.value;
                  if (value === '') {
                    setFormData({ ...formData, balance: '' });
                  } else {
                    const numValue = parseFloat(value);
                    if (!isNaN(numValue)) {
                      setFormData({ ...formData, balance: numValue });
                    }
                  }
                }}
                onBlur={() => {
                  if (formData.balance === '' || formData.balance === null) {
                    setFormData({ ...formData, balance: '' });
                  }
                }}
                style={{
                  ...styles.modalInput,
                  ...(plaidLinked ? styles.readOnlyInput : {}),
                }}
                step="0.01"
                placeholder="0.00"
                readOnly={plaidLinked}
                disabled={plaidLinked}
              />
            </div>
            <small style={styles.hint}>
              {plaidLinked
                ? 'Balance is synced from your bank. Use Linked Banks → Sync Now to refresh.'
                : getBalanceHint()}
            </small>
          </div>

          {/* Loan-specific fields */}
          {isLoan && (
            <>
              <div style={styles.formGroup}>
                <label style={styles.label}>Original Loan Amount</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    name="original_balance"
                    value={formData.original_balance}
                    onChange={handleChange}
                    style={styles.modalInput}
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
                <small style={styles.hint}>Original amount borrowed</small>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Loan Type</label>
                <select
                  name="loan_type"
                  value={formData.loan_type}
                  onChange={handleChange}
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
                <label style={styles.label}>Monthly Payment</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    name="monthly_payment"
                    value={formData.monthly_payment}
                    onChange={handleChange}
                    style={styles.modalInput}
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Loan Term (months)</label>
                <input
                  type="number"
                  name="term_months"
                  value={formData.term_months}
                  onChange={handleChange}
                  style={styles.input}
                  step="1"
                  placeholder="e.g., 60 for 5 years"
                />
              </div>
            </>
          )}

          {/* Credit Card specific fields */}
          {isCreditCard && (
            <>
            <div style={styles.formGroup}>
              <label style={styles.label}>Credit Limit</label>
              <div style={styles.inputWrapper}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  name="credit_limit"
                  value={formData.credit_limit}
                  onChange={handleChange}
                  style={styles.modalInput}
                  step="0.01"
                  placeholder="0.00"
                />
              </div>
              <small style={styles.hint}>Maximum credit available</small>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Minimum Payment</label>
              <div style={styles.inputWrapper}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  name="minimum_payment"
                  value={formData.minimum_payment}
                  onChange={handleChange}
                  style={styles.modalInput}
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                />
              </div>
              <small style={styles.hint}>Typical minimum due each statement cycle</small>
            </div>
            </>
          )}

          {/* Debit Card specific fields */}
          {isDebitCard && (
            <>
              <div style={styles.formGroup}>
                <label style={styles.label}>Daily Withdrawal Limit</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    name="daily_withdrawal_limit"
                    value={formData.daily_withdrawal_limit}
                    onChange={handleChange}
                    style={styles.modalInput}
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
                <small style={styles.hint}>Maximum amount you can withdraw daily</small>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Rewards Program</label>
                <input
                  type="text"
                  name="rewards_program"
                  value={formData.rewards_program}
                  onChange={handleChange}
                  style={styles.input}
                  placeholder="e.g., Cashback, Points, None"
                />
              </div>
            </>
          )}

          {/* Savings Card specific fields */}
          {isSavingsCard && (
            <>
              <div style={styles.formGroup}>
                <label style={styles.label}>Daily Withdrawal Limit</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    name="daily_withdrawal_limit"
                    value={formData.daily_withdrawal_limit}
                    onChange={handleChange}
                    style={styles.modalInput}
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
                <small style={styles.hint}>Maximum amount you can withdraw daily</small>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Transfer Limit</label>
                <div style={styles.inputWrapper}>
                  <span style={styles.currencySymbol}>$</span>
                  <input
                    type="number"
                    name="transfer_limit"
                    value={formData.transfer_limit}
                    onChange={handleChange}
                    style={styles.modalInput}
                    step="0.01"
                    placeholder="0.00"
                  />
                </div>
                <small style={styles.hint}>Maximum amount you can transfer per day</small>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Linked Savings Account</label>
                <input
                  type="text"
                  name="linked_savings_account"
                  value={formData.linked_savings_account}
                  onChange={handleChange}
                  style={styles.input}
                  placeholder="e.g., Primary Savings Account"
                />
                <small style={styles.hint}>Optional: Link to a savings account</small>
              </div>

              <div style={styles.formGroup}>
                <label style={styles.label}>Rewards Program</label>
                <input
                  type="text"
                  name="rewards_program"
                  value={formData.rewards_program}
                  onChange={handleChange}
                  style={styles.input}
                  placeholder="e.g., Cashback, Points, None"
                />
              </div>
            </>
          )}

          {/* Common fields for all types */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Interest Rate (APR %)</label>
            <input
              type="number"
              name="interest_rate"
              value={formData.interest_rate}
              onChange={handleChange}
              style={styles.input}
              step="0.01"
              placeholder={isLoan ? "e.g., 5.99" : (isChecking || isSavings || isSavingsCard ? "e.g., 0.50" : "e.g., 18.99")}
            />
            <small style={styles.hint}>
              {isLoan ? 'Annual interest rate on loan' : (isChecking || isSavings || isSavingsCard ? 'Annual percentage yield (APY)' : 'Annual percentage rate (APR)')}
            </small>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Due Date / Statement Date</label>
            <input
              type="date"
              name="due_date"
              value={formData.due_date}
              onChange={handleChange}
              style={styles.input}
            />
            <small style={styles.hint}>
              {isLoan ? 'Monthly payment due date' : (isChecking || isSavings || isSavingsCard ? 'Statement closing date' : 'Credit card statement due date')}
            </small>
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Institution / Bank</label>
            <input
              type="text"
              name="institution"
              value={formData.institution}
              onChange={handleChange}
              style={styles.input}
              placeholder={isLoan ? "e.g., Wells Fargo, Sallie Mae" : "e.g., Chase Bank, Bank of America"}
            />
          </div>

          {/* Account Number Field - For ALL account types */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Account Number</label>
            {!isEditingAccountNumber && displayAccountNumber && !isNewCard && formData.account_number ? (
              <div style={styles.maskedDisplay}>
                <span style={styles.maskedValue}>{displayAccountNumber}</span>
                <button 
                  type="button"
                  onClick={handleEditAccountNumberClick}
                  style={styles.editMaskedButton}
                >
                  Edit
                </button>
              </div>
            ) : (
              <div style={styles.inputWrapper}>
                <input
                  type="text"
                  name="account_number"
                  value={formData.account_number}
                  onChange={handleAccountNumberChange}
                  style={styles.accountNumberInput}
                  placeholder={getAccountNumberHint()}
                  maxLength="16"
                />
              </div>
            )}
            <small style={styles.hint}>
              {getAccountNumberHint()} Only the last 4 digits will be visible after saving.
            </small>
            {formData.account_number && formData.account_number.length > 0 && (
              <div style={styles.maskedPreview}>
                <span style={styles.maskedLabel}>Will be stored as:</span>
                <span style={styles.maskedValue}>
                  {maskAccountNumber(formData.account_number)}
                </span>
              </div>
            )}
          </div>

          {/* Routing Number Field - For Checking, Savings, Debit Card, and Savings Card */}
          {showRoutingNumber && (
            <div style={styles.formGroup}>
              <label style={styles.label}>Routing Number</label>
              {!isEditingRoutingNumber && displayRoutingNumber && !isNewCard && formData.routing_number ? (
                <div style={styles.maskedDisplay}>
                  <span style={styles.maskedValue}>{displayRoutingNumber}</span>
                  <button 
                    type="button"
                    onClick={handleEditRoutingNumberClick}
                    style={styles.editMaskedButton}
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <div style={styles.inputWrapper}>
                  <input
                    type="text"
                    name="routing_number"
                    value={formData.routing_number}
                    onChange={handleRoutingNumberChange}
                    style={styles.accountNumberInput}
                    placeholder="9-digit routing number"
                    maxLength="9"
                  />
                </div>
              )}
              <small style={styles.hint}>
                Enter the 9-digit routing number for this account. Only the last 4 digits will be visible after saving.
              </small>
              {formData.routing_number && formData.routing_number.length > 0 && (
                <div style={styles.maskedPreview}>
                  <span style={styles.maskedLabel}>Will be stored as:</span>
                  <span style={styles.maskedValue}>
                    {maskRoutingNumber(formData.routing_number)}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Account Holder Name - Same for all types */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Account Holder Name</label>
            <input
              type="text"
              name="account_holder_name"
              value={formData.account_holder_name}
              onChange={handleChange}
              style={styles.input}
              placeholder="Name on the account"
            />
            {formData.account_holder_name && (
              <div style={styles.holderPreview}>
                <span style={styles.maskedLabel}>Holder:</span>
                <span style={styles.holderValue}>{formData.account_holder_name}</span>
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={styles.formGroup}>
            <label style={styles.label}>Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              style={styles.textarea}
              rows="3"
              placeholder="Add any additional notes about this account..."
            />
          </div>

          <div style={styles.modalActions}>
            <button type="submit" style={styles.saveButton}>
              {isNewCard ? 'Create Account' : 'Save Changes'}
            </button>
            {!isNewCard && onDelete && (!plaidLinked || allowDeleteWhenPlaidLinked) && (
              <button type="button" onClick={handleDelete} style={styles.deleteButton}>
                {deleteButtonLabel}
              </button>
            )}
            <button type="button" onClick={onClose} style={styles.cancelButton}>
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Helper function for placeholders
function getPlaceholderByType(type) {
  switch(type) {
    case 'loan': return "e.g., Auto Loan, Student Loan";
    case 'checking': return "e.g., Chase Checking";
    case 'savings': return "e.g., High Yield Savings";
    case 'debit_card': return "e.g., Wells Fargo Debit";
    case 'savings_card': return "e.g., Savings Access Card";
    default: return "e.g., Chase Sapphire";
  }
}

const styles = {
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
  plaidControls: {
    marginBottom: '1rem',
    padding: '0.75rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid rgba(147, 197, 253, 0.25)',
    background: 'rgba(15, 23, 42, 0.5)',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  plaidCheckRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.85rem',
    color: '#E2E8F0',
    cursor: 'pointer',
  },
  unlinkPlaidButton: {
    marginTop: '0.25rem',
    padding: '0.4rem 0.75rem',
    background: 'transparent',
    border: '1px solid rgba(248, 113, 113, 0.5)',
    borderRadius: '0.35rem',
    color: '#FCA5A5',
    fontSize: '0.8rem',
    cursor: 'pointer',
    alignSelf: 'flex-start',
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
  readOnlyInput: {
    opacity: 0.85,
    cursor: 'not-allowed',
  },
  modalContent: {
    background: '#1F2937',
    padding: '2rem',
    borderRadius: '1rem',
    width: '90%',
    maxWidth: '550px',
    maxHeight: '90vh',
    overflowY: 'auto'
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: 'white'
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
  hint: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: '#6B7280'
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
  accountNumberInput: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    fontFamily: 'monospace',
    letterSpacing: '0.5px'
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
  inputWrapper: {
    position: 'relative'
  },
  currencySymbol: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9CA3AF',
    zIndex: 1
  },
  modalInput: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 2rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
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
    background: '#0047AB',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.75rem',
    ':hover': {
      background: '#2563EB'
    }
  },
  maskedPreview: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    background: '#111827',
    borderRadius: '0.375rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.75rem',
    border: '1px solid #374151'
  },
  holderPreview: {
    marginTop: '0.5rem',
    padding: '0.5rem',
    background: '#111827',
    borderRadius: '0.375rem',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    fontSize: '0.75rem',
    border: '1px solid #374151'
  },
  maskedLabel: {
    color: '#9CA3AF',
    fontWeight: '500'
  },
  holderValue: {
    color: '#60A5FA',
    fontWeight: '500'
  },
  modalActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '2rem'
  },
  saveButton: {
    flex: 1,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #0047AB, #001a40)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  deleteButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#EF4444',
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

export default EditAccountModal;