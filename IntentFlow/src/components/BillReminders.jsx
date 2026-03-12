import React, { useState, useEffect } from 'react';

export default function BillReminders({ bills: initialBills, categories, accounts, onAddBill, onPayBill }) {
  const [bills, setBills] = useState(initialBills || []);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [newBill, setNewBill] = useState({
    name: '',
    amount: '',
    due_date: '1',
    category_id: '',
    account_id: '',
    payee_id: '',
    auto_pay: false,
    reminder_days: 3,
    notes: ''
  });

  // Generate calendar days
  const getDaysInMonth = (month, year) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getMonthBills = () => {
    const daysInMonth = getDaysInMonth(selectedMonth, selectedYear);
    const monthBills = [];
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dayBills = bills.filter(b => b.due_date === day);
      if (dayBills.length > 0) {
        monthBills.push({
          day,
          bills: dayBills
        });
      }
    }
    
    return monthBills;
  };

  // Check for upcoming bills
  const getUpcomingBills = () => {
    const today = new Date();
    const currentDay = today.getDate();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();
    
    const upcoming = [];
    
    bills.forEach(bill => {
      let dueDate = new Date(currentYear, currentMonth, bill.due_date);
      
      // If bill already passed this month, show for next month
      if (dueDate < today) {
        dueDate = new Date(currentYear, currentMonth + 1, bill.due_date);
      }
      
      const daysUntil = Math.ceil((dueDate - today) / (1000 * 60 * 60 * 24));
      
      if (daysUntil <= bill.reminder_days && daysUntil > 0) {
        upcoming.push({
          ...bill,
          dueDate,
          daysUntil
        });
      }
    });
    
    return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  };

  const upcomingBills = getUpcomingBills();
  const monthBills = getMonthBills();

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const handleAddBill = (e) => {
    e.preventDefault();
    onAddBill(newBill);
    setShowAddForm(false);
    setNewBill({
      name: '',
      amount: '',
      due_date: '1',
      category_id: '',
      account_id: '',
      payee_id: '',
      auto_pay: false,
      reminder_days: 3,
      notes: ''
    });
  };

  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  return (
    <div style={{ padding: '20px', color: 'white' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px' 
      }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>🔔</span> Bill Reminders
        </h2>
        <button
          onClick={() => setShowAddForm(!showAddForm)}
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
          <span>+</span> Add Bill
        </button>
      </div>

      {/* Upcoming Bills Alert */}
      {upcomingBills.length > 0 && (
        <div style={{
          background: '#F59E0B20',
          border: '1px solid #F59E0B',
          borderRadius: '8px',
          padding: '15px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
            <span style={{ fontSize: '20px' }}>⚠️</span>
            <strong>Upcoming Bills</strong>
          </div>
          {upcomingBills.map(bill => (
            <div key={bill.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '10px',
              background: '#111827',
              borderRadius: '4px',
              marginBottom: '5px'
            }}>
              <div>
                <div><strong>{bill.name}</strong></div>
                <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                  Due in {bill.daysUntil} days ({bill.dueDate.toLocaleDateString()})
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                <span style={{ fontWeight: 'bold' }}>{formatCurrency(bill.amount)}</span>
                <button
                  onClick={() => onPayBill(bill)}
                  style={{
                    background: '#10B981',
                    color: 'white',
                    border: 'none',
                    padding: '5px 10px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '12px'
                  }}
                >
                  Pay Now
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Month Selector */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <button
          onClick={() => {
            if (selectedMonth === 0) {
              setSelectedMonth(11);
              setSelectedYear(selectedYear - 1);
            } else {
              setSelectedMonth(selectedMonth - 1);
            }
          }}
          style={{
            background: '#1F2937',
            border: '1px solid #374151',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          ←
        </button>
        <h3>{months[selectedMonth]} {selectedYear}</h3>
        <button
          onClick={() => {
            if (selectedMonth === 11) {
              setSelectedMonth(0);
              setSelectedYear(selectedYear + 1);
            } else {
              setSelectedMonth(selectedMonth + 1);
            }
          }}
          style={{
            background: '#1F2937',
            border: '1px solid #374151',
            color: 'white',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          →
        </button>
      </div>

      {/* Calendar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(7, 1fr)',
        gap: '5px',
        marginBottom: '20px'
      }}>
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} style={{
            textAlign: 'center',
            padding: '10px',
            background: '#1F2937',
            color: '#9CA3AF',
            fontSize: '12px',
            fontWeight: 'bold'
          }}>
            {day}
          </div>
        ))}
        
        {/* Calendar days */}
        {Array.from({ length: getDaysInMonth(selectedMonth, selectedYear) }, (_, i) => i + 1).map(day => {
          const date = new Date(selectedYear, selectedMonth, day);
          const dayOfWeek = date.getDay();
          const dayBills = bills.filter(b => b.due_date === day);
          const isToday = date.toDateString() === new Date().toDateString();
          
          return (
            <div
              key={day}
              style={{
                background: dayBills.length > 0 ? '#3B82F620' : '#1F2937',
                border: isToday ? '2px solid #3B82F6' : '1px solid #374151',
                borderRadius: '4px',
                padding: '10px',
                minHeight: '60px',
                position: 'relative',
                gridColumn: day === 1 ? dayOfWeek + 1 : 'auto'
              }}
            >
              <div style={{ 
                fontSize: '12px', 
                fontWeight: 'bold',
                color: isToday ? '#3B82F6' : 'white'
              }}>
                {day}
              </div>
              {dayBills.map(bill => (
                <div
                  key={bill.id}
                  style={{
                    fontSize: '10px',
                    background: '#3B82F6',
                    color: 'white',
                    padding: '2px 4px',
                    borderRadius: '2px',
                    marginTop: '2px',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis'
                  }}
                  title={`${bill.name}: ${formatCurrency(bill.amount)}`}
                  onClick={() => onPayBill(bill)}
                >
                  {bill.name}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Add Bill Form */}
      {showAddForm && (
        <div style={{
          background: '#1F2937',
          padding: '20px',
          borderRadius: '8px',
          border: '1px solid #3B82F6'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Add Recurring Bill</h3>
          <form onSubmit={handleAddBill} style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px'
          }}>
            <input
              type="text"
              placeholder="Bill Name"
              value={newBill.name}
              onChange={(e) => setNewBill({...newBill, name: e.target.value})}
              required
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            />
            <input
              type="number"
              placeholder="Amount"
              value={newBill.amount}
              onChange={(e) => setNewBill({...newBill, amount: e.target.value})}
              required
              step="0.01"
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            />
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                Due Date (day of month)
              </label>
              <input
                type="number"
                min="1"
                max="31"
                value={newBill.due_date}
                onChange={(e) => setNewBill({...newBill, due_date: parseInt(e.target.value)})}
                required
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
            <select
              value={newBill.category_id}
              onChange={(e) => setNewBill({...newBill, category_id: e.target.value})}
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            >
              <option value="">Select Category</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <select
              value={newBill.account_id}
              onChange={(e) => setNewBill({...newBill, account_id: e.target.value})}
              required
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            >
              <option value="">Payment Account</option>
              {accounts.filter(a => a.type !== 'credit').map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <div>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                Reminder (days before)
              </label>
              <input
                type="number"
                min="1"
                max="30"
                value={newBill.reminder_days}
                onChange={(e) => setNewBill({...newBill, reminder_days: parseInt(e.target.value)})}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label>
                <input
                  type="checkbox"
                  checked={newBill.auto_pay}
                  onChange={(e) => setNewBill({...newBill, auto_pay: e.target.checked})}
                />
                Auto-pay
              </label>
            </div>
            <textarea
              placeholder="Notes"
              value={newBill.notes}
              onChange={(e) => setNewBill({...newBill, notes: e.target.value})}
              style={{
                gridColumn: '1 / -1',
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
              rows="2"
            />
            <div style={{ display: 'flex', gap: '10px', gridColumn: '1 / -1' }}>
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
                Add Bill
              </button>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
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
      )}
    </div>
  );
}
