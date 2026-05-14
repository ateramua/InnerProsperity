import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import CreditCardManager from '../views/CreditCardManager';

export default function CreditCardsPage() {
  const router = useRouter();
  const [cards, setCards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    loadData();
    
    // Listen for accounts-updated events to refresh data
    const handleAccountsUpdated = () => {
      loadData();
    };
    
    window.addEventListener('accounts-updated', handleAccountsUpdated);
    return () => {
      window.removeEventListener('accounts-updated', handleAccountsUpdated);
    };
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get all accounts and filter for credit cards
      const userResult = await window.electronAPI.getCurrentUser();
      if (userResult?.success && userResult?.data) {
        const userId = userResult.data.id;
        const accountsResult = await window.electronAPI.getAccountsSummary(userId);
        if (accountsResult.success) {
          const allAccounts = accountsResult.data || [];
          // Filter for credit cards only
          const creditCards = allAccounts.filter(account => account.type === 'credit');
          setCards(creditCards);
          setRefreshKey(prev => prev + 1);
        }
      }
      
      const transactionsResult = await window.electronAPI.getTransactions();
      if (transactionsResult.success) {
        setTransactions(transactionsResult.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleMakePayment = async (payment) => {
    try {
      const transaction = {
        date: payment.date,
        payee: 'Credit Card Payment',
        amount: -payment.amount,
        categoryId: 10,
        accountId: payment.accountId,
        memo: `Payment to credit card`,
        cleared: true,
      };

      const result = await window.electronAPI.addTransaction(transaction);

      if (result.success) {
        const creditTransaction = {
          date: payment.date,
          payee: 'Payment Received',
          amount: payment.amount,
          categoryId: 10,
          accountId: payment.cardId,
          memo: `Payment received`,
          cleared: true,
        };

        await window.electronAPI.addTransaction(creditTransaction);

        const cardToUpdate = cards.find((c) => c.id === payment.cardId);
        if (cardToUpdate) {
          const newBalance = cardToUpdate.balance + payment.amount;
          await window.electronAPI.updateAccount(payment.cardId, { balance: newBalance });
        }

        await loadData();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      console.error('Error making payment:', error);
      return { success: false, error: error.message };
    }
  };

  const handleViewTransactions = (cardId) => {
    router.push(`/accounts/${cardId}`);
  };

  const handleOpenPlanner = () => {
    router.push('/planner');
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0047AB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#0047AB',
      }}>
        Loading credit cards...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0047AB',
      color: '#0047AB',
    }}>
      <header style={{
        background: '#0047AB',
        color: '#FFFFFF',
        padding: '1rem 1.5rem',
        position: 'sticky',
        top: 0,
        zIndex: 10,
        borderBottom: '2px solid #0047AB',
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>IntentFlow</h1>
          <nav style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <Link href="/">Budget</Link>
            <Link href="/forecast">Forecast</Link>
            <Link href="/credit-cards" style={{ fontWeight: 'bold' }}>Cards</Link>
            <Link href="/reports">Reports</Link>
            <Link href="/goals">Goals</Link>
            <Link href="/goal-reports">Goal Reports</Link>
            <Link href="/budget-vs-actual">Budget vs Actual</Link>
            <Link href="/accounts">Accounts</Link>
            <Link href="/transactions">Transactions</Link>
            <Link href="/csv-manager">CSV</Link>
            <Link href="/bills">Bills</Link>
            <Link href="/investments">Investments</Link>
            <Link href="/currencies">Currencies</Link>
            <Link href="/settings">Settings</Link>
          </nav>
        </div>
      </header>

      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
        <CreditCardManager
          key={refreshKey}
          cards={cards}
          transactions={transactions}
          onMakePayment={handleMakePayment}
          onViewTransactions={handleViewTransactions}
          onOpenPlanner={handleOpenPlanner}
          // REMOVED: onAddCard, onUpdateCard, onDeleteCard
          // These are now handled internally by CreditCardManager
        />
      </main>
    </div>
  );
}