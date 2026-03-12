import React, { useState, useEffect } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';

export default function ReportsDashboard({ transactions, categories, accounts }) {
  const [dateRange, setDateRange] = useState('month');
  const [reportType, setReportType] = useState('spending');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Colors for charts
  const COLORS = ['#3B82F6', '#EF4444', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

  // Filter transactions by date range
  const getFilteredTransactions = () => {
    const now = new Date();
    let startDate = new Date();
    
    switch(dateRange) {
      case 'week':
        startDate.setDate(now.getDate() - 7);
        break;
      case 'month':
        startDate.setMonth(now.getMonth() - 1);
        break;
      case 'quarter':
        startDate.setMonth(now.getMonth() - 3);
        break;
      case 'year':
        startDate.setFullYear(now.getFullYear() - 1);
        break;
      case 'custom':
        if (customStartDate && customEndDate) {
          return transactions.filter(t => 
            t.date >= customStartDate && t.date <= customEndDate
          );
        }
        return transactions;
      default:
        startDate.setMonth(now.getMonth() - 1);
    }
    
    return transactions.filter(t => new Date(t.date) >= startDate);
  };

  const filteredTransactions = getFilteredTransactions();

  // Calculate summary statistics
  const summary = {
    income: filteredTransactions.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0),
    expenses: filteredTransactions.filter(t => t.amount < 0).reduce((sum, t) => sum + Math.abs(t.amount), 0),
    transactionCount: filteredTransactions.length,
    avgTransaction: filteredTransactions.length > 0 
      ? filteredTransactions.reduce((sum, t) => sum + Math.abs(t.amount), 0) / filteredTransactions.length 
      : 0
  };

  // Spending by Category
  const spendingByCategory = categories
    .map(cat => {
      const total = filteredTransactions
        .filter(t => t.category_id === cat.id && t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      return {
        name: cat.name,
        value: total,
        category_type: cat.category_type
      };
    })
    .filter(c => c.value > 0)
    .sort((a, b) => b.value - a.value);

  // Income vs Expenses Over Time (by month)
  const monthlyData = {};
  filteredTransactions.forEach(t => {
    const month = t.date.slice(0, 7); // YYYY-MM format
    if (!monthlyData[month]) {
      monthlyData[month] = { month, income: 0, expenses: 0, net: 0 };
    }
    if (t.amount > 0) {
      monthlyData[month].income += t.amount;
    } else {
      monthlyData[month].expenses += Math.abs(t.amount);
    }
    monthlyData[month].net = monthlyData[month].income - monthlyData[month].expenses;
  });

  const timeSeriesData = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));

  // Daily spending trend
  const dailyData = {};
  filteredTransactions.forEach(t => {
    if (t.amount < 0) {
      if (!dailyData[t.date]) {
        dailyData[t.date] = { date: t.date, amount: 0 };
      }
      dailyData[t.date].amount += Math.abs(t.amount);
    }
  });

  const dailySpendingData = Object.values(dailyData)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-30); // Last 30 days

  // Top payees
  const payeeSpending = {};
  filteredTransactions.forEach(t => {
    if (t.amount < 0) {
      if (!payeeSpending[t.payee_name]) {
        payeeSpending[t.payee_name] = { name: t.payee_name, amount: 0, count: 0 };
      }
      payeeSpending[t.payee_name].amount += Math.abs(t.amount);
      payeeSpending[t.payee_name].count++;
    }
  });

  const topPayees = Object.values(payeeSpending)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, 10);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div style={{ padding: '20px', color: 'white' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>📊 Reports & Analytics</h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value)}
            style={{
              background: '#1F2937',
              color: 'white',
              border: '1px solid #374151',
              padding: '8px 12px',
              borderRadius: '6px'
            }}
          >
            <option value="spending">Spending by Category</option>
            <option value="trends">Income vs Expenses</option>
            <option value="daily">Daily Spending</option>
            <option value="payees">Top Payees</option>
          </select>
          
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            style={{
              background: '#1F2937',
              color: 'white',
              border: '1px solid #374151',
              padding: '8px 12px',
              borderRadius: '6px'
            }}
          >
            <option value="week">Last 7 Days</option>
            <option value="month">Last 30 Days</option>
            <option value="quarter">Last 3 Months</option>
            <option value="year">Last 12 Months</option>
            <option value="custom">Custom Range</option>
          </select>
        </div>
      </div>

      {/* Custom Date Range */}
      {dateRange === 'custom' && (
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          marginBottom: '20px',
          display: 'flex',
          gap: '10px',
          alignItems: 'center'
        }}>
          <input
            type="date"
            value={customStartDate}
            onChange={(e) => setCustomStartDate(e.target.value)}
            style={{
              background: '#111827',
              border: '1px solid #374151',
              color: 'white',
              padding: '8px',
              borderRadius: '4px'
            }}
          />
          <span>to</span>
          <input
            type="date"
            value={customEndDate}
            onChange={(e) => setCustomEndDate(e.target.value)}
            style={{
              background: '#111827',
              border: '1px solid #374151',
              color: 'white',
              padding: '8px',
              borderRadius: '4px'
            }}
          />
        </div>
      )}

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '15px',
        marginBottom: '30px'
      }}>
        <div style={{
          background: '#1F2937',
          padding: '20px',
          borderRadius: '8px',
          borderLeft: '4px solid #10B981'
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Income</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#10B981' }}>
            {formatCurrency(summary.income)}
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '20px',
          borderRadius: '8px',
          borderLeft: '4px solid #EF4444'
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Expenses</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#EF4444' }}>
            {formatCurrency(summary.expenses)}
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '20px',
          borderRadius: '8px',
          borderLeft: '4px solid #3B82F6' 
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Net Savings</div>
          <div style={{ 
            fontSize: '24px', 
            fontWeight: 'bold',
            color: summary.income - summary.expenses >= 0 ? '#10B981' : '#EF4444'
          }}>
            {formatCurrency(summary.income - summary.expenses)}
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '20px',
          borderRadius: '8px',
          borderLeft: '4px solid#8B5CF6' 
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Avg Transaction</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {formatCurrency(summary.avgTransaction)}
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
          {reportType === 'spending' && (
            <PieChart>
              <Pie
                data={spendingByCategory}
                cx="50%"
                cy="50%"
                labelLine={true}
                label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                outerRadius={150}
                fill="#8884d8"
                dataKey="value"
              >
                {spendingByCategory.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
              />
            </PieChart>
          )}

          {reportType === 'trends' && (
            <BarChart data={timeSeriesData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" tickFormatter={(value) => `$${value}`} />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
              />
              <Legend />
              <Bar dataKey="income" fill="#10B981" name="Income" />
              <Bar dataKey="expenses" fill="#EF4444" name="Expenses" />
            </BarChart>
          )}

          {reportType === 'daily' && (
            <AreaChart data={dailySpendingData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="date" stroke="#9CA3AF" tickFormatter={formatDate} />
              <YAxis stroke="#9CA3AF" tickFormatter={(value) => `$${value}`} />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                labelFormatter={formatDate}
                contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
              />
              <Area type="monotone" dataKey="amount" stroke="#8B5CF6" fill="#8B5CF680" name="Spending" />
            </AreaChart>
          )}

          {reportType === 'payees' && (
            <BarChart data={topPayees} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#9CA3AF" tickFormatter={(value) => `$${value}`} />
              <YAxis type="category" dataKey="name" stroke="#9CA3AF" width={100} />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
              />
              <Bar dataKey="amount" fill="#3B82F6" name="Total Spent" />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Insights Section */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '2fr 1fr',
        gap: '20px'
      }}>
        {/* Top Categories Table */}
        <div style={{
          background: '#1F2937',
          padding: '20px',
          borderRadius: '8px'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Top Spending Categories</h3>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <th style={{ textAlign: 'left', padding: '10px', color: '#9CA3AF' }}>Category</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Amount</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>% of Total</th>
              </tr>
            </thead>
            <tbody>
              {spendingByCategory.slice(0, 5).map(cat => (
                <tr key={cat.name} style={{ borderBottom: '1px solid #2d3748' }}>
                  <td style={{ padding: '10px' }}>{cat.name}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#EF4444' }}>
                    {formatCurrency(cat.value)}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    {((cat.value / summary.expenses) * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Insights */}
        <div style={{
          background: '#1F2937',
          padding: '20px',
          borderRadius: '8px'
        }}>
          <h3 style={{ marginTop: 0, marginBottom: '15px' }}>💡 Insights</h3>
          
          {spendingByCategory.length > 0 && (
            <div style={{
              background: '#111827',
              padding: '15px',
              borderRadius: '6px',
              marginBottom: '10px'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px' }}>
                Highest Spending Category
              </div>
              <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#EF4444' }}>
                {spendingByCategory[0]?.name}
              </div>
              <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                {formatCurrency(spendingByCategory[0]?.value)} ({((spendingByCategory[0]?.value / summary.expenses) * 100).toFixed(1)}% of total)
              </div>
            </div>
          )}

          <div style={{
            background: '#111827',
            padding: '15px',
            borderRadius: '6px',
            marginBottom: '10px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px' }}>
              Average Daily Spending
            </div>
            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
              {formatCurrency(summary.expenses / (dailySpendingData.length || 1))}
            </div>
          </div>

          <div style={{
            background: '#111827',
            padding: '15px',
            borderRadius: '6px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '5px' }}>
              Savings Rate
            </div>
            <div style={{ fontSize: '18px', fontWeight: 'bold', color: summary.income > 0 ? '#10B981' : '#9CA3AF' }}>
              {summary.income > 0 ? ((summary.income - summary.expenses) / summary.income * 100).toFixed(1) : 0}%
            </div>
            <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
              {formatCurrency(summary.income - summary.expenses)} saved
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
