// src/pages/transactions.jsx — consolidated all-accounts register (Next route)
import React, { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import TransactionManager from '../components/TransactionManager';
import TransactionImportModal from '../components/TransactionImportModal';
import useConsolidatedTransactions from '../hooks/useConsolidatedTransactions';
import useActivityDrilldown from '../hooks/useActivityDrilldown.jsx';
import { createTransactionRegisterHandlers } from '../hooks/useTransactionRegisterHandlers.jsx';
import { TransactionCategorySelectOptions } from '../components/transactions/TransactionCategorySelectOptions.jsx';
import {
  isReadyToAssignSentinel,
  READY_TO_ASSIGN_CATEGORY_ID,
  READY_TO_ASSIGN_VALIDATION_MSG,
  validateReadyToAssignSelection,
} from '../utils/readyToAssignCategory.jsx';

const PAGE_DEFAULT = 25;

export default function TransactionsPage() {
  const router = useRouter();
  const {
    accounts,
    activeAccounts,
    transactions,
    categories,
    loading,
    reload,
    patchTransaction,
    removeTransaction,
  } = useConsolidatedTransactions({ activeOnly: true });

  const {
    drilldown,
    highlightIdSet,
    confirmedActivityIds,
    focusTransactionId,
    focusPayeeLabel,
    initialFilters,
    bannerLabel,
    idsLoading: drilldownIdsLoading,
    prepareReturnToBudget,
    clearDrilldown,
    emptyDrilldownMessage,
  } = useActivityDrilldown({ categories, transactions });

  const activityDrilldownConfig = useMemo(
    () => (drilldown && initialFilters ? { initialFilters } : null),
    [drilldown, initialFilters]
  );

  const handlers = useMemo(
    () => createTransactionRegisterHandlers(reload, { patchTransaction, removeTransaction }),
    [reload, patchTransaction, removeTransaction]
  );

  const [showImportModal, setShowImportModal] = useState(false);
  const [showImportPicker, setShowImportPicker] = useState(false);
  const [importAccountId, setImportAccountId] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [transactionForm, setTransactionForm] = useState({
    date: new Date().toISOString().split('T')[0],
    payee: '',
    amount: '',
    type: 'outflow',
    accountId: '',
    categoryId: '',
    memo: '',
    cleared: false,
  });

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const resetForm = () => {
    setTransactionForm({
      date: new Date().toISOString().split('T')[0],
      payee: '',
      amount: '',
      type: 'outflow',
      accountId: '',
      categoryId: '',
      memo: '',
      cleared: false,
    });
  };

  const navigateToAccount = useCallback(
    (accountId) => {
      router.push(`/accounts/${accountId}`);
    },
    [router]
  );

  const handleAddTransaction = async () => {
    const amountValue = parseFloat(transactionForm.amount);
    if (!Number.isFinite(amountValue) || amountValue === 0) {
      alert('Please enter a valid amount');
      return;
    }
    if (!transactionForm.accountId) {
      alert('Please select an account');
      return;
    }
    const amount =
      transactionForm.type === 'outflow'
        ? -Math.abs(amountValue)
        : Math.abs(amountValue);

    const rtaCheck = validateReadyToAssignSelection(transactionForm.categoryId, {
      isIncome: transactionForm.type === 'inflow',
      isTransfer: false,
    });
    if (!rtaCheck.ok) {
      alert(rtaCheck.message || READY_TO_ASSIGN_VALIDATION_MSG);
      return;
    }
    const categoryId = isReadyToAssignSentinel(transactionForm.categoryId)
      ? READY_TO_ASSIGN_CATEGORY_ID
      : transactionForm.categoryId || null;

    const result = await window.electronAPI.addTransaction({
      accountId: transactionForm.accountId,
      date: transactionForm.date,
      payee: transactionForm.payee,
      description: transactionForm.payee,
      amount,
      categoryId,
      memo: transactionForm.memo,
      cleared: transactionForm.cleared ? 1 : 0,
      is_cleared: transactionForm.cleared ? 1 : 0,
    });
    if (result?.success) {
      setShowAddModal(false);
      resetForm();
      await reload({ quiet: true });
    } else {
      alert(result?.error || 'Failed to add transaction');
    }
  };

  const openImportFlow = () => {
    if (!activeAccounts.length) {
      alert('Create an account first.');
      return;
    }
    if (activeAccounts.length === 1) {
      setImportAccountId(String(activeAccounts[0].id));
      setShowImportModal(true);
      return;
    }
    setShowImportPicker(true);
  };

  const hasTransactions = transactions.some(
    (tx) => tx.is_deleted !== 1 && tx.is_deleted !== true
  );

  if (loading) {
    return (
      <div style={pageStyles.loadingShell}>
        Loading transactions…
      </div>
    );
  }

  return (
    <div style={pageStyles.page}>
      <header style={pageStyles.header}>
        <div style={pageStyles.headerInner}>
          <h1 style={pageStyles.brand}>IntentFlow</h1>
          <nav style={pageStyles.nav}>
            <Link href="/">Budget</Link>
            <Link href="/forecast">Forecast</Link>
            <Link href="/credit-cards">Cards</Link>
            <Link href="/reports">Reports</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/goal-reports" passHref>
              <button
                type="button"
                style={{
                  ...pageStyles.navBtn,
                  ...(router.pathname === '/goal-reports' ? pageStyles.navBtnActive : null),
                }}
              >
                Goal Reports
              </button>
            </Link>
            <Link href="/transactions" style={{ fontWeight: 'bold' }}>
              Transactions
            </Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </div>
      </header>

      <main style={pageStyles.main}>
        <div style={pageStyles.titleRow}>
          <div>
            <h2 style={pageStyles.title}>All Transactions</h2>
            <p style={pageStyles.subtitle}>
              Unified register across active accounts (same data as All Accounts in the desktop app).
            </p>
          </div>
          <div style={pageStyles.titleActions}>
            <button type="button" style={pageStyles.btnSecondary} onClick={openImportFlow}>
              Import CSV
            </button>
            <button type="button" style={pageStyles.btnPrimary} onClick={() => setShowAddModal(true)}>
              + Add Transaction
            </button>
          </div>
        </div>

        {!hasTransactions ? (
          <div style={pageStyles.empty}>
            <p>Transactions from all accounts will appear here.</p>
            <div style={pageStyles.emptyActions}>
              <button type="button" style={pageStyles.btnPrimary} onClick={() => setShowAddModal(true)}>
                Add Transaction
              </button>
              <button type="button" style={pageStyles.btnSecondary} onClick={openImportFlow}>
                Import Transactions
              </button>
            </div>
          </div>
        ) : (
          <TransactionManager
            transactions={transactions}
            categories={categories}
            accounts={activeAccounts}
            onUpdateTransaction={handlers.handleUpdateTransaction}
            onDeleteTransaction={handlers.handleDeleteTransaction}
            onToggleCleared={handlers.handleToggleCleared}
            onBulkDelete={handlers.handleBulkDelete}
            onBulkUpdate={handlers.handleBulkUpdate}
            onReload={reload}
            showAccountColumn
            multiAccountFilter
            enablePagination
            enableVirtualScroll
            defaultPageSize={PAGE_DEFAULT}
            enableBulkSelection
            enableInlineEdit
            onNavigateToAccount={navigateToAccount}
            activityDrilldown={activityDrilldownConfig}
            activityDrilldownHighlightIds={highlightIdSet}
            activityDrilldownIdsLoading={drilldownIdsLoading}
            activityDrilldownBannerLabel={bannerLabel}
            activityDrilldownFocusId={focusTransactionId}
            activityDrilldownFocusLabel={focusPayeeLabel}
            activityDrilldownConfirmedIds={confirmedActivityIds}
            activityDrilldownEmptyMessage={emptyDrilldownMessage}
            onActivityDrilldownBack={() => {
              prepareReturnToBudget();
              router.push('/');
            }}
            onClearActivityDrilldown={clearDrilldown}
          />
        )}

        {showAddModal && (
          <div style={modalStyles.modalOverlay} onClick={() => setShowAddModal(false)}>
            <div style={modalStyles.modalContent} onClick={(e) => e.stopPropagation()}>
              <h3 style={modalStyles.modalTitle}>Add Transaction</h3>
              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Date</label>
                <input
                  type="date"
                  value={transactionForm.date}
                  onChange={(e) => setTransactionForm({ ...transactionForm, date: e.target.value })}
                  style={modalStyles.input}
                />
              </div>
              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Account</label>
                <select
                  value={transactionForm.accountId}
                  onChange={(e) =>
                    setTransactionForm({ ...transactionForm, accountId: e.target.value })
                  }
                  style={modalStyles.select}
                >
                  <option value="">Select an account</option>
                  {accounts.map((account) => {
                    const balanceDisplay = formatCurrency(Math.abs(account.balance || 0));
                    return (
                      <option key={account.id} value={account.id}>
                        {account.name} — {balanceDisplay}
                      </option>
                    );
                  })}
                </select>
              </div>
              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Payee</label>
                <input
                  type="text"
                  value={transactionForm.payee}
                  onChange={(e) => setTransactionForm({ ...transactionForm, payee: e.target.value })}
                  style={modalStyles.input}
                />
              </div>
              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Amount</label>
                <input
                  type="number"
                  step="0.01"
                  value={transactionForm.amount}
                  onChange={(e) => setTransactionForm({ ...transactionForm, amount: e.target.value })}
                  style={modalStyles.input}
                />
              </div>
              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Type</label>
                <select
                  value={transactionForm.type}
                  onChange={(e) => setTransactionForm({ ...transactionForm, type: e.target.value })}
                  style={modalStyles.select}
                >
                  <option value="outflow">Outflow</option>
                  <option value="inflow">Inflow</option>
                </select>
              </div>
              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Category</label>
                <select
                  value={transactionForm.categoryId}
                  onChange={(e) => {
                    const next = e.target.value;
                    const check = validateReadyToAssignSelection(next, {
                      isIncome: transactionForm.type === 'inflow',
                      isTransfer: false,
                    });
                    if (!check.ok) {
                      alert(check.message || READY_TO_ASSIGN_VALIDATION_MSG);
                      return;
                    }
                    setTransactionForm({ ...transactionForm, categoryId: next });
                  }}
                  style={modalStyles.select}
                >
                  <TransactionCategorySelectOptions
                    categories={categories}
                    isIncome={transactionForm.type === 'inflow'}
                    emptyLabel="Uncategorized"
                  />
                </select>
              </div>
              <div style={modalStyles.formGroup}>
                <label style={modalStyles.label}>Memo</label>
                <input
                  type="text"
                  value={transactionForm.memo}
                  onChange={(e) => setTransactionForm({ ...transactionForm, memo: e.target.value })}
                  style={modalStyles.input}
                />
              </div>
              <label style={modalStyles.checkboxLabel}>
                <input
                  type="checkbox"
                  checked={transactionForm.cleared}
                  onChange={(e) =>
                    setTransactionForm({ ...transactionForm, cleared: e.target.checked })
                  }
                />
                Cleared
              </label>
              <div style={modalStyles.modalActions}>
                <button type="button" onClick={handleAddTransaction} style={modalStyles.saveButton}>
                  Add Transaction
                </button>
                <button type="button" onClick={() => setShowAddModal(false)} style={modalStyles.cancelButton}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {showImportPicker && (
          <div style={modalStyles.modalOverlay} onClick={() => setShowImportPicker(false)}>
            <div style={modalStyles.modalContent} onClick={(e) => e.stopPropagation()}>
              <h3 style={modalStyles.modalTitle}>Import into which account?</h3>
              <select
                value={importAccountId}
                onChange={(e) => setImportAccountId(e.target.value)}
                style={modalStyles.select}
              >
                <option value="">Select account</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <div style={modalStyles.modalActions}>
                <button type="button" style={modalStyles.cancelButton} onClick={() => setShowImportPicker(false)}>
                  Cancel
                </button>
                <button
                  type="button"
                  style={modalStyles.saveButton}
                  disabled={!importAccountId}
                  onClick={() => {
                    setShowImportPicker(false);
                    setShowImportModal(true);
                  }}
                >
                  Continue
                </button>
              </div>
            </div>
          </div>
        )}

        {showImportModal && importAccountId && (
          <TransactionImportModal
            isOpen={showImportModal}
            onClose={() => {
              setShowImportModal(false);
              setImportAccountId('');
            }}
            fixedAccountId={importAccountId}
            accounts={activeAccounts}
            title="Import transactions from CSV"
            onComplete={() => reload({ quiet: true })}
          />
        )}
      </main>
    </div>
  );
}

const pageStyles = {
  page: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0047AB 0%, #0047AB 100%)',
    color: 'white',
  },
  loadingShell: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0047AB 0%, #0047AB 100%)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'white',
  },
  header: {
    background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
    padding: '1rem 1.5rem',
    position: 'sticky',
    top: 0,
    zIndex: 10,
  },
  headerInner: {
    maxWidth: '1400px',
    margin: '0 auto',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '1rem',
  },
  brand: { fontSize: '1.5rem', margin: 0 },
  nav: { display: 'flex', flexWrap: 'wrap', gap: '1rem', alignItems: 'center' },
  navBtn: {
    background: 'rgba(255, 255, 255, 0.1)',
    border: 'none',
    color: 'white',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  navBtnActive: { background: 'rgba(255, 255, 255, 0.3)' },
  main: { maxWidth: '1400px', margin: '0 auto', padding: '1.25rem 1.5rem 2rem' },
  titleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
    marginBottom: '1.25rem',
  },
  title: { fontSize: '1.5rem', fontWeight: 'bold', margin: 0 },
  subtitle: { fontSize: '0.875rem', opacity: 0.85, marginTop: '0.35rem' },
  titleActions: { display: 'flex', flexWrap: 'wrap', gap: '0.5rem' },
  btnPrimary: {
    background: '#10B981',
    color: 'white',
    border: 'none',
    padding: '0.65rem 1.25rem',
    borderRadius: '0.5rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  btnSecondary: {
    background: 'rgba(255,255,255,0.12)',
    color: 'white',
    border: '1px solid rgba(255,255,255,0.35)',
    padding: '0.65rem 1.25rem',
    borderRadius: '0.5rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem 1.5rem',
    background: 'rgba(0,0,0,0.2)',
    borderRadius: '0.75rem',
  },
  emptyActions: {
    display: 'flex',
    gap: '0.75rem',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: '1.25rem',
  },
};

const modalStyles = {
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
    zIndex: 1000,
  },
  modalContent: {
    background: '#1F2937',
    padding: '2rem',
    borderRadius: '1rem',
    width: '90%',
    maxWidth: '500px',
    maxHeight: '90vh',
    overflowY: 'auto',
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: 'white',
  },
  formGroup: { marginBottom: '1rem' },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    color: '#9CA3AF',
    cursor: 'pointer',
    gap: '0.5rem',
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem',
    boxSizing: 'border-box',
  },
  modalActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '2rem',
  },
  saveButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#10B981',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer',
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
    cursor: 'pointer',
  },
};
