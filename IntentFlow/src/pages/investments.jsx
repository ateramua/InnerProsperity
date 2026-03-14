import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import InvestmentPortfolio from '../components/InvestmentPortfolio';

export default function InvestmentsPage() {
  const router = useRouter();
  const [investments, setInvestments] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load investments (mock data for now)
      const mockInvestments = [
        {
          id: 1,
          symbol: 'AAPL',
          name: 'Apple Inc.',
          type: 'stock',
          shares: 10,
          purchase_price: 150.50,
          current_price: 175.25,
          purchase_date: '2024-01-15',
          account_id: 2,
          notes: 'Tech stock'
        },
        {
          id: 2,
          symbol: 'VTI',
          name: 'Vanguard Total Stock Market',
          type: 'etf',
          shares: 50,
          purchase_price: 220.30,
          current_price: 235.80,
          purchase_date: '2024-02-01',
          account_id: 2,
          notes: 'Index fund'
        },
        {
          id: 3,
          symbol: 'BTC',
          name: 'Bitcoin',
          type: 'crypto',
          shares: 0.5,
          purchase_price: 42000,
          current_price: 48500,
          purchase_date: '2024-01-20',
          account_id: 2,
          notes: 'Cryptocurrency'
        }
      ];
      setInvestments(mockInvestments);

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
        Loading investments...
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
            <Link href="/csv-manager">CSV</Link>
            <Link href="/bills">Bills</Link>
            <Link href="/investments" style={{ fontWeight: 'bold' }}>Investments</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/transactions">Transactions</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <InvestmentPortfolio
          investments={investments}
          accounts={accounts}
        />
      </main>
    </div>
  );
}
