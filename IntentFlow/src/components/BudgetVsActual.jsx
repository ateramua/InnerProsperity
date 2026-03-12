import React, { useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function BudgetVsActual({ categories, transactions, categoryGroups }) {
  const [viewType, setViewType] = useState('category');
  const [selectedMonth, setSelectedMonth] = useState(new Date().toISOString().slice(0, 7));
  const [showVarianceOnly, setShowVarianceOnly] = useState(false);

  // Get available months from transactions
  const getAvailableMonths = () => {
    const months = new Set();
    transactions.forEach(t => {
      const month = t.date.slice(0, 7);
      months.add(month);
    });
    return Array.from(months).sort().reverse();
  };

  // Calculate budget vs actual for each category
  const calculateCategoryVariance = () => {
    const monthTransactions = transactions.filter(t => 
      t.date.startsWith(selectedMonth)
    );

    return categories.map(cat => {
      const actual = monthTransactions
        .filter(t => t.category_id === cat.id && t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      const budgeted = cat.assigned || 0;
      const variance = budgeted - actual;
      const variancePercent = budgeted > 0 ? (variance / budgeted) * 100 : 0;

      return {
        id: cat.id,
        name: cat.name,
        groupId: cat.category_group_id,
        groupName: categoryGroups[cat.category_group_id]?.name || 'Uncategorized',
        budgeted,
        actual,
        variance,
        variancePercent,
        status: variance >= 0 ? 'under' : 'over',
        color: variance >= 0 ? '#10B981' : '#EF4444'
      };
    }).filter(c => showVarianceOnly ? c.variance !== 0 : true);
  };

  // Calculate by category group
  const calculateGroupVariance = () => {
    const categoryData = calculateCategoryVariance();
    const groups = {};

    categoryData.forEach(cat => {
      if (!groups[cat.groupId]) {
        groups[cat.groupId] = {
          id: cat.groupId,
          name: cat.groupName,
          budgeted: 0,
          actual: 0,
          variance: 0,
          categories: []
        };
      }
      groups[cat.groupId].budgeted += cat.budgeted;
      groups[cat.groupId].actual += cat.actual;
      groups[cat.groupId].categories.push(cat);
    });

    Object.values(groups).forEach(group => {
      group.variance = group.budgeted - group.actual;
      group.variancePercent = group.budgeted > 0 ? (group.variance / group.budgeted) * 100 : 0;
      group.status = group.variance >= 0 ? 'under' : 'over';
      group.color = group.variance >= 0 ? '#10B981' : '#EF4444';
    });

    return Object.values(groups);
  };

  // Calculate monthly trends
  const calculateMonthlyTrends = () => {
    const months = getAvailableMonths().slice(0, 6);
    
    return months.map(month => {
      const monthTransactions = transactions.filter(t => t.date.startsWith(month));
      const totalBudgeted = categories.reduce((sum, cat) => sum + (cat.assigned || 0), 0);
      const totalActual = monthTransactions
        .filter(t => t.amount < 0)
        .reduce((sum, t) => sum + Math.abs(t.amount), 0);
      
      return {
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        budgeted: totalBudgeted,
        actual: totalActual,
        variance: totalBudgeted - totalActual
      };
    });
  };

  const categoryData = calculateCategoryVariance();
  const groupData = calculateGroupVariance();
  const monthlyData = calculateMonthlyTrends();

  const totalBudgeted = categoryData.reduce((sum, c) => sum + c.budgeted, 0);
  const totalActual = categoryData.reduce((sum, c) => sum + c.actual, 0);
  const totalVariance = totalBudgeted - totalActual;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(Math.abs(amount));
  };

  const formatPercent = (value) => {
    return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
  };

  const COLORS = {
    under: '#10B981',
    over: '#EF4444',
    budgeted: '#3B82F6',
    actual: '#F59E0B'
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
          <span>📊</span> Budget vs Actual
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            style={{
              background: '#1F2937',
              color: 'white',
              border: '1px solid #374151',
              padding: '8px 12px',
              borderRadius: '6px'
            }}
          >
            {getAvailableMonths().map(month => (
              <option key={month} value={month}>
                {new Date(month + '-01').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </option>
            ))}
          </select>
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
            <option value="category">By Category</option>
            <option value="group">By Category Group</option>
            <option value="trends">Monthly Trends</option>
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <input
              type="checkbox"
              checked={showVarianceOnly}
              onChange={(e) => setShowVarianceOnly(e.target.checked)}
            />
            <span style={{ fontSize: '14px', color: '#9CA3AF' }}>Show variance only</span>
          </label>
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
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Budgeted</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {formatCurrency(totalBudgeted)}
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid #F59E0B'
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Actual</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#F59E0B' }}>
            {formatCurrency(totalActual)}
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: `4px solid ${totalVariance >= 0 ? '#10B981' : '#EF4444'}`
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Variance</div>
          <div style={{ 
            fontSize: '24px', 
            fontWeight: 'bold',
            color: totalVariance >= 0 ? '#10B981' : '#EF4444'
          }}>
            {totalVariance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(totalVariance))}
          </div>
          <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
            {((totalVariance / totalBudgeted) * 100).toFixed(1)}% of budget
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
          {viewType === 'trends' ? (
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" tickFormatter={(value) => formatCurrency(value)} />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
              />
              <Legend />
              <Line type="monotone" dataKey="budgeted" stroke="#3B82F6" name="Budgeted" strokeWidth={2} />
              <Line type="monotone" dataKey="actual" stroke="#F59E0B" name="Actual" strokeWidth={2} />
            </LineChart>
          ) : (
            <BarChart 
              data={viewType === 'category' ? categoryData : groupData}
              layout="vertical"
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#9CA3AF" tickFormatter={(value) => formatCurrency(value)} />
              <YAxis type="category" dataKey="name" stroke="#9CA3AF" width={120} />
              <Tooltip 
                formatter={(value, name) => {
                  if (name === 'variance') return [formatCurrency(value), 'Variance'];
                  if (name === 'variancePercent') return [`${value.toFixed(1)}%`, 'Variance %'];
                  return [formatCurrency(value), name];
                }}
                contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
              />
              <Legend />
              <Bar dataKey="budgeted" fill="#3B82F6" name="Budgeted" />
              <Bar dataKey="actual" fill="#F59E0B" name="Actual" />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Detailed Table */}
      <div style={{
        background: '#1F2937',
        padding: '20px',
        borderRadius: '8px'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px' }}>
          {viewType === 'category' ? 'Category Details' : 
           viewType === 'group' ? 'Category Group Details' : 'Monthly Summary'}
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <th style={{ textAlign: 'left', padding: '10px', color: '#9CA3AF' }}>
                  {viewType === 'category' ? 'Category' : viewType === 'group' ? 'Group' : 'Month'}
                </th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Budgeted</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Actual</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Variance</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Variance %</th>
                <th style={{ textAlign: 'center', padding: '10px', color: '#9CA3AF' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {(viewType === 'category' ? categoryData : 
                viewType === 'group' ? groupData : monthlyData).map((item, index) => {
                const isOver = item.variance < 0;
                
                return (
                  <tr key={index} style={{ borderBottom: '1px solid #2d3748' }}>
                    <td style={{ padding: '10px' }}>{item.name || item.month}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      {formatCurrency(item.budgeted || 0)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#F59E0B' }}>
                      {formatCurrency(item.actual || 0)}
                    </td>
                    <td style={{ 
                      padding: '10px', 
                      textAlign: 'right',
                      color: item.variance >= 0 ? '#10B981' : '#EF4444',
                      fontWeight: 'bold'
                    }}>
                      {item.variance >= 0 ? '+' : '-'}{formatCurrency(Math.abs(item.variance || 0))}
                    </td>
                    <td style={{ 
                      padding: '10px', 
                      textAlign: 'right',
                      color: item.variancePercent >= 0 ? '#10B981' : '#EF4444'
                    }}>
                      {item.variancePercent > 0 ? '+' : ''}{item.variancePercent?.toFixed(1)}%
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <span style={{
                        background: isOver ? '#EF444420' : '#10B98120',
                        color: isOver ? '#EF4444' : '#10B981',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {isOver ? 'Over Budget' : 'Under Budget'}
                      </span>
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
