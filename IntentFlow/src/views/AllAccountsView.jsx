// src/views/AllAccountsView.jsx — YNAB-style consolidated transaction register (all accounts)
import React, { useState, useCallback, useMemo } from 'react';
import { useRouter } from 'next/router';
import TransactionManager from '../components/TransactionManager';
import TransactionImportModal from '../components/TransactionImportModal';
import useConsolidatedTransactions from '../hooks/useConsolidatedTransactions';
import { createTransactionRegisterHandlers } from '../hooks/useTransactionRegisterHandlers.jsx';

const PAGE_DEFAULT = 25;

const styles = {
  container: {
    padding: '1.25rem 1.5rem',
    maxWidth: '1600px',
    margin: '0 auto',
    color: '#F3F4F6',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: '1rem',
    marginBottom: '1.25rem',
  },
  title: {
    fontSize: '1.75rem',
    fontWeight: 700,
    margin: 0,
    color: '#F9FAFB',
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginTop: '0.35rem',
    maxWidth: '42rem',
    lineHeight: 1.45,
  },
  headerActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.5rem',
  },
  btnPrimary: {
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    border: 'none',
    background: '#2563EB',
    color: '#fff',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  btnSecondary: {
    padding: '0.5rem 1rem',
    borderRadius: '0.375rem',
    border: '1px solid #475569',
    background: 'transparent',
    color: '#E5E7EB',
    fontWeight: 600,
    cursor: 'pointer',
    fontSize: '0.875rem',
  },
  metaRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '1rem',
    marginBottom: '1rem',
    fontSize: '0.8125rem',
    color: '#9CA3AF',
  },
  loading: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '320px',
    color: '#9CA3AF',
  },
  empty: {
    textAlign: 'center',
    padding: '3rem 1.5rem',
    background: '#1F2937',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
  },
  modalOverlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0,0,0,0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10000,
    padding: '1rem',
  },
  modal: {
    background: '#0f172a',
    borderRadius: '12px',
    padding: '1.5rem',
    maxWidth: '480px',
    width: '100%',
    border: '1px solid #374151',
    color: '#F3F4F6',
  },
  formGroup: { marginBottom: '1rem' },
  label: { display: 'block', fontSize: '0.8rem', color: '#9CA3AF', marginBottom: '0.35rem' },
  input: {
    width: '100%',
    padding: '0.5rem',
    borderRadius: '0.375rem',
    border: '1px solid #374151',
    background: '#1F2937',
    color: 'white',
    fontSize: '0.875rem',
    boxSizing: 'border-box',
  },
  modalActions: { display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' },
};

function AllAccountsView({ onNavigate }) {
  const router = useRouter();
  const {
    activeAccounts,
    transactions,
    categories,
    loading,
    error,
    reload,
  } = useConsolidatedTransactions({ activeOnly: true });

  const handlers = useMemo(() => createTransactionRegisterHandlers(reload), [reload]);

  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportPicker, setShowImportPicker] = useState(false);
  const [importAccountId, setImportAccountId] = useState('');
  const [showImportModal, setShowImportModal] = useState(false);

  const [addForm, setAddForm] = useState({
    accountId: '',
    date: new Date().toISOString().slice(0, 10),
    payee: '',
    amount: '',
    type: 'outflow',
    categoryId: '',
    memo: '',
    cleared: false,
  });

  const navigateToAccount = useCallback(
    (accountId) => {
      const id = String(accountId);
      if (onNavigate) {
        onNavigate(`account-${id}`);
        return;
      }
      if (router?.push) {
        router.push(`/accounts/${id}`);
      }
    },
    [onNavigate, router]
  );

  const handleAddTransaction = async () => {
    const amountValue = parseFloat(addForm.amount);
    if (!addForm.accountId) {
      alert('Please select an account');
      return;
    }
    if (!Number.isFinite(amountValue) || amountValue === 0) {
      alert('Please enter a valid amount');
      return;
    }
    const signedAmount =
      addForm.type === 'outflow' ? -Math.abs(amountValue) : Math.abs(amountValue);
    const result = await window.electronAPI.addTransaction({
      accountId: addForm.accountId,
      date: addForm.date,
      payee: addForm.payee,
      description: addForm.payee,
      amount: signedAmount,
      categoryId: addForm.categoryId || null,
      memo: addForm.memo,
      cleared: addForm.cleared ? 1 : 0,
      is_cleared: addForm.cleared ? 1 : 0,
    });
    if (result?.success) {
      setShowAddModal(false);
      setAddForm({
        accountId: '',
        date: new Date().toISOString().slice(0, 10),
        payee: '',
        amount: '',
        type: 'outflow',
        categoryId: '',
        memo: '',
        cleared: false,
      });
      await reload({ quiet: true });
    } else {
      alert(result?.error || 'Failed to add transaction');
    }
  };

  const openImportFlow = () => {
    if (!activeAccounts.length) {
      alert('Create or link an account first (Cash Accounts or Linked Banks).');
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
      <div style={styles.container}>
        <div style={styles.loading}>Loading all account transactions…</div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>All Accounts</h1>
          <p style={styles.subtitle}>
            Consolidated register across every active account. Transactions are stored on each
            account only—this view aggregates them without creating duplicates.
          </p>
        </div>
        <div style={styles.headerActions}>
          {onNavigate && (
            <button
              type="button"
              style={styles.btnSecondary}
              onClick={() => onNavigate('accounts')}
            >
              Cash accounts
            </button>
          )}
          <button type="button" style={styles.btnSecondary} onClick={openImportFlow}>
            Import CSV
          </button>
          <button
            type="button"
            style={styles.btnPrimary}
            onClick={() => setShowAddModal(true)}
          >
            + Add Transaction
          </button>
        </div>
      </div>

      {error && (
        <p style={{ color: '#F87171', marginBottom: '1rem' }}>
          {error}{' '}
          <button type="button" style={styles.btnSecondary} onClick={() => reload()}>
            Retry
          </button>
        </p>
      )}

      <div style={styles.metaRow}>
        <span>{activeAccounts.length} active account(s)</span>
        <span>
          {transactions.filter((t) => t.is_deleted !== 1).length} transaction(s) loaded
        </span>
        <span>Reconciliation and bank linking are managed per account</span>
      </div>

      {!hasTransactions ? (
        <div style={styles.empty}>
          <p style={{ fontSize: '1.05rem', marginBottom: '1.25rem' }}>
            Transactions from all accounts will appear here.
          </p>
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" style={styles.btnPrimary} onClick={() => setShowAddModal(true)}>
              Add Transaction
            </button>
            <button type="button" style={styles.btnSecondary} onClick={openImportFlow}>
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
          showAccountColumn
          multiAccountFilter
          enablePagination
          enableVirtualScroll
          defaultPageSize={PAGE_DEFAULT}
          enableBulkSelection
          enableInlineEdit
          onNavigateToAccount={navigateToAccount}
        />
      )}

      {showAddModal && (
        <div style={styles.modalOverlay} onClick={() => setShowAddModal(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Add Transaction</h3>
            <div style={styles.formGroup}>
              <label style={styles.label}>Account *</label>
              <select
                value={addForm.accountId}
                onChange={(e) => setAddForm({ ...addForm, accountId: e.target.value })}
                style={styles.input}
              >
                <option value="">Select account</option>
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Date *</label>
              <input
                type="date"
                value={addForm.date}
                onChange={(e) => setAddForm({ ...addForm, date: e.target.value })}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Payee *</label>
              <input
                type="text"
                value={addForm.payee}
                onChange={(e) => setAddForm({ ...addForm, payee: e.target.value })}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Amount *</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={addForm.amount}
                onChange={(e) => setAddForm({ ...addForm, amount: e.target.value })}
                style={styles.input}
              />
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Type</label>
              <select
                value={addForm.type}
                onChange={(e) => setAddForm({ ...addForm, type: e.target.value })}
                style={styles.input}
              >
                <option value="outflow">Outflow (expense)</option>
                <option value="inflow">Inflow (income)</option>
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Category</label>
              <select
                value={addForm.categoryId}
                onChange={(e) => setAddForm({ ...addForm, categoryId: e.target.value })}
                style={styles.input}
              >
                <option value="">Uncategorized</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div style={styles.formGroup}>
              <label style={styles.label}>Memo</label>
              <input
                type="text"
                value={addForm.memo}
                onChange={(e) => setAddForm({ ...addForm, memo: e.target.value })}
                style={styles.input}
              />
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
              <input
                type="checkbox"
                checked={addForm.cleared}
                onChange={(e) => setAddForm({ ...addForm, cleared: e.target.checked })}
              />
              Cleared
            </label>
            <div style={styles.modalActions}>
              <button type="button" style={styles.btnSecondary} onClick={() => setShowAddModal(false)}>
                Cancel
              </button>
              <button type="button" style={styles.btnPrimary} onClick={handleAddTransaction}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {showImportPicker && (
        <div style={styles.modalOverlay} onClick={() => setShowImportPicker(false)}>
          <div style={styles.modal} onClick={(e) => e.stopPropagation()}>
            <h3 style={{ marginTop: 0 }}>Import into which account?</h3>
            <p style={{ color: '#9CA3AF', fontSize: '0.85rem' }}>
              CSV import is per account. Imported rows appear here automatically.
            </p>
            <select
              value={importAccountId}
              onChange={(e) => setImportAccountId(e.target.value)}
              style={styles.input}
            >
              <option value="">Select account</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <div style={styles.modalActions}>
              <button type="button" style={styles.btnSecondary} onClick={() => setShowImportPicker(false)}>
                Cancel
              </button>
              <button
                type="button"
                style={styles.btnPrimary}
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
          title="Import transactions (account-specific)"
          onComplete={() => reload({ quiet: true })}
        />
      )}
    </div>
  );
}

export default AllAccountsView;
