import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import CSVManager from '../components/CSVManager';

export default function CSVManagerPage() {
  const router = useRouter();
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load categories for mapping
      const categoriesResult = await window.electronAPI.getCategories(1);
      if (categoriesResult.success) {
        setCategories(categoriesResult.data);
      }

      // Load accounts for mapping
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

  const handleExport = async () => {
    // Get all transactions for export
    const result = await window.electronAPI.getTransactions({ days: 365 * 10 }); // Get all
    if (result.success) {
      return result.data;
    }
    return [];
  };

  const handleImport = async (transactions) => {
    // This will be handled by the component
    console.log('Importing:', transactions);
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
        Loading CSV Manager...
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
          <nav style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/">Budget</Link>
            <Link href="/forecast">Forecast</Link>
            <Link href="/credit-cards">Cards</Link>
            <Link href="/reports">Reports</Link>
            <Link href="/goals">Goals</Link>
            <Link href="/goal-reports">Goal Reports</Link>
            <Link href="/budget-vs-actual">Budget vs Actual</Link>
            <Link href="/csv-manager" style={{ fontWeight: 'bold' }}>CSV</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/transactions">Transactions</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <CSVManager
          categories={categories}
          accounts={accounts}
          onImport={handleImport}
          onExport={handleExport}
        />
      </main>
    </div>
  );
}
