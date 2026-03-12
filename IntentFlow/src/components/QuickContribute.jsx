import React, { useState } from 'react';

export default function QuickContribute({ goals, accounts, onContribute }) {
  const [showModal, setShowModal] = useState(false);
  const [selectedGoal, setSelectedGoal] = useState('');
  const [amount, setAmount] = useState('');
  const [selectedAccount, setSelectedAccount] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedGoal && amount && selectedAccount) {
      await onContribute(
        goals.find(g => g.id === parseInt(selectedGoal)),
        parseFloat(amount),
        parseInt(selectedAccount)
      );
      setShowModal(false);
      setSelectedGoal('');
      setAmount('');
      setSelectedAccount('');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  if (!goals.length) return null;

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        style={{
          background: '#10B981',
          color: 'white',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '6px',
          cursor: 'pointer',
          fontSize: '14px',
          fontWeight: 'bold',
          display: 'flex',
          alignItems: 'center',
          gap: '5px',
          marginLeft: '10px'
        }}
      >
        <span>🎯</span> Quick Contribute
      </button>

      {showModal && (
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
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>🎯 Quick Contribute to Goal</h3>
            
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                  Select Goal
                </label>
                <select
                  value={selectedGoal}
                  onChange={(e) => setSelectedGoal(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    background: '#111827',
                    border: '1px solid #374151',
                    color: 'white',
                    padding: '10px',
                    borderRadius: '4px'
                  }}
                >
                  <option value="">Choose a goal...</option>
                  {goals.map(g => (
                    <option key={g.id} value={g.id}>
                      {g.name} - {formatCurrency(g.current_amount)} / {formatCurrency(g.target_amount)}
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                  Amount
                </label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                  min="0.01"
                  step="0.01"
                  style={{
                    width: '100%',
                    background: '#111827',
                    border: '1px solid #374151',
                    color: 'white',
                    padding: '10px',
                    borderRadius: '4px'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                  From Account
                </label>
                <select
                  value={selectedAccount}
                  onChange={(e) => setSelectedAccount(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    background: '#111827',
                    border: '1px solid #374151',
                    color: 'white',
                    padding: '10px',
                    borderRadius: '4px'
                  }}
                >
                  <option value="">Select account...</option>
                  {accounts.filter(a => a.type !== 'credit').map(a => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatCurrency(a.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  type="submit"
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
                  Contribute
                </button>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
            </form>
          </div>
        </div>
      )}
    </>
  );
}
