// src/pages/mobile-reports.jsx
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import AddTransactionModal from '../components/mobile/AddTransactionModal';
import DatabaseProxy from '../services/databaseProxy.mjs';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area
} from 'recharts';

export default function MobileReports() {
  const [activeTab, setActiveTab] = useState('spending');
  const [timeRange, setTimeRange] = useState('month'); // 'week', 'month', 'year'
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    loadReportData();
  }, []);

  const loadReportData = async () => {
    setIsLoading(true);
    try {
      // Load transactions
 const transactionsResult = await DatabaseProxy.getTransactions(user?.id);
      if (transactionsResult?.success) {
        setTransactions(transactionsResult.data || []);
      }

      // Load categories
    const categoriesResult = await DatabaseProxy.getCategories(user?.id);
      if (categoriesResult?.success) {
        setCategories(categoriesResult.data || []);
      }

      // Load accounts for transaction modal
  const accountsResult = await DatabaseProxy.getAccounts(user?.id);
      if (accountsResult?.success) {
        setAccounts(accountsResult.data || []);
      }
    } catch (error) {
      console.error('Error loading report data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTransaction = async (transactionData) => {
    try {
  const result = await DatabaseProxy.addTransaction(transactionData);
      if (result?.success) {
        await loadReportData(); // Refresh data
      }
    } catch (error) {
      console.error('Error adding transaction:', error);
      throw error;
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const formatCompact = (amount) => {
    if (amount >= 1000000) return `$${(amount / 1000000).toFixed(1)}M`;
    if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}K`;
    return `$${amount.toFixed(0)}`;
  };

  // Filter transactions by time range
  const getFilteredTransactions = () => {
    const now = new Date();
    const cutoff = new Date();
    
    switch (timeRange) {
      case 'week':
        cutoff.setDate(now.getDate() - 7);
        break;
      case 'month':
        cutoff.setMonth(now.getMonth() - 1);
        break;
      case 'year':
        cutoff.setFullYear(now.getFullYear() - 1);
        break;
    }
    
    return transactions.filter(t => new Date(t.date) >= cutoff && t.amount < 0);
  };

  // Spending by category for pie chart
  const getSpendingByCategory = () => {
    const filtered = getFilteredTransactions();
    const categoryMap = new Map();
    
    filtered.forEach(t => {
      const categoryName = t.category || 'Uncategorized';
      const amount = Math.abs(t.amount);
      categoryMap.set(categoryName, (categoryMap.get(categoryName) || 0) + amount);
    });
    
    return Array.from(categoryMap.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8); // Top 8 categories
  };

  // Daily spending for line chart (last 30 days)
  const getDailySpending = () => {
    const now = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(now.getDate() - 30);
    
    const dailyMap = new Map();
    
    // Initialize all days with 0
    for (let i = 0; i < 30; i++) {
      const date = new Date(thirtyDaysAgo);
      date.setDate(thirtyDaysAgo.getDate() + i);
      const dateStr = date.toISOString().split('T')[0];
      dailyMap.set(dateStr, { date: dateStr, amount: 0, day: date.getDate() });
    }
    
    // Fill with actual spending
    transactions.forEach(t => {
      if (t.amount < 0 && new Date(t.date) >= thirtyDaysAgo) {
        const dateStr = t.date.split('T')[0];
        if (dailyMap.has(dateStr)) {
          const entry = dailyMap.get(dateStr);
          entry.amount += Math.abs(t.amount);
        }
      }
    });
    
    return Array.from(dailyMap.values()).slice(-14); // Last 14 days
  };

  // Monthly spending for bar chart
  const getMonthlySpending = () => {
    const now = new Date();
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(now.getMonth() - 6);
    
    const monthlyMap = new Map();
    
    // Initialize months
    for (let i = 0; i < 6; i++) {
      const date = new Date(sixMonthsAgo);
      date.setMonth(sixMonthsAgo.getMonth() + i);
      const monthStr = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
      monthlyMap.set(monthStr, { 
        month: monthStr, 
        spending: 0,
        income: 0,
        savings: 0
      });
    }
    
    // Fill with actual data
    transactions.forEach(t => {
      const tDate = new Date(t.date);
      if (tDate >= sixMonthsAgo) {
        const monthStr = tDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        if (monthlyMap.has(monthStr)) {
          const entry = monthlyMap.get(monthStr);
          if (t.amount > 0) {
            entry.income += t.amount;
          } else {
            entry.spending += Math.abs(t.amount);
          }
          entry.savings = entry.income - entry.spending;
        }
      }
    });
    
    return Array.from(monthlyMap.values());
  };

  // Spending by day of week
  const getSpendingByDayOfWeek = () => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const dayMap = new Map(days.map(day => [day, 0]));
    let total = 0;
    
    getFilteredTransactions().forEach(t => {
      const day = days[new Date(t.date).getDay()];
      dayMap.set(day, dayMap.get(day) + Math.abs(t.amount));
      total += Math.abs(t.amount);
    });
    
    return days.map(day => ({
      day,
      amount: dayMap.get(day),
      percentage: total > 0 ? (dayMap.get(day) / total) * 100 : 0
    }));
  };

  // Calculate summary stats
  const calculateStats = () => {
    const filtered = getFilteredTransactions();
    const totalSpent = filtered.reduce((sum, t) => sum + Math.abs(t.amount), 0);
    const avgTransaction = filtered.length > 0 ? totalSpent / filtered.length : 0;
    
    const income = transactions
      .filter(t => t.amount > 0 && new Date(t.date) >= new Date(new Date().setMonth(new Date().getMonth() - 1)))
      .reduce((sum, t) => sum + t.amount, 0);
    
    const largestExpense = filtered.reduce((max, t) => Math.max(max, Math.abs(t.amount)), 0);
    const largestExpenseCat = filtered.find(t => Math.abs(t.amount) === largestExpense)?.category || 'Unknown';
    
    return {
      totalSpent,
      avgTransaction,
      transactionCount: filtered.length,
      income,
      savings: income - totalSpent,
      largestExpense,
      largestExpenseCat
    };
  };

  const spendingByCategory = getSpendingByCategory();
  const dailySpending = getDailySpending();
  const monthlySpending = getMonthlySpending();
  const dayOfWeekSpending = getSpendingByDayOfWeek();
  const stats = calculateStats();

  const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#6366F1', '#14B8A6'];

  if (isLoading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.spinner}></div>
        <p style={styles.loadingText}>Generating your reports...</p>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        <button onClick={() => router.back()} style={styles.backButton}>
          ←
        </button>
        <h1 style={styles.title}>Reports & Insights</h1>
        <button style={styles.menuButton}>⋮</button>
      </div>

      {/* Time Range Selector */}
      <div style={styles.timeRangeSelector}>
        <button
          style={{
            ...styles.rangeButton,
            ...(timeRange === 'week' ? styles.activeRange : {})
          }}
          onClick={() => setTimeRange('week')}
        >
          Week
        </button>
        <button
          style={{
            ...styles.rangeButton,
            ...(timeRange === 'month' ? styles.activeRange : {})
          }}
          onClick={() => setTimeRange('month')}
        >
          Month
        </button>
        <button
          style={{
            ...styles.rangeButton,
            ...(timeRange === 'year' ? styles.activeRange : {})
          }}
          onClick={() => setTimeRange('year')}
        >
          Year
        </button>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>💸</span>
          <div>
            <p style={styles.summaryLabel}>Total Spent</p>
            <p style={styles.summaryValue}>{formatCurrency(stats.totalSpent)}</p>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>💰</span>
          <div>
            <p style={styles.summaryLabel}>Income</p>
            <p style={styles.summaryValue}>{formatCurrency(stats.income)}</p>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>📊</span>
          <div>
            <p style={styles.summaryLabel}>Avg Transaction</p>
            <p style={styles.summaryValue}>{formatCurrency(stats.avgTransaction)}</p>
          </div>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryIcon}>🏷️</span>
          <div>
            <p style={styles.summaryLabel}>Top Category</p>
            <p style={styles.summaryValue}>
              {spendingByCategory[0]?.name || 'None'}
            </p>
          </div>
        </div>
      </div>

      {/* Tab Navigation */}
      <div style={styles.tabBar}>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'spending' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('spending')}
        >
          Spending
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'trends' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('trends')}
        >
          Trends
        </button>
        <button
          style={{
            ...styles.tab,
            ...(activeTab === 'categories' ? styles.activeTab : {})
          }}
          onClick={() => setActiveTab('categories')}
        >
          Categories
        </button>
      </div>

      {/* Tab Content */}
      <div style={styles.tabContent}>
        {activeTab === 'spending' && (
          <>
            {/* Daily Spending Chart */}
            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>Daily Spending (Last 14 Days)</h3>
              <div style={styles.chartContainer}>
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={dailySpending}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="day" stroke="#9CA3AF" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#9CA3AF" tick={{ fontSize: 10 }} tickFormatter={formatCompact} />
                    <Tooltip 
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                    />
                    <Area 
                      type="monotone" 
                      dataKey="amount" 
                      stroke="#3B82F6" 
                      fill="url(#colorSpending)" 
                      strokeWidth={2}
                    />
                    <defs>
                      <linearGradient id="colorSpending" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.1}/>
                      </linearGradient>
                    </defs>
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Spending by Day of Week */}
            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>Spending by Day of Week</h3>
              <div style={styles.chartContainer}>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={dayOfWeekSpending}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="day" stroke="#9CA3AF" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#9CA3AF" tick={{ fontSize: 10 }} tickFormatter={formatCompact} />
                    <Tooltip 
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                    />
                    <Bar dataKey="amount" fill="#F59E0B" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Largest Expense */}
            <div style={styles.insightCard}>
              <span style={styles.insightIcon}>🔍</span>
              <div>
                <p style={styles.insightTitle}>Largest Expense</p>
                <p style={styles.insightValue}>
                  {formatCurrency(stats.largestExpense)} in {stats.largestExpenseCat}
                </p>
              </div>
            </div>
          </>
        )}

        {activeTab === 'trends' && (
          <>
            {/* Monthly Income vs Spending */}
            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>Monthly Income vs Spending</h3>
              <div style={styles.chartContainer}>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={monthlySpending}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="month" stroke="#9CA3AF" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#9CA3AF" tick={{ fontSize: 10 }} tickFormatter={formatCompact} />
                    <Tooltip 
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                    />
                    <Legend />
                    <Bar dataKey="income" fill="#10B981" name="Income" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="spending" fill="#EF4444" name="Spending" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Savings Trend */}
            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>Monthly Savings</h3>
              <div style={styles.chartContainer}>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={monthlySpending}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis dataKey="month" stroke="#9CA3AF" tick={{ fontSize: 10 }} />
                    <YAxis stroke="#9CA3AF" tick={{ fontSize: 10 }} tickFormatter={formatCompact} />
                    <Tooltip 
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="savings" 
                      stroke="#8B5CF6" 
                      strokeWidth={3}
                      dot={{ fill: '#8B5CF6', r: 4 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Savings Rate */}
            <div style={styles.insightCard}>
              <span style={styles.insightIcon}>📈</span>
              <div>
                <p style={styles.insightTitle}>Savings Rate</p>
                <p style={styles.insightValue}>
                  {stats.income > 0 ? ((stats.savings / stats.income) * 100).toFixed(1) : 0}%
                </p>
                <p style={styles.insightSub}>
                  You saved {formatCurrency(stats.savings)} this period
                </p>
              </div>
            </div>
          </>
        )}

        {activeTab === 'categories' && (
          <>
            {/* Category Pie Chart */}
            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>Spending by Category</h3>
              <div style={styles.pieChartContainer}>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={spendingByCategory}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {spendingByCategory.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      formatter={(value) => formatCurrency(value)}
                      contentStyle={{ background: '#1F2937', border: '1px solid #374151', borderRadius: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Category List */}
            <div style={styles.categoryList}>
              {spendingByCategory.map((cat, index) => (
                <div key={cat.name} style={styles.categoryItem}>
                  <div style={styles.categoryLeft}>
                    <span style={{...styles.categoryDot, backgroundColor: COLORS[index % COLORS.length]}} />
                    <span style={styles.categoryName}>{cat.name}</span>
                  </div>
                  <div style={styles.categoryRight}>
                    <span style={styles.categoryAmount}>{formatCurrency(cat.value)}</span>
                    <span style={styles.categoryPercent}>
                      {((cat.value / stats.totalSpent) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Bottom Navigation */}
      <div style={styles.bottomNav}>
        <button style={styles.navItem} onClick={() => router.push('/mobile-home')}>
          <span style={styles.navIcon}>🏠</span>
          <span style={styles.navLabel}>Home</span>
        </button>
        <button style={styles.navItem} onClick={() => router.push('/mobile-budget')}>
          <span style={styles.navIcon}>📊</span>
          <span style={styles.navLabel}>Budget</span>
        </button>
        <button style={styles.navItem} onClick={() => setShowAddModal(true)}>
          <span style={styles.navIcon}>➕</span>
          <span style={styles.navLabel}>Add</span>
        </button>
        <button style={{...styles.navItem, ...styles.activeNavItem}}>
          <span style={styles.navIcon}>📈</span>
          <span style={styles.navLabel}>Reports</span>
        </button>
        <button style={styles.navItem}>
          <span style={styles.navIcon}>⚙️</span>
          <span style={styles.navLabel}>Settings</span>
        </button>
      </div>

      {/* Add Transaction Modal */}
      <AddTransactionModal
        isVisible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSave={handleAddTransaction}
        accounts={accounts}
        categories={categories}
      />
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#0f2e1c',
    color: 'white',
    paddingBottom: '80px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  loadingContainer: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    background: '#0f2e1c',
    color: 'white',
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid rgba(255,255,255,0.1)',
    borderTopColor: '#3B82F6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },
  loadingText: {
    fontSize: '16px',
    color: '#9CA3AF',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '20px',
    paddingTop: '60px',
    background: '#0047AB',
  },
  backButton: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
  },
  title: {
    fontSize: '20px',
    fontWeight: '600',
    margin: 0,
  },
  menuButton: {
    width: '40px',
    height: '40px',
    borderRadius: '20px',
    background: 'rgba(255,255,255,0.1)',
    border: 'none',
    color: 'white',
    fontSize: '20px',
    cursor: 'pointer',
  },
  timeRangeSelector: {
    display: 'flex',
    gap: '8px',
    padding: '16px 20px',
    background: '#1F2937',
    margin: '16px 20px',
    borderRadius: '30px',
  },
  rangeButton: {
    flex: 1,
    padding: '10px',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '20px',
    cursor: 'pointer',
  },
  activeRange: {
    background: '#3B82F6',
    color: 'white',
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '12px',
    padding: '0 20px',
    marginBottom: '24px',
  },
  summaryCard: {
    background: '#1F2937',
    padding: '16px',
    borderRadius: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  summaryIcon: {
    fontSize: '24px',
  },
  summaryLabel: {
    fontSize: '12px',
    color: '#9CA3AF',
    margin: 0,
    marginBottom: '4px',
  },
  summaryValue: {
    fontSize: '16px',
    fontWeight: 'bold',
    margin: 0,
  },
  tabBar: {
    display: 'flex',
    margin: '0 20px',
    background: '#1F2937',
    borderRadius: '30px',
    padding: '4px',
    marginBottom: '20px',
  },
  tab: {
    flex: 1,
    padding: '12px',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '14px',
    fontWeight: '500',
    borderRadius: '26px',
    cursor: 'pointer',
  },
  activeTab: {
    background: '#3B82F6',
    color: 'white',
  },
  tabContent: {
    padding: '0 20px',
  },
  chartCard: {
    background: '#1F2937',
    padding: '16px',
    borderRadius: '16px',
    marginBottom: '16px',
  },
  chartTitle: {
    fontSize: '16px',
    fontWeight: '600',
    margin: '0 0 12px 0',
    color: 'white',
  },
  chartContainer: {
    height: '200px',
    width: '100%',
  },
  pieChartContainer: {
    height: '250px',
    width: '100%',
  },
  insightCard: {
    background: 'linear-gradient(135deg, #1F2937, #111827)',
    padding: '16px',
    borderRadius: '16px',
    marginBottom: '16px',
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  insightIcon: {
    fontSize: '28px',
  },
  insightTitle: {
    fontSize: '14px',
    color: '#9CA3AF',
    margin: 0,
    marginBottom: '4px',
  },
  insightValue: {
    fontSize: '18px',
    fontWeight: 'bold',
    margin: 0,
  },
  insightSub: {
    fontSize: '12px',
    color: '#4ADE80',
    margin: '4px 0 0 0',
  },
  categoryList: {
    background: '#1F2937',
    borderRadius: '16px',
    padding: '12px',
  },
  categoryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px',
    borderBottom: '1px solid #374151',
    ':last-child': {
      borderBottom: 'none',
    },
  },
  categoryLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  categoryDot: {
    width: '12px',
    height: '12px',
    borderRadius: '6px',
  },
  categoryName: {
    fontSize: '14px',
  },
  categoryRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  categoryAmount: {
    fontSize: '14px',
    fontWeight: '600',
  },
  categoryPercent: {
    fontSize: '12px',
    color: '#9CA3AF',
    minWidth: '45px',
    textAlign: 'right',
  },
  bottomNav: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    display: 'flex',
    justifyContent: 'space-around',
    alignItems: 'center',
    background: '#1F2937',
    padding: '8px 0',
    paddingBottom: '24px',
    borderTop: '1px solid #374151',
  },
  navItem: {
    flex: 1,
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
  },
  activeNavItem: {
    color: '#3B82F6',
  },
  navIcon: {
    fontSize: '20px',
  },
  navLabel: {
    fontSize: '10px',
  },
};