import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import CreditCardManager from '../views/CreditCardManager';
import AccountEditor from '../components/AccountEditor';

export default function CreditCardsPage() {
  const router = useRouter();
  const [cards, setCards] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingCard, setEditingCard] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0); // 👈 force refresh key

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const cardsResult = await window.electronAPI.getCreditCards();
      if (cardsResult.success) {
        setCards(cardsResult.data);
        setRefreshKey(prev => prev + 1); // 👈 trigger re‑mount of CreditCardManager
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

  const handleAddCard = async (cardData) => {
    try {
      const result = await window.electronAPI.createAccount(cardData);
      if (result.success) {
        await loadData();
        setShowAddForm(false);
      } else {
        alert('Failed to add card: ' + result.error);
      }
    } catch (error) {
      console.error('Error adding card:', error);
      alert('Failed to add card');
    }
  };

  const handleUpdateCard = async (cardId, updatedData) => {
    try {
      const result = await window.electronAPI.updateAccount(cardId, updatedData);
      if (result.success) {
        await loadData();
        setEditingCard(null);
      } else {
        alert('Failed to update credit card: ' + result.error);
      }
    } catch (error) {
      console.error('Error updating credit card:', error);
      alert('Failed to update credit card');
    }
  };

  const handleDeleteCard = async (cardId) => {
    try {
      const result = await window.electronAPI.deleteAccount(cardId);
      if (result.success) {
        await loadData();
        setEditingCard(null);
      } else {
        alert('Failed to delete credit card: ' + result.error);
      }
    } catch (error) {
      console.error('Error deleting credit card:', error);
      alert('Failed to delete credit card');
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
        background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'white',
      }}>
        Loading credit cards...
      </div>
    );
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
      color: 'white',
    }}>
      <header style={{
        background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
        padding: '1rem 1.5rem',
        position: 'sticky',
        top: 0,
        zIndex: 10,
      }}>
        <div style={{
          maxWidth: '1200px',
          margin: '0 auto',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h1 style={{ fontSize: '1.5rem', margin: 0 }}>Money Manager</h1>
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
          key={refreshKey} // 👈 forces re‑mount when refreshKey changes
          cards={cards}
          transactions={transactions}
          onMakePayment={handleMakePayment}
          onUpdateCard={handleUpdateCard}
          onDeleteCard={handleDeleteCard}
          onAddCard={() => setShowAddForm(true)}
          onViewTransactions={handleViewTransactions}
          onOpenPlanner={handleOpenPlanner}
        />

        {showAddForm && (
          <AccountEditor
            account={{ type: 'credit' }}
            onSave={handleAddCard}
            onClose={() => setShowAddForm(false)}
          />
        )}

        {editingCard && (
          <AccountEditor
            account={editingCard}
            onSave={handleUpdateCard}
            onDelete={handleDeleteCard}
            onClose={() => setEditingCard(null)}
          />
        )}
      </main>
    </div>
  );
}