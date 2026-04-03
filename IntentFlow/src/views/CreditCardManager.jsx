// src/views/CreditCardManager.jsx
import React, { useState, useEffect } from 'react';
import EditAccountModal from './EditAccountModal';

function CreditCardManager({
  cards = [],
  transactions = [],
  onMakePayment,
  onViewTransactions,
  onOpenPlanner
}) {
  const [selectedCard, setSelectedCard] = useState(null);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState({});
  const [filter, setFilter] = useState('all');
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingCard, setEditingCard] = useState(null);
  
  // New state for Zero Interest Accelerator
  const [showAccelerator, setShowAccelerator] = useState(false);
  const [targetMonths, setTargetMonths] = useState(12);
  const [acceleratorPlan, setAcceleratorPlan] = useState(null);

  // Debug: log cards when they change
  useEffect(() => {
    if (cards.length > 0) {
      console.table(cards.map(c => ({
        id: c.id,
        name: c.name,
        balance: c.balance,
        interest_rate: c.interest_rate,
        apr: c.apr,
        account_number: c.account_number,
        account_holder_name: c.account_holder_name
      })));
    }
  }, [cards]);

  // Calculate Zero Interest Accelerator plan for a card
  const calculateAcceleratorPlan = (card) => {
    const balance = Math.abs(card.balance || 0);
    const aprValue = card.interest_rate ?? card.apr ?? 18.99;
    const monthlyRate = aprValue / 100 / 12;
    const minPayment = card.minimum_payment || card.minimumPayment || Math.max(25, balance * 0.02);
    
    // Calculate months to payoff with minimum payment
    let monthsWithMin = 0;
    let totalInterestMin = 0;
    let remainingBalance = balance;
    
    if (monthlyRate === 0) {
      monthsWithMin = Math.ceil(balance / minPayment);
      totalInterestMin = 0;
    } else {
      if (minPayment > balance * monthlyRate) {
        monthsWithMin = Math.ceil(
          -Math.log(1 - (balance * monthlyRate) / minPayment) / Math.log(1 + monthlyRate)
        );
      } else {
        monthsWithMin = Infinity;
      }
      totalInterestMin = monthsWithMin * minPayment - balance;
    }
    
    // Calculate accelerated payment for target months
    let targetPayment = null;
    let targetTotalInterest = null;
    let canAchieve = true;
    
    if (targetMonths > 0 && monthlyRate > 0) {
      const r = monthlyRate;
      const n = targetMonths;
      targetPayment = (r * balance) / (1 - Math.pow(1 + r, -n));
      if (targetPayment < minPayment) {
        targetPayment = minPayment;
        canAchieve = false;
      }
      targetTotalInterest = targetPayment * n - balance;
    } else if (targetMonths > 0) {
      targetPayment = balance / targetMonths;
      targetTotalInterest = 0;
      if (targetPayment < minPayment) canAchieve = false;
    }
    
    const interestSaved = totalInterestMin - targetTotalInterest;
    const extraPerMonth = targetPayment ? targetPayment - minPayment : 0;
    const monthsSaved = monthsWithMin - targetMonths;
    
    return {
      balance,
      minPayment,
      monthsWithMin: isFinite(monthsWithMin) ? monthsWithMin : 999,
      totalInterestMin: isFinite(totalInterestMin) ? totalInterestMin : 999999,
      targetPayment,
      targetTotalInterest,
      interestSaved: Math.max(0, interestSaved),
      extraPerMonth: Math.max(0, extraPerMonth),
      monthsSaved: Math.max(0, monthsSaved),
      canAchieve,
      aprValue
    };
  };

  // Handle card selection and calculate accelerator plan
  const handleCardSelect = (card) => {
    setSelectedCard(selectedCard === card.id ? null : card.id);
    if (selectedCard !== card.id) {
      const plan = calculateAcceleratorPlan(card);
      setAcceleratorPlan(plan);
    }
  };

  // Handle opening accelerator for a card
  const handleOpenAccelerator = (e, card) => {
    e.stopPropagation();
    const plan = calculateAcceleratorPlan(card);
    setAcceleratorPlan(plan);
    setSelectedCard(card.id);
    setShowAccelerator(true);
  };

  // Handle applying accelerator payment
  const handleApplyAccelerator = async (card) => {
    if (!acceleratorPlan || !acceleratorPlan.targetPayment) return;
    
    if (onMakePayment) {
      const result = await onMakePayment({
        cardId: card.id,
        amount: acceleratorPlan.targetPayment,
        date: new Date().toISOString().split('T')[0],
        accountId: card.id,
        isAccelerated: true
      });
      if (result?.success) {
        setShowAccelerator(false);
        window.dispatchEvent(new CustomEvent('accounts-updated'));
        alert(`✅ Accelerated payment of $${acceleratorPlan.targetPayment.toFixed(2)} scheduled! You'll save $${acceleratorPlan.interestSaved.toFixed(2)} in interest.`);
      }
    }
  };

  // Handle adding a new card (opens EditAccountModal in "add" mode)
  const handleAddNewCard = () => {
    // Create a temporary card object with default credit card values
    const newCardTemplate = {
      id: 'new',
      name: '',
      type: 'credit',
      balance: '',
      credit_limit: '',
      limit: '',
      interest_rate: '18.99',
      apr: '18.99',
      due_date: '',
      dueDate: '',
      institution: '',
      account_number: '',
      account_holder_name: '',
      notes: ''
    };
    setEditingCard(newCardTemplate);
    setShowEditModal(true);
  };

  const handleOpenEditModal = (card) => {
    console.log('Opening edit modal for card:', card);
    setEditingCard(card);
    setShowEditModal(true);
  };

  const handleSaveEdit = async (cardId, updatedData) => {
    console.log('📥 CreditCardManager handleSaveEdit received:', cardId, updatedData);

    if (!updatedData) {
      console.error('❌ updatedData is undefined in handleSaveEdit');
      alert('Error: No data to save');
      return;
    }

    // Check if this is a new card (temporary ID 'new')
    if (cardId === 'new') {
      // Create new card
      try {
        // Get current user
        const userResult = await window.electronAPI.getCurrentUser();
        if (!userResult?.success || !userResult?.data) {
          alert('You must be logged in to create a credit card');
          return;
        }

        const userId = userResult.data.id;

        // Validate required fields
        if (!updatedData.name || updatedData.name.trim() === '') {
          alert('Please enter a card name');
          return;
        }

        // Handle balance correctly - convert positive user input to negative for database
        let balanceValue = 0;
        if (updatedData.balance !== undefined && updatedData.balance !== null && updatedData.balance !== '') {
          const parsedBalance = parseFloat(updatedData.balance);
          if (!isNaN(parsedBalance)) {
            balanceValue = -Math.abs(parsedBalance);
          }
        }

        // Prepare credit card data
        const cardData = {
          name: updatedData.name.trim(),
          type: 'credit',
          account_type_category: 'credit',
          balance: balanceValue,
          credit_limit: updatedData.credit_limit ? parseFloat(updatedData.credit_limit) : 0,
          limit: updatedData.credit_limit ? parseFloat(updatedData.credit_limit) : 0,
          interest_rate: updatedData.interest_rate ? parseFloat(updatedData.interest_rate) : 18.99,
          apr: updatedData.interest_rate ? parseFloat(updatedData.interest_rate) : 18.99,
          due_date: updatedData.due_date || null,
          dueDate: updatedData.due_date || null,
          institution: updatedData.institution?.trim() || null,
          account_number: updatedData.account_number?.trim() || null,
          account_holder_name: updatedData.account_holder_name?.trim() || null,
          notes: updatedData.notes?.trim() || null,
          user_id: userId,
          userId: userId,
          currency: 'USD'
        };

        console.log('📝 Creating credit card with data:', cardData);

        const result = await window.electronAPI.createAccount(cardData);
        console.log('createAccount result:', result);

        if (result && result.success) {
          console.log('✅ Credit card created successfully:', result.data);
          setShowEditModal(false);
          setEditingCard(null);
          window.dispatchEvent(new CustomEvent('accounts-updated'));
          alert('✅ Credit card created successfully!');
        } else {
          const errorMsg = result?.error || 'Unknown error occurred';
          console.error('❌ Failed to create credit card:', errorMsg);
          alert(`Failed to create credit card: ${errorMsg}`);
        }
      } catch (error) {
        console.error('❌ Error creating credit card:', error);
        alert(`Error creating credit card: ${error.message}`);
      }
    } else {
      // Update existing card
      try {
        // Get current user FIRST
        const userResult = await window.electronAPI.getCurrentUser();
        if (!userResult?.success || !userResult?.data) {
          alert('You must be logged in');
          return;
        }
        
        const userId = userResult.data.id;
        
        // Build update payload with only changed fields
        let updatePayload = {};

        // Only include fields that have values
        if (updatedData.name !== undefined && updatedData.name !== '') updatePayload.name = updatedData.name;
        if (updatedData.institution !== undefined) updatePayload.institution = updatedData.institution;
        if (updatedData.credit_limit !== undefined && updatedData.credit_limit !== '') {
          updatePayload.credit_limit = parseFloat(updatedData.credit_limit) || 0;
          updatePayload.limit = parseFloat(updatedData.credit_limit) || 0;
        }
        if (updatedData.interest_rate !== undefined && updatedData.interest_rate !== '') {
          updatePayload.interest_rate = parseFloat(updatedData.interest_rate) || 18.99;
          updatePayload.apr = parseFloat(updatedData.interest_rate) || 18.99;
        }
        if (updatedData.due_date !== undefined) updatePayload.due_date = updatedData.due_date;
        if (updatedData.dueDate !== undefined) updatePayload.dueDate = updatedData.dueDate;
        if (updatedData.account_number !== undefined) updatePayload.account_number = updatedData.account_number;
        if (updatedData.account_holder_name !== undefined) updatePayload.account_holder_name = updatedData.account_holder_name;
        if (updatedData.notes !== undefined) updatePayload.notes = updatedData.notes;

        // Handle balance specially - convert to negative
        if (updatedData.balance !== undefined && updatedData.balance !== null && updatedData.balance !== '') {
          const parsedBalance = parseFloat(updatedData.balance);
          if (!isNaN(parsedBalance)) {
            updatePayload.balance = -Math.abs(parsedBalance);
          }
        } else if (updatedData.balance === '') {
          updatePayload.balance = 0;
        }

        // Ensure we have at least one field to update
        if (Object.keys(updatePayload).length === 0) {
          console.error('❌ No fields to update');
          alert('No changes to save');
          return;
        }

        console.log('📝 Updating credit card with payload:', updatePayload);
        console.log('📝 Card ID:', cardId);
        console.log('📝 User ID:', userId);

        const result = await window.electronAPI.updateAccount(cardId, userId, updatePayload);
        console.log('updateAccount result:', result);

        if (result && result.success) {
          console.log('✅ Credit card updated successfully');
          setShowEditModal(false);
          setEditingCard(null);
          window.dispatchEvent(new CustomEvent('accounts-updated'));
          alert('✅ Credit card updated successfully!');
        } else {
          const errorMsg = result?.error || 'Unknown error occurred';
          console.error('❌ Failed to update credit card:', errorMsg);
          alert(`Failed to update credit card: ${errorMsg}`);
        }
      } catch (error) {
        console.error('❌ Error updating credit card:', error);
        alert(`Error updating credit card: ${error.message}`);
      }
    }
  };

  // Calculate card statistics
  const calculateCardStats = (card) => {
    const cardTransactions = transactions.filter(t => t.account_id === card.id);
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const statementBalance = cardTransactions
      .filter(t => t.date >= firstOfMonth)
      .reduce((sum, t) => sum + t.amount, 0);
    const minPayment = card.minimum_payment || card.minimumPayment || Math.max(25, Math.abs(card.balance) * 0.02);
    const dueDate = new Date(card.dueDate || card.due_date);
    const today = new Date();
    const daysUntilDue = dueDate && !isNaN(dueDate) ? Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24)) : 999;
    const utilization = (Math.abs(card.balance) / (card.limit || card.credit_limit || 1000)) * 100;

    // Use interest_rate, fallback to apr, then default
    const aprValue = card.interest_rate ?? card.apr ?? 18.99;
    const monthlyRate = aprValue / 100 / 12;
    const interestIfNotPaid = Math.abs(card.balance) * monthlyRate;

    return {
      statementBalance: Math.abs(statementBalance || card.lastStatementBalance || card.balance),
      minPayment: Math.round(minPayment * 100) / 100,
      daysUntilDue,
      isDueSoon: daysUntilDue <= 7 && daysUntilDue > 0,
      isOverdue: daysUntilDue < 0,
      utilization: Math.min(utilization, 100),
      utilizationColor: utilization > 80 ? '#EF4444' : utilization > 50 ? '#F59E0B' : '#10B981',
      interestIfNotPaid: Math.round(interestIfNotPaid * 100) / 100,
    };
  };

  // Filter cards based on selection
  const getFilteredCards = () => {
    return cards.filter(card => {
      const stats = calculateCardStats(card);
      switch (filter) {
        case 'urgent':
          return stats.isOverdue;
        case 'due-soon':
          return stats.isDueSoon && !stats.isOverdue;
        default:
          return true;
      }
    });
  };

  const handlePayment = (cardId) => {
    const card = cards.find(c => c.id === cardId);
    const stats = calculateCardStats(card);
    setSelectedCard(cardId);
    setPaymentAmount({
      amount: stats.statementBalance,
      minPayment: stats.minPayment,
      cardId
    });
    setShowPaymentModal(true);
  };

  const submitPayment = async () => {
    if (onMakePayment) {
      const result = await onMakePayment({
        cardId: selectedCard,
        amount: paymentAmount.amount,
        date: new Date().toISOString().split('T')[0],
        accountId: selectedCard
      });
      if (result?.success) {
        setShowPaymentModal(false);
        window.dispatchEvent(new CustomEvent('accounts-updated'));
      }
    }
  };

  const handleEditClick = (e, card) => {
    e.stopPropagation();
    handleOpenEditModal(card);
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(Math.abs(amount || 0));
  };

  const handleDeleteCard = async (cardId) => {
    if (!window.confirm('Are you sure you want to delete this credit card? This action cannot be undone.')) {
      return;
    }

    try {
      const userResult = await window.electronAPI.getCurrentUser();
      if (!userResult?.success || !userResult?.data) {
        alert('You must be logged in');
        return;
      }
      const userId = userResult.data.id;

      const result = await window.electronAPI.deleteAccount(cardId, userId);

      if (result && result.success) {
        setShowEditModal(false);
        setEditingCard(null);
        window.dispatchEvent(new CustomEvent('accounts-updated'));
        alert('✅ Credit card deleted successfully!');
      } else {
        alert('Failed to delete credit card: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting credit card:', error);
      alert('Error: ' + error.message);
    }
  };

  const filteredCards = getFilteredCards();
  const totalBalance = cards.reduce((sum, c) => sum + Math.abs(c.balance || 0), 0);
  const totalLimit = cards.reduce((sum, c) => sum + (c.limit || c.credit_limit || 0), 0);
  const overallUtilization = totalLimit > 0 ? (totalBalance / totalLimit) * 100 : 0;
  const urgentCount = cards.filter(c => {
    const stats = calculateCardStats(c);
    return stats.isOverdue || stats.isDueSoon;
  }).length;

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>💳 Credit Card Dashboard</h2>
          <p style={styles.subtitle}>Manage all your credit cards in one place</p>
        </div>
        <div style={styles.headerActions}>
          <button onClick={onOpenPlanner} style={styles.plannerButton}>📈 Open Planner</button>
          <button onClick={handleAddNewCard} style={styles.addButton}>➕ Add Credit Card</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>💰</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Total Balance</div>
            <div style={styles.summaryValue}>{formatCurrency(totalBalance)}</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>📊</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Total Credit Limit</div>
            <div style={styles.summaryValue}>{formatCurrency(totalLimit)}</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>📈</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Overall Utilization</div>
            <div style={styles.summaryValue}>{overallUtilization.toFixed(1)}%</div>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryIcon}>⚠️</div>
          <div style={styles.summaryContent}>
            <div style={styles.summaryLabel}>Need Attention</div>
            <div style={styles.summaryValue}>{urgentCount}</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={styles.filterTabs}>
        <button
          onClick={() => setFilter('all')}
          style={{ ...styles.filterTab, ...(filter === 'all' ? styles.activeFilter : {}) }}
        >
          All Cards ({cards.length})
        </button>
        <button
          onClick={() => setFilter('due-soon')}
          style={{ ...styles.filterTab, ...(filter === 'due-soon' ? styles.activeFilter : {}) }}
        >
          Due Soon ({cards.filter(c => { const s = calculateCardStats(c); return s.isDueSoon && !s.isOverdue; }).length})
        </button>
        <button
          onClick={() => setFilter('urgent')}
          style={{ ...styles.filterTab, ...(filter === 'urgent' ? styles.activeFilter : {}) }}
        >
          Overdue ({cards.filter(c => { const s = calculateCardStats(c); return s.isOverdue; }).length})
        </button>
      </div>

      {/* Cards Grid */}
      {filteredCards.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyIcon}>💳</div>
          <h3 style={styles.emptyTitle}>No credit cards found</h3>
          <p style={styles.emptyText}>
            {filter === 'all' ? 'Get started by adding your first credit card' : 'No cards match the selected filter'}
          </p>
          {filter === 'all' && (
            <button onClick={handleAddNewCard} style={styles.emptyAddButton}>
              ➕ Add Your First Credit Card
            </button>
          )}
        </div>
      ) : (
        <div style={styles.cardsGrid}>
          {filteredCards.map(card => {
            const stats = calculateCardStats(card);
            const isSelected = selectedCard === card.id;
            const accelerator = calculateAcceleratorPlan(card);

            return (
              <div
                key={card.id}
                style={{
                  ...styles.cardItem,
                  ...(isSelected ? styles.selectedCard : {}),
                  borderLeft: `4px solid ${stats.isOverdue ? '#EF4444' : stats.isDueSoon ? '#F59E0B' : stats.utilizationColor}`
                }}
                onClick={() => handleCardSelect(card)}
              >
                {/* Edit Button - Positioned at top right */}
                <button
                  onClick={(e) => handleEditClick(e, card)}
                  style={styles.editButton}
                  title="Edit Card"
                >
                  ✏️
                </button>

                {/* Card Header */}
                <div style={styles.cardHeader}>
                  <div>
                    <h3 style={styles.cardName}>{card.name}</h3>
                    <div style={styles.cardInstitution}>{card.institution || 'Credit Card'}</div>
                    {card.account_number && (
                      <div style={styles.accountNumber}>•••• {card.account_number.slice(-4)}</div>
                    )}
                    {card.account_holder_name && (
                      <div style={styles.cardHolderName}>Holder: {card.account_holder_name}</div>
                    )}
                  </div>
                  <div style={{ ...styles.utilizationBadge, background: stats.utilizationColor + '20', color: stats.utilizationColor }}>
                    {stats.utilization.toFixed(1)}% utilized
                  </div>
                </div>

                {/* Balance */}
                <div style={styles.balanceSection}>
                  <div style={styles.balanceLabel}>Current Balance</div>
                  <div style={{ ...styles.balanceAmount, color: card.balance < 0 ? '#EF4444' : '#10B981' }}>
                    {formatCurrency(card.balance)}
                  </div>
                  <div style={styles.limitText}>of {formatCurrency(card.limit || card.credit_limit || 0)} limit</div>
                </div>

                {/* Progress Bar */}
                <div style={styles.progressBar}>
                  <div style={{ ...styles.progressFill, width: `${Math.min(stats.utilization, 100)}%`, background: stats.utilizationColor }} />
                </div>

                {/* Due Date */}
                <div style={{ ...styles.dueDateSection, background: stats.isOverdue ? '#EF444420' : stats.isDueSoon ? '#F59E0B20' : 'transparent' }}>
                  <span>Due: {card.dueDate || card.due_date ? new Date(card.dueDate || card.due_date).toLocaleDateString() : 'Not set'}</span>
                  <span style={{ color: stats.isOverdue ? '#EF4444' : stats.isDueSoon ? '#F59E0B' : '#9CA3AF', fontWeight: 'bold' }}>
                    {stats.isOverdue ? 'OVERDUE' : stats.daysUntilDue > 0 && stats.daysUntilDue < 999 ? `${stats.daysUntilDue} days left` : stats.daysUntilDue === 999 ? 'No due date' : 'Due today'}
                  </span>
                </div>

                {/* Quick Stats */}
                <div style={styles.quickStats}>
                  <div style={styles.stat}><span>Min Payment</span><strong>{formatCurrency(stats.minPayment)}</strong></div>
                  <div style={styles.stat}>
                    <span>APR</span>
                    <strong>{card.interest_rate ?? card.apr ?? 18.99}%</strong>
                  </div>
                  <div style={styles.stat}><span>Interest</span><strong style={{ color: '#F59E0B' }}>{formatCurrency(stats.interestIfNotPaid)}/mo</strong></div>
                </div>

                {/* Zero Interest Accelerator Badge */}
                {accelerator.targetPayment && accelerator.targetPayment > stats.minPayment && (
                  <div style={styles.acceleratorBadge}>
                    ⚡ Save {formatCurrency(accelerator.interestSaved)} by paying {formatCurrency(accelerator.extraPerMonth)} more/month
                  </div>
                )}

                {/* Action Buttons */}
                <div style={styles.cardActions}>
                  <button
                    onClick={(e) => { e.stopPropagation(); handlePayment(card.id); }}
                    style={styles.paymentButton}
                  >
                    💰 Make Payment
                  </button>
                  <button
                    onClick={(e) => handleOpenAccelerator(e, card)}
                    style={styles.acceleratorButton}
                  >
                    ⚡ Zero Interest
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEditModal(card);
                    }}
                    style={styles.editButtonInline}
                    title="Edit Card"
                  >
                    ✏️ Edit
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); onViewTransactions(card.id); }}
                    style={styles.transactionsButton}
                  >
                    📋 Transactions
                  </button>
                </div>

                {/* Expanded Details */}
                {isSelected && (
                  <div style={styles.expandedDetails}>
                    <h4 style={styles.expandedTitle}>Payment Strategy</h4>
                    <div style={styles.strategyGrid}>
                      <div style={styles.strategyCard}>
                        <div style={styles.strategyLabel}>Pay in Full By</div>
                        <div style={styles.strategyValue}>
                          {card.dueDate || card.due_date ? new Date(card.dueDate || card.due_date).toLocaleDateString() : 'No due date set'}
                        </div>
                        <div style={styles.strategyNote}>
                          Save {formatCurrency(stats.interestIfNotPaid)} in interest
                        </div>
                      </div>
                      <div style={styles.strategyCard}>
                        <div style={styles.strategyLabel}>Payoff Time (Min)</div>
                        <div style={styles.strategyValue}>
                          {accelerator.monthsWithMin} months
                        </div>
                        <div style={styles.strategyNote}>
                          with minimum payments
                        </div>
                      </div>
                      {accelerator.targetPayment && (
                        <div style={styles.strategyCard}>
                          <div style={styles.strategyLabel}>⚡ Accelerated Payoff</div>
                          <div style={styles.strategyValue}>
                            {targetMonths} months
                          </div>
                          <div style={styles.strategyNote}>
                            Save {formatCurrency(accelerator.interestSaved)} in interest
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Zero Interest Accelerator Detailed View */}
                    {showAccelerator && selectedCard === card.id && (
                      <div style={styles.acceleratorPlan}>
                        <h4 style={styles.expandedTitle}>⚡ Zero Interest Accelerator Plan</h4>
                        <div style={styles.acceleratorControls}>
                          <label style={styles.acceleratorLabel}>
                            Target Payoff Time:
                            <input
                              type="range"
                              min="1"
                              max="60"
                              value={targetMonths}
                              onChange={(e) => {
                                setTargetMonths(Number(e.target.value));
                                setAcceleratorPlan(calculateAcceleratorPlan(card));
                              }}
                              style={styles.acceleratorSlider}
                            />
                            <span style={styles.acceleratorValue}>{targetMonths} months</span>
                          </label>
                        </div>
                        
                        <div style={styles.acceleratorGrid}>
                          <div style={styles.acceleratorItem}>
                            <div style={styles.acceleratorLabel}>Current Payment</div>
                            <div style={styles.acceleratorAmount}>{formatCurrency(accelerator.minPayment)}/mo</div>
                            <div style={styles.acceleratorNote}>Payoff: {accelerator.monthsWithMin} months</div>
                          </div>
                          <div style={styles.acceleratorItem}>
                            <div style={styles.acceleratorLabel}>⚡ Accelerated Payment</div>
                            <div style={styles.acceleratorAmount} style={{ color: '#10B981' }}>{formatCurrency(accelerator.targetPayment)}/mo</div>
                            <div style={styles.acceleratorNote}>+{formatCurrency(accelerator.extraPerMonth)} more per month</div>
                          </div>
                          <div style={styles.acceleratorItem}>
                            <div style={styles.acceleratorLabel}>Interest Saved</div>
                            <div style={styles.acceleratorAmount} style={{ color: '#10B981', fontSize: '1.25rem' }}>{formatCurrency(accelerator.interestSaved)}</div>
                            <div style={styles.acceleratorNote}>Pay off {accelerator.monthsSaved} months sooner</div>
                          </div>
                        </div>

                        <button
                          onClick={() => handleApplyAccelerator(card)}
                          style={styles.applyAcceleratorButton}
                        >
                          ⚡ Apply Accelerated Payment Plan
                        </button>
                      </div>
                    )}

                    {/* Recent Transactions Preview */}
                    {transactions.filter(t => t.account_id === card.id).length > 0 && (
                      <div style={styles.recentTransactions}>
                        <h4 style={styles.expandedTitle}>Recent Transactions</h4>
                        {transactions.filter(t => t.account_id === card.id).slice(0, 3).map(t => (
                          <div key={t.id} style={styles.transactionItem}>
                            <span>{new Date(t.date).toLocaleDateString()}</span>
                            <span>{t.description || 'Transaction'}</span>
                            <span style={{ color: t.amount < 0 ? '#EF4444' : '#10B981' }}>{formatCurrency(t.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Payment Modal */}
      {showPaymentModal && (
        <div style={styles.modalOverlay} onClick={() => setShowPaymentModal(false)}>
          <div style={styles.modalContent} onClick={e => e.stopPropagation()}>
            <h3 style={styles.modalTitle}>Make a Payment</h3>

            <div style={styles.formGroup}>
              <label style={styles.label}>Payment Amount</label>
              <div style={styles.inputWrapper}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  value={paymentAmount.amount}
                  onChange={(e) => setPaymentAmount({ ...paymentAmount, amount: parseFloat(e.target.value) || 0 })}
                  min={paymentAmount.minPayment}
                  step="0.01"
                  style={styles.modalInput}
                  autoFocus
                />
              </div>
              <div style={styles.paymentHints}>
                <span>Min: {formatCurrency(paymentAmount.minPayment)}</span>
                <button
                  onClick={() => setPaymentAmount({ ...paymentAmount, amount: paymentAmount.amount })}
                  style={styles.fullPaymentHint}
                >
                  Full: {formatCurrency(paymentAmount.amount)}
                </button>
              </div>
            </div>

            <div style={styles.formGroup}>
              <label style={styles.label}>Payment Date</label>
              <input
                type="date"
                value={new Date().toISOString().split('T')[0]}
                style={styles.modalInput}
                min={new Date().toISOString().split('T')[0]}
              />
            </div>

            <div style={styles.modalActions}>
              <button onClick={submitPayment} style={styles.submitButton}>Submit Payment</button>
              <button onClick={() => setShowPaymentModal(false)} style={styles.cancelButton}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Unified Edit Account Modal - Handles both Create and Edit */}
      <EditAccountModal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false);
          setEditingCard(null);
        }}
        onSave={handleSaveEdit}
        onDelete={handleDeleteCard}
        account={editingCard}
      />
    </div>
  );
}

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1400px',
    margin: '0 auto',
    color: 'white'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    flexWrap: 'wrap',
    gap: '1rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    margin: '0 0 0.25rem 0',
    background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    margin: 0
  },
  headerActions: {
    display: 'flex',
    gap: '1rem'
  },
  plannerButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #8B5CF6, #6D28D9)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  addButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem'
  },
  summaryCard: {
    background: '#1F2937',
    padding: '1.25rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  summaryIcon: {
    fontSize: '2rem'
  },
  summaryContent: {
    flex: 1
  },
  summaryLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem',
    textTransform: 'uppercase',
    letterSpacing: '0.05em'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white'
  },
  filterTabs: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '2rem',
    background: '#1F2937',
    padding: '0.25rem',
    borderRadius: '0.5rem',
    width: 'fit-content'
  },
  filterTab: {
    padding: '0.5rem 1rem',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    borderRadius: '0.375rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    transition: 'all 0.2s'
  },
  activeFilter: {
    background: '#3B82F6',
    color: 'white'
  },
  cardsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(380px, 1fr))',
    gap: '1.5rem'
  },
  cardItem: {
    background: '#1F2937',
    borderRadius: '1rem',
    padding: '1.5rem',
    border: '1px solid #374151',
    position: 'relative',
    cursor: 'pointer',
    transition: 'all 0.2s',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)'
    }
  },
  selectedCard: {
    border: '2px solid #3B82F6'
  },
  editButton: {
    position: 'absolute',
    top: '1rem',
    right: '1rem',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '1rem',
    cursor: 'pointer',
    padding: '0.25rem',
    borderRadius: '0.25rem',
    zIndex: 2,
    ':hover': {
      background: '#374151',
      color: 'white'
    }
  },
  editButtonInline: {
    flex: 1,
    padding: '0.5rem',
    background: 'transparent',
    border: '1px solid #F59E0B',
    color: '#F59E0B',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.25rem'
  },
  cardHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem',
    marginRight: '2rem'
  },
  cardName: {
    fontSize: '1.125rem',
    fontWeight: '600',
    margin: '0 0 0.25rem 0',
    color: 'white'
  },
  cardInstitution: {
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  cardHolderName: {
    fontSize: '0.7rem',
    color: '#6B7280',
    marginTop: '0.25rem'
  },
  accountNumber: {
    fontSize: '0.7rem',
    color: '#6B7280',
    marginTop: '0.25rem',
    fontFamily: 'monospace'
  },
  utilizationBadge: {
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: '600'
  },
  balanceSection: {
    marginBottom: '1rem'
  },
  balanceLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem'
  },
  balanceAmount: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    lineHeight: '1.2'
  },
  limitText: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginTop: '0.25rem'
  },
  progressBar: {
    height: '0.5rem',
    background: '#374151',
    borderRadius: '0.25rem',
    overflow: 'hidden',
    marginBottom: '1rem'
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease'
  },
  dueDateSection: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    borderRadius: '0.5rem',
    marginBottom: '1rem',
    fontSize: '0.875rem'
  },
  quickStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.5rem',
    marginBottom: '1rem'
  },
  stat: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  acceleratorBadge: {
    background: 'linear-gradient(135deg, #F59E0B20, #D9770620)',
    border: '1px solid #F59E0B',
    borderRadius: '0.5rem',
    padding: '0.5rem',
    marginBottom: '1rem',
    fontSize: '0.75rem',
    textAlign: 'center',
    color: '#F59E0B'
  },
  cardActions: {
    display: 'flex',
    gap: '0.5rem'
  },
  paymentButton: {
    flex: 1,
    padding: '0.5rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  acceleratorButton: {
    flex: 1,
    padding: '0.5rem',
    background: 'linear-gradient(135deg, #F59E0B, #D97706)',
    color: 'white',
    border: 'none',
    borderRadius: '0.375rem',
    fontSize: '0.7rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  transactionsButton: {
    flex: 1,
    padding: '0.5rem',
    background: 'transparent',
    border: '1px solid #3B82F6',
    color: '#3B82F6',
    borderRadius: '0.375rem',
    fontSize: '0.75rem',
    cursor: 'pointer'
  },
  expandedDetails: {
    marginTop: '1rem',
    paddingTop: '1rem',
    borderTop: '1px solid #374151'
  },
  expandedTitle: {
    fontSize: '0.875rem',
    fontWeight: '600',
    margin: '0 0 0.75rem 0',
    color: 'white'
  },
  strategyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
    gap: '0.75rem',
    marginBottom: '1rem'
  },
  strategyCard: {
    background: '#111827',
    padding: '0.75rem',
    borderRadius: '0.5rem'
  },
  strategyLabel: {
    fontSize: '0.625rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem',
    textTransform: 'uppercase'
  },
  strategyValue: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '0.25rem'
  },
  strategyNote: {
    fontSize: '0.625rem',
    color: '#10B981'
  },
  acceleratorPlan: {
    background: 'linear-gradient(135deg, #1E3A5F, #0F172A)',
    padding: '1rem',
    borderRadius: '0.75rem',
    marginBottom: '1rem'
  },
  acceleratorControls: {
    marginBottom: '1rem'
  },
  acceleratorSlider: {
    width: '100%',
    margin: '0.5rem 0'
  },
  acceleratorValue: {
    display: 'inline-block',
    marginLeft: '0.5rem',
    fontWeight: 'bold',
    color: '#F59E0B'
  },
  acceleratorGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '0.75rem',
    marginBottom: '1rem'
  },
  acceleratorItem: {
    textAlign: 'center',
    padding: '0.5rem',
    background: 'rgba(0,0,0,0.3)',
    borderRadius: '0.5rem'
  },
  acceleratorLabel: {
    fontSize: '0.7rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem'
  },
  acceleratorAmount: {
    fontSize: '1rem',
    fontWeight: 'bold',
    color: 'white'
  },
  acceleratorNote: {
    fontSize: '0.6rem',
    color: '#6B7280',
    marginTop: '0.25rem'
  },
  applyAcceleratorButton: {
    width: '100%',
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer',
    marginTop: '0.5rem'
  },
  recentTransactions: {
    background: '#111827',
    padding: '0.75rem',
    borderRadius: '0.5rem'
  },
  transactionItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem 0',
    borderBottom: '1px solid #374151',
    fontSize: '0.75rem',
    ':last-child': {
      borderBottom: 'none'
    }
  },
  emptyState: {
    textAlign: 'center',
    padding: '4rem',
    background: '#1F2937',
    borderRadius: '1rem'
  },
  emptyIcon: {
    fontSize: '3rem',
    marginBottom: '1rem'
  },
  emptyTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '0.5rem'
  },
  emptyText: {
    color: '#9CA3AF',
    marginBottom: '1.5rem'
  },
  emptyAddButton: {
    padding: '0.75rem 1.5rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    cursor: 'pointer'
  },
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.7)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000
  },
  modalContent: {
    background: '#1F2937',
    borderRadius: '1rem',
    padding: '2rem',
    maxWidth: '500px',
    width: '90%'
  },
  modalTitle: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    marginBottom: '1.5rem',
    color: 'white'
  },
  formGroup: {
    marginBottom: '1rem'
  },
  label: {
    display: 'block',
    marginBottom: '0.5rem',
    color: '#9CA3AF',
    fontSize: '0.875rem'
  },
  required: {
    color: '#EF4444',
    marginLeft: '0.25rem'
  },
  hint: {
    display: 'block',
    marginTop: '0.25rem',
    fontSize: '0.75rem',
    color: '#6B7280'
  },
  input: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  select: {
    width: '100%',
    padding: '0.75rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  modalActions: {
    display: 'flex',
    gap: '1rem',
    marginTop: '2rem'
  },
  saveButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  cancelButton: {
    flex: 1,
    padding: '0.75rem',
    background: '#4B5563',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '1rem',
    fontWeight: '600',
    cursor: 'pointer'
  },
  inputWrapper: {
    position: 'relative'
  },
  currencySymbol: {
    position: 'absolute',
    left: '0.75rem',
    top: '50%',
    transform: 'translateY(-50%)',
    color: '#9CA3AF'
  },
  modalInput: {
    width: '100%',
    padding: '0.75rem 0.75rem 0.75rem 2rem',
    background: '#111827',
    border: '1px solid #374151',
    borderRadius: '0.5rem',
    color: 'white',
    fontSize: '1rem'
  },
  paymentHints: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '0.5rem',
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  fullPaymentHint: {
    background: 'none',
    border: 'none',
    color: '#3B82F6',
    cursor: 'pointer',
    fontSize: '0.75rem'
  },
  submitButton: {
    flex: 2,
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #10B981, #059669)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    fontSize: '0.875rem',
    fontWeight: '600',
    cursor: 'pointer'
  }
};

export default CreditCardManager;