import React, { useState } from 'react';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

export default function GoalReports({ goals, transactions }) {
  const [timeframe, setTimeframe] = useState('all');
  const [chartType, setChartType] = useState('progress');

  // Colors for charts
  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

  // Calculate goal statistics
  const goalStats = {
    total: goals.length,
    completed: goals.filter(g => g.current_amount >= g.target_amount).length,
    inProgress: goals.filter(g => g.current_amount < g.target_amount && g.current_amount > 0).length,
    notStarted: goals.filter(g => g.current_amount === 0).length,
    totalTarget: goals.reduce((sum, g) => sum + g.target_amount, 0),
    totalSaved: goals.reduce((sum, g) => sum + g.current_amount, 0),
    overallProgress: (goals.reduce((sum, g) => sum + g.current_amount, 0) / 
                     goals.reduce((sum, g) => sum + g.target_amount, 0)) * 100
  };

  // Progress by goal
  const progressData = goals.map(g => ({
    name: g.name.length > 15 ? g.name.substring(0, 12) + '...' : g.name,
    progress: (g.current_amount / g.target_amount) * 100,
    saved: g.current_amount,
    target: g.target_amount,
    remaining: g.target_amount - g.current_amount,
    fullName: g.name
  })).sort((a, b) => b.progress - a.progress);

  // Contribution history (mock data - in real app, this would come from goal_contributions table)
  const generateContributionHistory = () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const currentMonth = new Date().getMonth();
    
    return months.slice(0, currentMonth + 1).map((month, index) => {
      const data = { month };
      goals.forEach(goal => {
        // Mock data - in real app, sum actual contributions per month
        data[goal.name] = Math.random() * (goal.current_amount / (index + 1));
      });
      return data;
    });
  };

  const contributionData = generateContributionHistory();

  // Timeline projection for each goal
  const projectionData = goals.map(goal => {
    const remaining = goal.target_amount - goal.current_amount;
    const monthlyRate = 500; // This would come from actual savings rate
    const monthsToComplete = remaining > 0 ? Math.ceil(remaining / monthlyRate) : 0;
    
    const projection = [];
    for (let i = 0; i <= monthsToComplete; i++) {
      const month = new Date();
      month.setMonth(month.getMonth() + i);
      projection.push({
        month: month.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        amount: Math.min(goal.current_amount + (monthlyRate * i), goal.target_amount),
        target: goal.target_amount
      });
    }
    return { name: goal.name, data: projection };
  });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const formatPercent = (value) => {
    return `${value.toFixed(1)}%`;
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
          <span>📊</span> Goal Progress Reports
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            value={chartType}
            onChange={(e) => setChartType(e.target.value)}
            style={{
              background: '#1F2937',
              color: 'white',
              border: '1px solid #374151',
              padding: '8px 12px',
              borderRadius: '6px'
            }}
          >
            <option value="progress">Progress Overview</option>
            <option value="contributions">Contributions Over Time</option>
            <option value="projection">Projection</option>
            <option value="comparison">Goal Comparison</option>
          </select>
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
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Goals</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>{goalStats.total}</div>
          <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
            {goalStats.completed} completed • {goalStats.inProgress} in progress
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid #10B981' 
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Target</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {formatCurrency(goalStats.totalTarget)}
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid#F59E0B' 
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Total Saved</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#F59E0B' }}>
            {formatCurrency(goalStats.totalSaved)}
          </div>
        </div>
        <div style={{
          background: '#1F2937',
          padding: '15px',
          borderRadius: '8px',
          borderLeft: '4px solid #8B5CF6' 
        }}>
          <div style={{ color: '#9CA3AF', fontSize: '12px' }}>Overall Progress</div>
          <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
            {goalStats.overallProgress.toFixed(1)}%
          </div>
          <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
            {formatCurrency(goalStats.totalTarget - goalStats.totalSaved)} remaining
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
          {chartType === 'progress' && (
            <BarChart data={progressData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis type="number" stroke="#9CA3AF" tickFormatter={(value) => `${value}%`} />
              <YAxis type="category" dataKey="name" stroke="#9CA3AF" width={100} />
              <Tooltip 
                formatter={(value, name, props) => {
                  if (name === 'progress') return [`${value.toFixed(1)}%`, 'Progress'];
                  return [formatCurrency(value), name];
                }}
                labelFormatter={(label) => {
                  const goal = progressData.find(g => g.name === label);
                  return goal?.fullName || label;
                }}
                contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
              />
              <Bar dataKey="progress" fill="#3B82F6" name="Progress">
                {progressData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          )}

          {chartType === 'contributions' && (
            <LineChart data={contributionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" tickFormatter={(value) => formatCurrency(value)} />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
              />
              <Legend />
              {goals.map((goal, index) => (
                <Line 
                  key={goal.id}
                  type="monotone" 
                  dataKey={goal.name} 
                  stroke={COLORS[index % COLORS.length]} 
                  name={goal.name}
                  dot={false}
                />
              ))}
            </LineChart>
          )}

          {chartType === 'projection' && projectionData.length > 0 && (
            <LineChart data={projectionData[0].data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="month" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" tickFormatter={(value) => formatCurrency(value)} />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
              />
              <Legend />
              {projectionData.map((goal, index) => (
                <Line 
                  key={index}
                  type="monotone" 
                  dataKey="amount" 
                  data={goal.data}
                  stroke={COLORS[index % COLORS.length]} 
                  name={goal.name}
                  dot={false}
                />
              ))}
              <Line 
                type="monotone" 
                dataKey="target" 
                stroke="#EF4444" 
                strokeDasharray="5 5"
                name="Target"
                dot={false}
              />
            </LineChart>
          )}

          {chartType === 'comparison' && (
            <BarChart data={progressData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
              <XAxis dataKey="name" stroke="#9CA3AF" />
              <YAxis stroke="#9CA3AF" tickFormatter={(value) => formatCurrency(value)} />
              <Tooltip 
                formatter={(value) => formatCurrency(value)}
                contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
              />
              <Legend />
              <Bar dataKey="saved" fill="#3B82F6" name="Saved" />
              <Bar dataKey="target" fill="#EF4444" name="Target" />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Goal Breakdown Table */}
      <div style={{
        background: '#1F2937',
        padding: '20px',
        borderRadius: '8px'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Goal Details</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <th style={{ textAlign: 'left', padding: '10px', color: '#9CA3AF' }}>Goal</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Target</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Saved</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Remaining</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Progress</th>
                <th style={{ textAlign: 'center', padding: '10px', color: '#9CA3AF' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {goals.map(goal => {
                const progress = (goal.current_amount / goal.target_amount) * 100;
                const remaining = goal.target_amount - goal.current_amount;
                let status = 'In Progress';
                let statusColor = '#3B82F6';
                
                if (progress >= 100) {
                  status = 'Completed';
                  statusColor = '#10B981';
                } else if (progress === 0) {
                  status = 'Not Started';
                  statusColor = '#6B7280';
                }
                
                return (
                  <tr key={goal.id} style={{ borderBottom: '1px solid #2d3748' }}>
                    <td style={{ padding: '10px' }}>{goal.name}</td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>{formatCurrency(goal.target_amount)}</td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#F59E0B' }}>
                      {formatCurrency(goal.current_amount)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right', color: '#EF4444' }}>
                      {formatCurrency(remaining)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '10px' }}>
                        <span>{progress.toFixed(1)}%</span>
                        <div style={{
                          width: '60px',
                          height: '6px',
                          background: '#374151',
                          borderRadius: '3px',
                          overflow: 'hidden'
                        }}>
                          <div style={{
                            width: `${Math.min(progress, 100)}%`,
                            height: '100%',
                            background: statusColor,
                            borderRadius: '3px'
                          }} />
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px', textAlign: 'center' }}>
                      <span style={{
                        background: `${statusColor}20`,
                        color: statusColor,
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        fontWeight: 'bold'
                      }}>
                        {status}
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
