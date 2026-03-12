import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import TransactionManager from '../components/TransactionManager';

export default function TransactionsPage() {
  const router = useRouter();
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load transactions
      const transactionsResult = await window.electronAPI.getTransactions();
      if (transactionsResult.success) {
        setTransactions(transactionsResult.data);
      }

      // Load categories
      const categoriesResult = await window.electronAPI.getCategories(1);
      if (categoriesResult.success) {
        setCategories(categoriesResult.data);
      }

      // Load accounts
      const accountsResult = await window.electronAPI.getAccounts();
      if (accountsResult.success) {
        setAccounts(accountsResult.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };
  const handleUpdateTransaction = async (id, updates) => {
    try {
      const result = await window.electronAPI.updateTransaction(id, updates);
      if (result.success) {
        await loadData();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      console.error('Error updating transaction:', error);
      return { success: false, error: error.message };
    }
  };

  const handleDeleteTransaction = async (id) => {
    try {
      const result = await window.electronAPI.deleteTransaction(id);
      if (result.success) {
        await loadData();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      console.error('Error deleting transaction:', error);
      return { success: false, error: error.message };
    }
  };

  const handleToggleCleared = async (id, clearedStatus) => {
    try {
      const result = await window.electronAPI.toggleTransactionCleared(id, clearedStatus);
      if (result.success) {
        await loadData();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      console.error('Error toggling cleared status:', error);
      return { success: false, error: error.message };
    }
  };

const handleAddTransaction = async () => {
    try {
        // FIX: Validate and parse amount
        const amountValue = parseFloat(transactionForm.amount);
        if (isNaN(amountValue) || amountValue === 0) {
            alert('Please enter a valid amount');
            return;
        }

        const amount = transactionForm.type === 'outflow' 
            ? -Math.abs(amountValue) 
            : Math.abs(amountValue);

        const transactionData = {
            accountId: account.id,
            date: transactionForm.date,
            payee: transactionForm.payee,
            description: transactionForm.payee,
            amount: amount,
            categoryId: transactionForm.categoryId || null,
            memo: transactionForm.memo,
            cleared: transactionForm.cleared ? 1 : 0
        };

        console.log('📝 Sending transaction:', transactionData);
        
        const result = await window.electronAPI.addTransaction(transactionData);
        if (result.success) {
            setShowAddModal(false);
            resetForm();
            loadTransactions();
        } else {
            alert('Error adding transaction: ' + result.error);
        }
    } catch (error) {
        console.error('Error adding transaction:', error);
        alert('Error adding transaction: ' + error.message);
    }
};

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white'
      }}>
        Loading transactions...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
      color: 'white'
    }}>
      {/* Navigation Header (copy from your index.jsx) */}
      <header style={{
        background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
        padding: '1rem 1.5rem',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Money Manager</h1>
          <nav style={{ display: 'flex', gap: '1rem' }}>
            <Link href="/">Budget</Link>
            <Link href="/forecast">Forecast</Link>
            <Link href="/credit-cards">Cards</Link>
            <Link href="/reports">Reports</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/goal-reports" passHref>
              <button style={{
                background: router.pathname === '/goal-reports' ? 'rgba(255, 255, 255, 0.3)' : 'rgba(255, 255, 255, 0.1)',
                border: 'none',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}>
                📈 Goal Reports
              </button>
            </Link>
            <Link href="/transactions" style={{ fontWeight: 'bold' }}>Transactions</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <TransactionManager
          transactions={transactions}
          categories={categories}
          accounts={accounts}
          onAddTransaction={handleAddTransaction}
          onUpdateTransaction={handleUpdateTransaction}
          onDeleteTransaction={handleDeleteTransaction}
          onToggleCleared={handleToggleCleared}
        />
      </main>
    </div>
  );
}
