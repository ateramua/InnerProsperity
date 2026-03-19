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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load credit cards (accounts with type='credit')
      const cardsResult = await window.electronAPI.getCreditCards();
      if (cardsResult.success) {
        setCards(cardsResult.data);
      }

      // Load transactions for card activity
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

  const handleUpdateCard = async (cardData) => {
    try {
      const result = await window.electronAPI.updateAccount(editingCard.id, cardData);
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
      // Create a transaction for the payment (money leaving checking)
      const transaction = {
        date: payment.date,
        payee: 'Credit Card Payment',
        amount: -payment.amount, // Negative because it's a payment from checking
        categoryId: 10, // Credit Card Payment category
        accountId: payment.accountId,
        memo: `Payment to credit card`,
        cleared: true
      };

      const result = await window.electronAPI.addTransaction(transaction);

      if (result.success) {
        // Also record the payment on the credit card account (debt decreases)
        const creditTransaction = {
          date: payment.date,
          payee: 'Payment Received',
          amount: payment.amount, // Positive because it reduces debt
          categoryId: 10,
          accountId: payment.cardId,
          memo: `Payment received`,
          cleared: true
        };

        await window.electronAPI.addTransaction(creditTransaction);

        // Update the card balance
        const cardToUpdate = cards.find(c => c.id === payment.cardId);
        if (cardToUpdate) {
          const newBalance = cardToUpdate.balance + payment.amount; // Adding positive amount reduces negative balance
          await window.electronAPI.updateAccount(payment.cardId, { balance: newBalance });
        }

        // Refresh data
        await loadData();
        return { success: true };
      }
      return { success: false, error: result.error };
    } catch (error) {
      console.error('Error making payment:', error);
      return { success: false, error: error.message };
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
        Loading credit cards...
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
        {/* Pass the setShowAddForm to CreditCardManager so the "Add Credit Card" button inside it works */}
        <CreditCardManager
          cards={creditCards}
          transactions={transactions}
          onMakePayment={handleMakePayment}
          onEditCard={handleEditCard}
          onAddCard={handleAddCard} // This now comes from ViewContainer via props
          onViewTransactions={handleViewTransactions}
          onOpenPlanner={handleOpenPlanner}
        />

        {/* Add Credit Card Modal */}
        {showAddForm && (
          <AccountEditor
            account={{ type: 'credit' }} // Pre-select credit card type
            onSave={handleAddCard}
            onClose={() => setShowAddForm(false)}
          />
        )}

        {/* Edit Credit Card Modal */}
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