import React, { useState, useEffect } from 'react';

export default function CreditCardManager({ 
  cards: initialCards, 
  transactions, 
  onMakePayment,
  onEditCard,
  onAddCard 
}) {
  const [cards, setCards] = useState(initialCards || []);
  const [selectedCard, setSelectedCard] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState({});
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Update cards when initialCards changes
  useEffect(() => {
    setCards(initialCards || []);
  }, [initialCards]);

  // Calculate card statistics
  const calculateCardStats = (card) => {
    const cardTransactions = transactions.filter(t => t.account_id === card.id);
    
    // Current statement balance (transactions this month)
    const now = new Date();
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    
    const statementBalance = cardTransactions
      .filter(t => t.date >= firstOfMonth)
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Minimum payment (typically 1-3% of balance)
    const minPayment = Math.max(25, Math.abs(card.balance) * 0.02);
    
    // Days until due date
    const dueDate = new Date(card.due_date);
    const today = new Date();
    const daysUntilDue = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
    
    // Utilization percentage
    const utilization = (Math.abs(card.balance) / card.limit) * 100;
    
    // Interest calculation (if not paid in full)
    const monthlyRate = card.apr / 100 / 12;
    const interestIfNotPaid = Math.abs(card.balance) * monthlyRate;
    
    return {
      statementBalance: Math.abs(statementBalance),
      minPayment: Math.round(minPayment * 100) / 100,
      daysUntilDue,
      isDueSoon: daysUntilDue <= 7 && daysUntilDue > 0,
      isOverdue: daysUntilDue < 0,
      utilization,
      utilizationColor: utilization > 80 ? '#EF4444' : utilization > 50 ? '#F59E0B' : '#10B981',
      interestIfNotPaid: Math.round(interestIfNotPaid * 100) / 100
    };
  };

  const handlePayment = (cardId) => {
    setSelectedCard(cardId);
    setShowPaymentModal(true);
    const card = cards.find(c => c.id === cardId);
    const stats = calculateCardStats(card);
    setPaymentAmount({
      amount: stats.statementBalance,
      minPayment: stats.minPayment
    });
  };

  const submitPayment = async () => {
    if (onMakePayment) {
      const card = cards.find(c => c.id === selectedCard);
      const result = await onMakePayment({
        cardId: selectedCard,
        amount: paymentAmount.amount,
        date: new Date().toISOString().split('T')[0],
        accountId: card.id
      });
      if (result.success) {
        setShowPaymentModal(false);
        // Refresh data will happen via parent component
      }
    }
  };

  const handleEditClick = (e, card) => {
    e.stopPropagation();
    if (onEditCard) {
      onEditCard(card);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(Math.abs(amount));
  };

  return (
    <div style={{ padding: '20px', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>💳 Credit Cards</h2>
        <button
          onClick={onAddCard}
          style={{
            background: '#3B82F6',
            color: 'white',
            border: 'none',
            padding: '10px 20px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <span>+</span> Add Credit Card
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '15px',
        marginBottom: '20px'
      }}>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid #3B82F6'
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Balance</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
            {formatCurrency(cards.reduce((sum, c) => sum + c.balance, 0))}
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid #10B981' 
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Credit Limit</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
            {formatCurrency(cards.reduce((sum, c) => sum + c.limit, 0))}
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid #F59E0B' 
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Overall Utilization</div>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>
            {cards.reduce((sum, c) => sum + c.limit, 0) > 0 
              ? ((Math.abs(cards.reduce((sum, c) => sum + c.balance, 0)) / cards.reduce((sum, c) => sum + c.limit, 0)) * 100).toFixed(1)
              : 0}%
          </div>
        </div>
      </div>

      {/* Cards Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))',
        gap: '20px'
      }}>
        {cards.map(card => {
          const stats = calculateCardStats(card);
          
          return (
            <div
              key={card.id}
              style={{
                background: 'linear-gradient(135deg, #1F2937 0%, #111827 100%)',
                borderRadius: '12px',
                padding: '20px',
                border: selectedCard === card.id ? '2px solid #3B82F6' : '1px solid #374151',
                cursor: 'pointer',
                transition: 'all 0.2s',
                position: 'relative'
              }}
              onClick={() => setSelectedCard(selectedCard === card.id ? null : card.id)}
            >
              {/* Edit Button */}
              <button
                onClick={(e) => handleEditClick(e, card)}
                style={{
                  position: 'absolute',
                  top: '10px',
                  right: '10px',
                  background: 'none',
                  border: 'none',
                  color: '#9CA3AF',
                  cursor: 'pointer',
                  fontSize: '16px',
                  padding: '5px'
                }}
                title="Edit Card"
              >
                ✏️
              </button>

              {/* Card Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px', marginRight: '30px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '18px' }}>{card.name}</h3>
                  <div style={{ color: '#9CA3AF', fontSize: '12px' }}>{card.institution}</div>
                </div>
                <div style={{
                  background: stats.utilizationColor,
                  padding: '4px 8px',
                  borderRadius: '4px',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}>
                  {stats.utilization.toFixed(1)}% utilized
                </div>
              </div>

              {/* Balance */}
              <div style={{ marginBottom: '15px' }}>
                <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Current Balance</div>
                <div style={{ fontSize: '24px', fontWeight: 'bold', color: card.balance < 0 ? '#EF4444' : '#10B981' }}>
                  {formatCurrency(card.balance)}
                </div>
                <div style={{ color: '#9CA3AF', fontSize: '12px' }}>
                  of {formatCurrency(card.limit)} limit
                </div>
              </div>

              {/* Progress Bar */}
              <div style={{
                width: '100%',
                height: '8px',
                background: '#374151',
                borderRadius: '4px',
                marginBottom: '15px',
                overflow: 'hidden'
              }}>
                <div style={{
                  width: `${stats.utilization}%`,
                  height: '100%',
                  background: stats.utilizationColor,
                  borderRadius: '4px'
                }} />
              </div>

              {/* Due Date */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px',
                padding: '10px',
                background: stats.isOverdue ? '#EF444420' : stats.isDueSoon ? '#F59E0B20' : '#111827',
                borderRadius: '6px'
              }}>
                <span>Due Date: {card.due_date ? new Date(card.due_date).toLocaleDateString() : 'Not set'}</span>
                <span style={{
                  color: stats.isOverdue ? '#EF4444' : stats.isDueSoon ? '#F59E0B' : '#10B981',
                  fontWeight: 'bold'
                }}>
                  {stats.isOverdue ? 'OVERDUE' : stats.daysUntilDue > 0 ? `${stats.daysUntilDue} days left` : 'Due today'}
                </span>
              </div>

              {/* Payment Info */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '10px',
                marginBottom: '15px'
              }}>
                <div>
                  <div style={{ color: '#9CA3AF', fontSize: '11px' }}>Min Payment</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatCurrency(stats.minPayment)}</div>
                </div>
                <div>
                  <div style={{ color: '#9CA3AF', fontSize: '11px' }}>Statement Balance</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{formatCurrency(stats.statementBalance)}</div>
                </div>
                <div>
                  <div style={{ color: '#9CA3AF', fontSize: '11px' }}>APR</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold' }}>{card.apr || 0}%</div>
                </div>
                <div>
                  <div style={{ color: '#9CA3AF', fontSize: '11px' }}>Interest/Month</div>
                  <div style={{ fontSize: '16px', fontWeight: 'bold', color: '#F59E0B' }}>
                    {formatCurrency(stats.interestIfNotPaid)}
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePayment(card.id);
                  }}
                  style={{
                    flex: 1,
                    background: '#3B82F6',
                    color: 'white',
                    border: 'none',
                    padding: '8px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Make Payment
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    // View transactions - could navigate to filtered transactions page
                  }}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: '1px solid #3B82F6',
                    color: '#3B82F6',
                    padding: '8px',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  View Transactions
                </button>
              </div>

              {/* Expanded Details */}
              {selectedCard === card.id && (
                <div style={{
                  marginTop: '15px',
                  paddingTop: '15px',
                  borderTop: '1px solid #374151'
                }}>
                  <h4 style={{ margin: '0 0 10px 0' }}>Payment Strategy</h4>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px'
                  }}>
                    <div style={{
                      background: '#111827',
                      padding: '10px',
                      borderRadius: '6px'
                    }}>
                      <div style={{ color: '#9CA3AF', fontSize: '11px' }}>Pay in Full By</div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                        {card.due_date ? new Date(card.due_date).toLocaleDateString() : 'Not set'}
                      </div>
                      <div style={{ fontSize: '12px', color: stats.statementBalance > 0 ? '#10B981' : '#9CA3AF' }}>
                        Save {formatCurrency(stats.interestIfNotPaid)} in interest
                      </div>
                    </div>
                    <div style={{
                      background: '#111827',
                      padding: '10px',
                      borderRadius: '6px'
                    }}>
                      <div style={{ color: '#9CA3AF', fontSize: '11px' }}>Payoff Time</div>
                      <div style={{ fontSize: '14px', fontWeight: 'bold' }}>
                        {Math.ceil(Math.abs(card.balance) / stats.minPayment)} months
                      </div>
                      <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                        with minimum payments
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Payment Modal */}
      {showPaymentModal && (
        <div style={{
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
        }}>
          <div style={{
            background: '#1F2937',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ marginTop: 0 }}>Make a Payment</h3>
            
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                Payment Amount
              </label>
              <input
                type="number"
                value={paymentAmount.amount}
                onChange={(e) => setPaymentAmount({...paymentAmount, amount: parseFloat(e.target.value)})}
                min={paymentAmount.minPayment}
                step="0.01"
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '4px',
                  fontSize: '16px'
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '5px' }}>
                <span style={{ color: '#9CA3AF', fontSize: '12px' }}>
                  Min: {formatCurrency(paymentAmount.minPayment)}
                </span>
                <span style={{ color: '#9CA3AF', fontSize: '12px' }}>
                  Full: {formatCurrency(paymentAmount.amount)}
                </span>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                From Account
              </label>
              <select
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '4px'
                }}
              >
                <option value="1">Chase Checking ($5,432.10)</option>
                <option value="2">Capital One Savings ($12,750.50)</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input type="checkbox" />
                <span>Schedule for due date</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={submitPayment}
                style={{
                  flex: 1,
                  background: '#10B981',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Submit Payment
              </button>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={{
                  flex: 1,
                  background: '#6B7280',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}