import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import ReportsDashboard from '../components/ReportsDashboard';

export default function ReportsPage() {
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
      const transactionsResult = await window.electronAPI.getTransactions({ limit: 1000 });
      if (transactionsResult.success) {
        setTransactions(transactionsResult.data);
      }

      // Load categories
      const categoriesResult = await window.electronAPI.getCategories(1);
      if (categoriesResult.success) {
        setCategories(categoriesResult.data);
      }

      // Load accounts (for reference)
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
        Loading reports...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
      color: 'white'
    }}>
      {/* Navigation Header */}
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
            <Link href="/reports" style={{ fontWeight: 'bold' }}>Reports</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/transactions">Transactions</Link>
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
            <Link href="/settings">Settings</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <ReportsDashboard
          transactions={transactions}
          categories={categories}
          accounts={accounts}
        />
      </main>
    </div>
  );
}
