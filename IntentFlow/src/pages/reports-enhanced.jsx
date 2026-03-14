// src/renderer/pages/reports-enhanced.jsx
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  Legend, ResponsiveContainer, Sector
} from 'recharts';

export default function ReportsEnhancedPage() {
  const router = useRouter();
  const [selectedReport, setSelectedReport] = useState('spending');
  const [dateRange, setDateRange] = useState('month');
  const [activeIndex, setActiveIndex] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportFormat, setExportFormat] = useState('csv');

  // Real data structure - will come from database
  const [spendingData, setSpendingData] = useState([
    { name: 'Housing', value: 1500, color: '#3B82F6' },
    { name: 'Food', value: 850, color: '#EF4444' },
    { name: 'Transportation', value: 450, color: '#10B981' },
    { name: 'Entertainment', value: 320, color: '#F59E0B' },
    { name: 'Shopping', value: 580, color: '#8B5CF6' },
    { name: 'Utilities', value: 380, color: '#EC4899' },
    { name: 'Other', value: 200, color: '#6B7280' }
  ]);

  const [trendsData, setTrendsData] = useState([
    { month: 'Jan', income: 5200, expenses: 4100, savings: 1100 },
    { month: 'Feb', income: 5200, expenses: 4300, savings: 900 },
    { month: 'Mar', income: 5450, expenses: 4200, savings: 1250 },
    { month: 'Apr', income: 5200, expenses: 4500, savings: 700 },
    { month: 'May', income: 5200, expenses: 4400, savings: 800 },
    { month: 'Jun', income: 5800, expenses: 4300, savings: 1500 },
    { month: 'Jul', income: 5800, expenses: 4100, savings: 1700 },
    { month: 'Aug', income: 5200, expenses: 4800, savings: 400 },
    { month: 'Sep', income: 5450, expenses: 4300, savings: 1150 },
    { month: 'Oct', income: 5200, expenses: 4200, savings: 1000 },
    { month: 'Nov', income: 5200, expenses: 4900, savings: 300 },
    { month: 'Dec', income: 5800, expenses: 5200, savings: 600 }
  ]);

  const [dailyData, setDailyData] = useState([
    { day: 'Mon', amount: 145 },
    { day: 'Tue', amount: 232 },
    { day: 'Wed', amount: 187 },
    { day: 'Thu', amount: 298 },
    { day: 'Fri', amount: 345 },
    { day: 'Sat', amount: 423 },
    { day: 'Sun', amount: 267 }
  ]);

  const [categoryComparison, setCategoryComparison] = useState([
    { category: 'Housing', budgeted: 1500, actual: 1500, variance: 0 },
    { category: 'Food', budgeted: 900, actual: 850, variance: 50 },
    { category: 'Transportation', budgeted: 400, actual: 450, variance: -50 },
    { category: 'Entertainment', budgeted: 300, actual: 320, variance: -20 },
    { category: 'Shopping', budgeted: 500, actual: 580, variance: -80 },
    { category: 'Utilities', budgeted: 400, actual: 380, variance: 20 }
  ]);

  // Calculate totals
  const totalSpending = spendingData.reduce((sum, cat) => sum + cat.value, 0);
  const totalIncome = trendsData.reduce((sum, month) => sum + month.income, 0);
  const totalExpenses = trendsData.reduce((sum, month) => sum + month.expenses, 0);
  const totalSavings = trendsData.reduce((sum, month) => sum + month.savings, 0);
  const savingsRate = ((totalSavings / totalIncome) * 100).toFixed(1);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(amount);
  };

  // Custom Active Shape for Pie Chart
  const renderActiveShape = (props) => {
    const RADIAN = Math.PI / 180;
    const { cx, cy, midAngle, innerRadius, outerRadius, startAngle, endAngle, fill, payload, percent, value } = props;
    const sin = Math.sin(-RADIAN * midAngle);
    const cos = Math.cos(-RADIAN * midAngle);
    const sx = cx + (outerRadius + 10) * cos;
    const sy = cy + (outerRadius + 10) * sin;
    const mx = cx + (outerRadius + 30) * cos;
    const my = cy + (outerRadius + 30) * sin;
    const ex = mx + (cos >= 0 ? 1 : -1) * 22;
    const ey = my;
    const textAnchor = cos >= 0 ? 'start' : 'end';

    return (
      <g>
        <text x={cx} y={cy} dy={8} textAnchor="middle" fill="white">
          {payload.name}
        </text>
        <Sector
          cx={cx}
          cy={cy}
          innerRadius={innerRadius}
          outerRadius={outerRadius}
          startAngle={startAngle}
          endAngle={endAngle}
          fill={fill}
        />
        <Sector
          cx={cx}
          cy={cy}
          startAngle={startAngle}
          endAngle={endAngle}
          innerRadius={outerRadius + 6}
          outerRadius={outerRadius + 10}
          fill={fill}
        />
        <path d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`} stroke={fill} fill="none" />
        <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
        <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} textAnchor={textAnchor} fill="#fff">{`${formatCurrency(value)}`}</text>
        <text x={ex + (cos >= 0 ? 1 : -1) * 12} y={ey} dy={18} textAnchor={textAnchor} fill="#999">
          {`(${(percent * 100).toFixed(2)}%)`}
        </text>
      </g>
    );
  };

  const onPieEnter = (_, index) => {
    setActiveIndex(index);
  };

  // Export functions
  const exportToCSV = (data, filename) => {
    const headers = Object.keys(data[0]).join(',');
    const rows = data.map(row => Object.values(row).join(',')).join('\n');
    const csv = `${headers}\n${rows}`;
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.csv`;
    a.click();
  };

  const exportToPDF = () => {
    // This would use a library like jspdf or html2canvas
    alert('PDF export will be implemented with a library like jspdf');
  };

  const handleExport = () => {
    if (exportFormat === 'csv') {
      switch(selectedReport) {
        case 'spending':
          exportToCSV(spendingData, 'spending-by-category');
          break;
        case 'trends':
          exportToCSV(trendsData, 'monthly-trends');
          break;
        case 'comparison':
          exportToCSV(categoryComparison, 'budget-vs-actual');
          break;
      }
    } else {
      exportToPDF();
    }
    setShowExportModal(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
      color: 'white',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* Navigation Header - Same as before */}
      <header style={{
        background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
        padding: '1rem 1.5rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        {/* ... same navigation as before ... */}
      </header>

      {/* Main Content */}
      <main style={{ maxWidth: '1400px', margin: '0 auto', padding: '2rem 1.5rem' }}>
        {/* Page Header with Export */}
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '2rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}>
          <div>
            <h1 style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0 0 0.5rem 0' }}>
              📊 Reports & Analytics
            </h1>
            <p style={{ color: '#9CA3AF', margin: 0 }}>
              Visualize your financial data with interactive charts
            </p>
          </div>
          
          {/* Report Controls */}
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <select
              value={selectedReport}
              onChange={(e) => setSelectedReport(e.target.value)}
              style={{
                background: '#1F2937',
                color: 'white',
                border: '1px solid #374151',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              <option value="spending">Spending by Category</option>
              <option value="trends">Monthly Trends</option>
              <option value="daily">Daily Spending</option>
              <option value="comparison">Budget vs Actual</option>
            </select>
            
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              style={{
                background: '#1F2937',
                color: 'white',
                border: '1px solid #374151',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
                cursor: 'pointer'
              }}
            >
              <option value="week">This Week</option>
              <option value="month">This Month</option>
              <option value="quarter">Last 3 Months</option>
              <option value="year">Last 12 Months</option>
              <option value="all">All Time</option>
            </select>
            
            <button
              onClick={() => setShowExportModal(true)}
              style={{
                background: '#3B82F6',
                border: 'none',
                color: 'white',
                padding: '0.5rem 1rem',
                borderRadius: '0.5rem',
                cursor: 'pointer',
                fontSize: '0.875rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              📥 Export
            </button>
          </div>
        </div>

        {/* Export Modal */}
        {showExportModal && (
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
              borderRadius: '0.75rem',
              padding: '2rem',
              maxWidth: '400px',
              width: '90%'
            }}>
              <h3 style={{ fontSize: '1.25rem', margin: '0 0 1rem 0' }}>Export Report</h3>
              
              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#9CA3AF' }}>
                  Format
                </label>
                <select
                  value={exportFormat}
                  onChange={(e) => setExportFormat(e.target.value)}
                  style={{
                    background: '#111827',
                    border: '1px solid #374151',
                    color: 'white',
                    padding: '0.75rem',
                    borderRadius: '0.5rem',
                    width: '100%'
                  }}
                >
                  <option value="csv">CSV (Excel)</option>
                  <option value="pdf">PDF Document</option>
                  <option value="json">JSON Data</option>
                </select>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', color: '#9CA3AF' }}>
                  Include
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" defaultChecked /> Raw Data
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" defaultChecked /> Summary Statistics
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <input type="checkbox" defaultChecked /> Charts (PDF only)
                  </label>
                </div>
              </div>

              <div style={{ display: 'flex', gap: '1rem' }}>
                <button
                  onClick={handleExport}
                  style={{
                    background: '#3B82F6',
                    border: 'none',
                    color: 'white',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    flex: 1
                  }}
                >
                  Export
                </button>
                <button
                  onClick={() => setShowExportModal(false)}
                  style={{
                    background: 'none',
                    border: '1px solid #374151',
                    color: '#9CA3AF',
                    padding: '0.75rem 1.5rem',
                    borderRadius: '0.5rem',
                    cursor: 'pointer',
                    flex: 1
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Summary Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '1.5rem',
          marginBottom: '2rem'
        }}>
          <div style={{
            background: '#1F2937',
            padding: '1.5rem',
            borderRadius: '0.75rem'
          }}>
            <div style={{ color: '#9CA3AF', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Total Income</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#4ADE80' }}>
              {formatCurrency(totalIncome)}
            </div>
          </div>

          <div style={{
            background: '#1F2937',
            padding: '1.5rem',
            borderRadius: '0.75rem'
          }}>
            <div style={{ color: '#9CA3AF', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Total Expenses</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#F87171' }}>
              {formatCurrency(totalExpenses)}
            </div>
          </div>

          <div style={{
            background: '#1F2937',
            padding: '1.5rem',
            borderRadius: '0.75rem'
          }}>
            <div style={{ color: '#9CA3AF', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Total Savings</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#3B82F6' }}>
              {formatCurrency(totalSavings)}
            </div>
          </div>

          <div style={{
            background: '#1F2937',
            padding: '1.5rem',
            borderRadius: '0.75rem'
          }}>
            <div style={{ color: '#9CA3AF', fontSize: '0.875rem', marginBottom: '0.5rem' }}>Savings Rate</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#8B5CF6' }}>
              {savingsRate}%
            </div>
          </div>
        </div>

        {/* Main Chart Area */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '2fr 1fr',
          gap: '1.5rem',
          marginBottom: '1.5rem'
        }}>
          {/* Main Chart */}
          <div style={{
            background: '#1F2937',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            border: '1px solid #374151',
            height: '400px'
          }}>
            <h3 style={{ fontSize: '1.25rem', margin: '0 0 1rem 0' }}>
              {selectedReport === 'spending' && 'Spending by Category'}
              {selectedReport === 'trends' && 'Monthly Income vs Expenses'}
              {selectedReport === 'daily' && 'Daily Spending Pattern'}
              {selectedReport === 'comparison' && 'Budget vs Actual'}
            </h3>

            <ResponsiveContainer width="100%" height="85%">
              {selectedReport === 'spending' && (
                <PieChart>
                  <Pie
                    activeIndex={activeIndex}
                    activeShape={renderActiveShape}
                    data={spendingData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={80}
                    dataKey="value"
                    onMouseEnter={onPieEnter}
                  >
                    {spendingData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    formatter={(value) => formatCurrency(value)}
                    contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
                  />
                </PieChart>
              )}

              {selectedReport === 'trends' && (
                <BarChart data={trendsData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="month" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    formatter={(value) => formatCurrency(value)}
                    contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
                  />
                  <Legend />
                  <Bar dataKey="income" fill="#4ADE80" name="Income" />
                  <Bar dataKey="expenses" fill="#F87171" name="Expenses" />
                  <Bar dataKey="savings" fill="#3B82F6" name="Savings" />
                </BarChart>
              )}

              {selectedReport === 'daily' && (
                <AreaChart data={dailyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="day" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    formatter={(value) => formatCurrency(value)}
                    contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#8B5CF6" fill="#8B5CF680" />
                </AreaChart>
              )}

              {selectedReport === 'comparison' && (
                <BarChart data={categoryComparison}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="category" stroke="#9CA3AF" />
                  <YAxis stroke="#9CA3AF" tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    formatter={(value) => formatCurrency(value)}
                    contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
                  />
                  <Legend />
                  <Bar dataKey="budgeted" fill="#3B82F6" name="Budgeted" />
                  <Bar dataKey="actual" fill="#F59E0B" name="Actual" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* Insights Panel */}
          <div style={{
            background: '#1F2937',
            borderRadius: '0.75rem',
            padding: '1.5rem',
            border: '1px solid #374151'
          }}>
            <h3 style={{ fontSize: '1.25rem', margin: '0 0 1rem 0' }}>📈 Insights</h3>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Dynamic insights based on data */}
              {selectedReport === 'spending' && (
                <>
                  <div style={{
                    padding: '1rem',
                    background: '#111827',
                    borderRadius: '0.5rem'
                  }}>
                    <div style={{ color: '#F59E0B', fontSize: '1.5rem', marginBottom: '0.25rem' }}>
                      🍽️ {formatCurrency(spendingData.find(c => c.name === 'Food').value)}
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Food is your biggest expense</div>
                    <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '0.25rem' }}>
                      {((spendingData.find(c => c.name === 'Food').value / totalSpending) * 100).toFixed(1)}% of total spending
                    </div>
                  </div>

                  <div style={{
                    padding: '1rem',
                    background: '#111827',
                    borderRadius: '0.5rem'
                  }}>
                    <div style={{ color: '#10B981', fontSize: '1.5rem', marginBottom: '0.25rem' }}>
                      🏠 {formatCurrency(spendingData.find(c => c.name === 'Housing').value)}
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Housing costs are on target</div>
                    <div style={{ fontSize: '0.75rem', color: '#9CA3AF', marginTop: '0.25rem' }}>
                      Recommended: 25-35% of income
                    </div>
                  </div>
                </>
              )}

              {selectedReport === 'trends' && (
                <>
                  <div style={{
                    padding: '1rem',
                    background: '#111827',
                    borderRadius: '0.5rem'
                  }}>
                    <div style={{ color: '#4ADE80', fontSize: '1.5rem', marginBottom: '0.25rem' }}>
                      ↑ {((trendsData[trendsData.length-1].savings / trendsData[0].savings - 1) * 100).toFixed(0)}%
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Savings growth since Jan</div>
                  </div>

                  <div style={{
                    padding: '1rem',
                    background: '#111827',
                    borderRadius: '0.5rem'
                  }}>
                    <div style={{ color: '#F87171', fontSize: '1.5rem', marginBottom: '0.25rem' }}>
                      📉 {trendsData.reduce((max, month) => month.expenses > max ? month.expenses : max, 0)}
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Highest spending month</div>
                  </div>
                </>
              )}

              {selectedReport === 'daily' && (
                <>
                  <div style={{
                    padding: '1rem',
                    background: '#111827',
                    borderRadius: '0.5rem'
                  }}>
                    <div style={{ color: '#8B5CF6', fontSize: '1.5rem', marginBottom: '0.25rem' }}>
                      📅 {dailyData.reduce((max, day) => day.amount > max.amount ? day : max).day}
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Highest spending day</div>
                  </div>

                  <div style={{
                    padding: '1rem',
                    background: '#111827',
                    borderRadius: '0.5rem'
                  }}>
                    <div style={{ color: '#10B981', fontSize: '1.5rem', marginBottom: '0.25rem' }}>
                      ⚡ {((dailyData.find(d => d.day === 'Sat').amount / dailyData.find(d => d.day === 'Mon').amount - 1) * 100).toFixed(0)}%
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Weekend spending increase</div>
                  </div>
                </>
              )}

              {selectedReport === 'comparison' && (
                <>
                  <div style={{
                    padding: '1rem',
                    background: '#111827',
                    borderRadius: '0.5rem'
                  }}>
                    <div style={{ color: '#F59E0B', fontSize: '1.5rem', marginBottom: '0.25rem' }}>
                      🎯 {categoryComparison.filter(c => c.variance < 0).length} categories over budget
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Areas to watch</div>
                  </div>

                  <div style={{
                    padding: '1rem',
                    background: '#111827',
                    borderRadius: '0.5rem'
                  }}>
                    <div style={{ color: '#4ADE80', fontSize: '1.5rem', marginBottom: '0.25rem' }}>
                      💰 {formatCurrency(categoryComparison.reduce((sum, c) => sum + Math.max(0, c.variance), 0))}
                    </div>
                    <div style={{ fontSize: '0.875rem', fontWeight: '500' }}>Total under budget</div>
                  </div>
                </>
              )}

              {/* Recommendations */}
              <div style={{ marginTop: '1rem' }}>
                <h4 style={{ fontSize: '1rem', margin: '0 0 0.75rem 0' }}>💡 Recommendations</h4>
                <ul style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  color: '#9CA3AF',
                  fontSize: '0.875rem'
                }}>
                  {selectedReport === 'spending' && (
                    <>
                      <li style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                        <span style={{ color: '#4ADE80' }}>✓</span>
                        Set a dining out budget of $200/month
                      </li>
                      <li style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                        <span style={{ color: '#4ADE80' }}>✓</span>
                        Consider meal prepping to reduce food costs
                      </li>
                    </>
                  )}
                  
                  {selectedReport === 'trends' && (
                    <>
                      <li style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                        <span style={{ color: '#4ADE80' }}>✓</span>
                        Your savings rate is {savingsRate}% - try to reach 20%
                      </li>
                      <li style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                        <span style={{ color: '#4ADE80' }}>✓</span>
                        Set up automatic transfers on payday
                      </li>
                    </>
                  )}

                  {selectedReport === 'daily' && (
                    <>
                      <li style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                        <span style={{ color: '#4ADE80' }}>✓</span>
                        Plan activities for weekends to avoid impulse spending
                      </li>
                    </>
                  )}

                  {selectedReport === 'comparison' && (
                    <>
                      <li style={{ marginBottom: '0.5rem', display: 'flex', gap: '0.5rem' }}>
                        <span style={{ color: '#4ADE80' }}>✓</span>
                        Review {categoryComparison.filter(c => c.variance < 0).length} categories that are over budget
                      </li>
                    </>
                  )}
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* Data Table */}
        <div style={{
          background: '#1F2937',
          borderRadius: '0.75rem',
          padding: '1.5rem',
          border: '1px solid #374151'
        }}>
          <h3 style={{ fontSize: '1.25rem', margin: '0 0 1rem 0' }}>Detailed Data</h3>
          
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #374151' }}>
                  {selectedReport === 'spending' && (
                    <>
                      <th style={{ textAlign: 'left', padding: '0.75rem', color: '#9CA3AF' }}>Category</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', color: '#9CA3AF' }}>Amount</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', color: '#9CA3AF' }}>Percentage</th>
                    </>
                  )}
                  {selectedReport === 'trends' && (
                    <>
                      <th style={{ textAlign: 'left', padding: '0.75rem', color: '#9CA3AF' }}>Month</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', color: '#9CA3AF' }}>Income</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', color: '#9CA3AF' }}>Expenses</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', color: '#9CA3AF' }}>Savings</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', color: '#9CA3AF' }}>Savings Rate</th>
                    </>
                  )}
                  {selectedReport === 'daily' && (
                    <>
                      <th style={{ textAlign: 'left', padding: '0.75rem', color: '#9CA3AF' }}>Day</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', color: '#9CA3AF' }}>Amount</th>
                    </>
                  )}
                  {selectedReport === 'comparison' && (
                    <>
                      <th style={{ textAlign: 'left', padding: '0.75rem', color: '#9CA3AF' }}>Category</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', color: '#9CA3AF' }}>Budgeted</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', color: '#9CA3AF' }}>Actual</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', color: '#9CA3AF' }}>Variance</th>
                      <th style={{ textAlign: 'right', padding: '0.75rem', color: '#9CA3AF' }}>Status</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {selectedReport === 'spending' && spendingData.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #2d3748' }}>
                    <td style={{ padding: '0.75rem' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ width: '12px', height: '12px', background: item.color, borderRadius: '4px' }} />
                        {item.name}
                      </span>
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatCurrency(item.value)}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      {((item.value / totalSpending) * 100).toFixed(1)}%
                    </td>
                  </tr>
                ))}

                {selectedReport === 'trends' && trendsData.map((item, i) => {
                  const savingsRate = ((item.savings / item.income) * 100).toFixed(1);
                  return (
                    <tr key={i} style={{ borderBottom: '1px solid #2d3748' }}>
                      <td style={{ padding: '0.75rem' }}>{item.month}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#4ADE80' }}>{formatCurrency(item.income)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#F87171' }}>{formatCurrency(item.expenses)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right', color: '#3B82F6' }}>{formatCurrency(item.savings)}</td>
                      <td style={{ padding: '0.75rem', textAlign: 'right' }}>{savingsRate}%</td>
                    </tr>
                  );
                })}

                {selectedReport === 'daily' && dailyData.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #2d3748' }}>
                    <td style={{ padding: '0.75rem' }}>{item.day}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatCurrency(item.amount)}</td>
                  </tr>
                ))}

                {selectedReport === 'comparison' && categoryComparison.map((item, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #2d3748' }}>
                    <td style={{ padding: '0.75rem' }}>{item.category}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatCurrency(item.budgeted)}</td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>{formatCurrency(item.actual)}</td>
                    <td style={{ 
                      padding: '0.75rem', 
                      textAlign: 'right',
                      color: item.variance >= 0 ? '#4ADE80' : '#F87171'
                    }}>
                      {item.variance >= 0 ? '+' : ''}{formatCurrency(item.variance)}
                    </td>
                    <td style={{ padding: '0.75rem', textAlign: 'right' }}>
                      <span style={{
                        background: item.variance >= 0 ? '#10B98120' : '#F8717120',
                        color: item.variance >= 0 ? '#4ADE80' : '#F87171',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        fontSize: '0.75rem'
                      }}>
                        {item.variance >= 0 ? 'Under Budget' : 'Over Budget'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Back to Budget Link */}
        <div style={{ marginTop: '2rem', textAlign: 'center' }}>
          <Link href="/" passHref>
            <button style={{
              background: 'none',
              border: '1px solid #3B82F6',
              color: '#3B82F6',
              padding: '0.75rem 2rem',
              borderRadius: '0.5rem',
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => {
              e.target.style.background = '#3B82F6';
              e.target.style.color = 'white';
            }}
            onMouseLeave={(e) => {
              e.target.style.background = 'none';
              e.target.style.color = '#3B82F6';
            }}>
              ← Back to Budget
            </button>
          </Link>
        </div>
      </main>
    </div>
  );
}