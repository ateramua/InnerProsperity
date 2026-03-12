import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function InvestmentPortfolio({ investments: initialInvestments, accounts }) {
  const [investments, setInvestments] = useState(initialInvestments || []);
  const [selectedInvestment, setSelectedInvestment] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewType, setViewType] = useState('portfolio');
  const [newInvestment, setNewInvestment] = useState({
    symbol: '',
    name: '',
    type: 'stock',
    shares: '',
    purchase_price: '',
    current_price: '',
    purchase_date: new Date().toISOString().split('T')[0],
    account_id: '',
    notes: ''
  });

  // Calculate portfolio metrics
  const calculateMetrics = () => {
    let totalCost = 0;
    let totalValue = 0;
    let totalGain = 0;

    investments.forEach(inv => {
      const cost = inv.shares * inv.purchase_price;
      const value = inv.shares * (inv.current_price || inv.purchase_price);
      totalCost += cost;
      totalValue += value;
    });

    totalGain = totalValue - totalCost;
    const gainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;

    return {
      totalCost,
      totalValue,
      totalGain,
      gainPercent
    };
  };

  // Group by type for pie chart
  const getTypeAllocation = () => {
    const types = {};
    investments.forEach(inv => {
      const value = inv.shares * (inv.current_price || inv.purchase_price);
      if (!types[inv.type]) {
        types[inv.type] = 0;
      }
      types[inv.type] += value;
    });

    return Object.entries(types).map(([name, value]) => ({
      name: name.toUpperCase(),
      value
    }));
  };

  // Generate performance data (mock - would come from price_history in real app)
  const getPerformanceData = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    
    return months.slice(0, currentMonth + 1).map((month, index) => {
      const data = { month };
      investments.forEach(inv => {
        // Mock price changes - in real app, this would be actual historical data
        const basePrice = inv.purchase_price;
        const mockPrice = basePrice * (1 + (Math.random() * 0.2 - 0.1));
        data[inv.symbol] = inv.shares * mockPrice;
      });
      return data;
    });
  };

  const metrics = calculateMetrics();
  const typeAllocation = getTypeAllocation();
  const performanceData = getPerformanceData();

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const handleAddInvestment = (e) => {
    e.preventDefault();
    const investment = {
      id: investments.length + 1,
      ...newInvestment,
      shares: parseFloat(newInvestment.shares),
      purchase_price: parseFloat(newInvestment.purchase_price),
      current_price: parseFloat(newInvestment.current_price) || parseFloat(newInvestment.purchase_price)
    };
    setInvestments([...investments, investment]);
    setShowAddForm(false);
    setNewInvestment({
      symbol: '',
      name: '',
      type: 'stock',
      shares: '',
      purchase_price: '',
      current_price: '',
      purchase_date: new Date().toISOString().split('T')[0],
      account_id: '',
      notes: ''
    });
  };

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
          <span>📈</span> Investment Portfolio
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            value={viewType}
            onChange={(e) => setViewType(e.target.value)}
            style={{
              background: '#1F2937',
              color: 'white',
              border: '1px solid #374151',
              padding: '8px 12px',
              borderRadius: '6px'
            }}
          >
            <option value="portfolio">Portfolio View</option>
            <option value="performance">Performance</option>
            <option value="allocation">Allocation</option>
          </select>
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
            <span>+</span> Add Investment
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px',
        marginBottom: '25px'
      }}>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid #3B82F6'
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Cost</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {formatCurrency(metrics.totalCost)}
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid #10B981'
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Current Value</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>
            {formatCurrency(metrics.totalValue)}
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: `4px solid ${metrics.totalGain >= 0 ? '#10B981' : '#EF4444'}`
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Gain/Loss</div>
          <div style={{ 
            fontSize: '24px', 
            fontWeight: 'bold',
            color: metrics.totalGain >= 0 ? '#10B981' : '#EF4444'
          }}>
            {metrics.totalGain >= 0 ? '+' : '-'}{formatCurrency(Math.abs(metrics.totalGain))}
          </div>
          <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
            {formatPercent(metrics.gainPercent)}
          </div>
        </div>
      </div>

      {/* Main Chart */}
      <div style={{
        background: '#1F2937',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px',
        height: '400px'
      }}>
        <ResponsiveContainer width="100%" height="100%">
          {viewType === 'portfolio' && (
            <BarChart data={investments}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="symbol" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" tickFormatter={(value) => formatCurrency(value)} />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
              />
              <Legend />
              <Bar dataKey="shares * purchase_price" fill="#3B82F6" name="Cost" />
              <Bar dataKey="shares * current_price" fill="#10B981" name="Current Value" />
            </BarChart>
          )}

          {viewType === 'performance' && (
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" tickFormatter={(value) => formatCurrency(value)} />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
              />
              <Legend />
              {investments.map((inv, index) => (
                <Line 
                  key={inv.id}
                  type="monotone" 
                  dataKey={inv.symbol} 
                  stroke={COLORS[index % COLORS.length]} 
                  name={inv.symbol}
                  dot={false}
                />
              ))}
            </LineChart>
          )}

          {viewType === 'allocation' && (
            <PieChart>
              <Pie
                data={typeAllocation}
                cx="50%"
                cy="50%"
                labelLine={true}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={150}
                fill="#8884d8"
                dataKey="value"
              >
                {typeAllocation.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
              />
            </PieChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Add Investment Form */}
      {showAddForm && (
        <div style={{
          background: '#1F2937',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #3B82F6'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Add Investment</h3>
          <form onSubmit={handleAddInvestment} style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px'
          }}>
            <input
              type="text"
              placeholder="Symbol (e.g., AAPL)"
              value={newInvestment.symbol}
              onChange={(e) => setNewInvestment({...newInvestment, symbol: e.target.value.toUpperCase()})}
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
              type="text"
              placeholder="Company Name"
              value={newInvestment.name}
              onChange={(e) => setNewInvestment({...newInvestment, name: e.target.value})}
              required
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            />
            <select
              value={newInvestment.type}
              onChange={(e) => setNewInvestment({...newInvestment, type: e.target.value})}
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            >
              <option value="stock">Stock</option>
              <option value="etf">ETF</option>
              <option value="mutual_fund">Mutual Fund</option>
              <option value="bond">Bond</option>
              <option value="crypto">Cryptocurrency</option>
            </select>
            <input
              type="number"
              placeholder="Shares"
              value={newInvestment.shares}
              onChange={(e) => setNewInvestment({...newInvestment, shares: e.target.value})}
              required
              step="0.0001"
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
              placeholder="Purchase Price"
              value={newInvestment.purchase_price}
              onChange={(e) => setNewInvestment({...newInvestment, purchase_price: e.target.value})}
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
            <input
              type="number"
              placeholder="Current Price (optional)"
              value={newInvestment.current_price}
              onChange={(e) => setNewInvestment({...newInvestment, current_price: e.target.value})}
              step="0.01"
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            />
            <input
              type="date"
              value={newInvestment.purchase_date}
              onChange={(e) => setNewInvestment({...newInvestment, purchase_date: e.target.value})}
              required
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            />
            <select
              value={newInvestment.account_id}
              onChange={(e) => setNewInvestment({...newInvestment, account_id: e.target.value})}
              required
              style={{
                background: '#111827',
                border: '1px solid #374151',
                color: 'white',
                padding: '10px',
                borderRadius: '4px'
              }}
            >
              <option value="">Select Account</option>
              {accounts.filter(a => a.type === 'investment' || a.type === 'savings').map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
            <textarea
              placeholder="Notes"
              value={newInvestment.notes}
              onChange={(e) => setNewInvestment({...newInvestment, notes: e.target.value})}
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
                Add Investment
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

      {/* Investments Table */}
      <div style={{
        background: '#1F2937',
        padding: '20px',
        borderRadius: '8px'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Holdings</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <th style={{ textAlign: 'left', padding: '10px', color: '#9CA3AF' }}>Symbol</th>
                <th style={{ textAlign: 'left', padding: '10px', color: '#9CA3AF' }}>Name</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Shares</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Purchase Price</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Current Price</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Cost</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Value</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Gain/Loss</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Return</th>
              </tr>
            </thead>
            <tbody>
              {investments.map(inv => {
                const cost = inv.shares * inv.purchase_price;
                const value = inv.shares * (inv.current_price || inv.purchase_price);
                const gain = value - cost;
                const gainPercent = cost > 0 ? (gain / cost) * 100 : 0;

                return (
                  <tr key={inv.id} style={{ borderBottom: '1px solid #2d3748' }}>
                    <td style={{ padding: '10px', fontWeight: 'bold' }}>{inv.symbol}</td>
                    <td style={{ padding: '10px' }}>{inv.name}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{inv.shares}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{formatCurrency(inv.purchase_price)}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      {inv.current_price ? formatCurrency(inv.current_price) : '-'}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{formatCurrency(cost)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#10B981' }}>
                      {formatCurrency(value)}
                    </td>
                    <td style={{ 
                      padding: '10px', 
                      textAlign: 'right',
                      color: gain >= 0 ? '#10B981' : '#EF4444',
                      fontWeight: 'bold'
                    }}>
                      {gain >= 0 ? '+' : '-'}{formatCurrency(Math.abs(gain))}
                    </td>
                    <td style={{ 
                      padding: '10px', 
                      textAlign: 'right',
                      color: gainPercent >= 0 ? '#10B981' : '#EF4444'
                    }}>
                      {formatPercent(gainPercent)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
