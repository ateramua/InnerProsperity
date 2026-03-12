import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import BillReminders from '../components/BillReminders';

export default function BillsPage() {
  const router = useRouter();
  const [bills, setBills] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load bills (mock data for now)
      const mockBills = [
        { id: 1, name: 'Rent', amount: 1500, due_date: 1, category_id: 1, account_id: 1, payee_id: null, auto_pay: false, reminder_days: 5, notes: 'Monthly rent payment' },
        { id: 2, name: 'Electricity', amount: 95.40, due_date: 15, category_id: 2, account_id: 1, payee_id: null, auto_pay: false, reminder_days: 3, notes: 'Average based on history' },
        { id: 3, name: 'Internet', amount: 70, due_date: 20, category_id: 4, account_id: 1, payee_id: null, auto_pay: true, reminder_days: 3, notes: 'Monthly internet bill' },
        { id: 4, name: 'Netflix', amount: 15.99, due_date: 25, category_id: 8, account_id: 1, payee_id: 4, auto_pay: true, reminder_days: 2, notes: 'Streaming service' },
        { id: 5, name: 'Water', amount: 45.20, due_date: 10, category_id: 3, account_id: 1, payee_id: null, auto_pay: false, reminder_days: 3, notes: 'Monthly water bill' }
      ];
      setBills(mockBills);

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

  const handleAddBill = (bill) => {
    // TODO: Add to database
    console.log('Adding bill:', bill);
    const newBill = {
      id: bills.length + 1,
      ...bill,
      amount: parseFloat(bill.amount)
    };
    setBills([...bills, newBill]);
  };

  const handlePayBill = (bill) => {
    console.log('Paying bill:', bill);
    // TODO: Create transaction and mark bill as paid
    alert(`Processing payment for ${bill.name}: ${formatCurrency(bill.amount)}`);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
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
        Loading bills...
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
            <Link href="/bills" style={{ fontWeight: 'bold' }}>Bills</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/transactions">Transactions</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <BillReminders
          bills={bills}
          categories={categories}
          accounts={accounts}
          onAddBill={handleAddBill}
          onPayBill={handlePayBill}
        />
      </main>
    </div>
  );
}
