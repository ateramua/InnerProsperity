import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import GoalReports from '../components/GoalReports';

export default function GoalReportsPage() {
  const router = useRouter();
  const [goals, setGoals] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load goals (mock data for now)
      const mockGoals = [
        { id: 1, name: 'Emergency Fund', target_amount: 10000, current_amount: 2340.50, target_date: '2025-12-31', category_id: 8, account_id: 2, notes: '6 months of expenses' },
        { id: 2, name: 'Vacation', target_amount: 3000, current_amount: 450.00, target_date: '2024-08-01', category_id: 9, account_id: 2, notes: 'Trip to Japan' },
        { id: 3, name: 'New Car', target_amount: 25000, current_amount: 0, target_date: '2026-01-01', category_id: null, account_id: 2, notes: 'Down payment' },
        { id: 4, name: 'Home Down Payment', target_amount: 50000, current_amount: 12500, target_date: '2027-06-01', category_id: null, account_id: 2, notes: 'First home' }
      ];
      setGoals(mockGoals);

      // Load transactions for contribution history
      if (window.electronAPI) {
        const result = await window.electronAPI.getTransactions({ days: 365 });
        if (result.success) {
          setTransactions(result.data);
        }
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
        Loading goal reports...
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
            <Link href="/reports">Reports</Link>
            <Link href="/goals">Goals</Link>
            <Link href="/goal-reports" style={{ fontWeight: 'bold' }}>Goal Reports</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/transactions">Transactions</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <GoalReports
          goals={goals}
          transactions={transactions}
        />
      </main>
    </div>
  );
}
