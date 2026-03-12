// src/views/MoneyMapView.jsx
import React, { useState, useEffect } from 'react';
import MoneyMapRenderer from '../services/forecast/moneyMap.renderer.cjs';

const MoneyMapView = () => {
  const [moneyMap, setMoneyMap] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(2);

  useEffect(() => {
    loadMoneyMap();
  }, []);

  const loadMoneyMap = async () => {
    setLoading(true);
    setError(null);
    try {
      const moneyMapService = new MoneyMapRenderer();
      
      // Get current user
      const userResult = await window.electronAPI.getCurrentUser();
      const currentUserId = userResult?.success ? userResult.data.id : userId;
      
      const map = await moneyMapService.buildMoneyMap(currentUserId);
      setMoneyMap(map);
    } catch (error) {
      console.error('Error loading money map:', error);
      setError('Failed to load money map. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  if (loading) {
    return (
      <div style={styles.loadingContainer}>
        <div style={styles.loadingSpinner}></div>
        <p>Building your financial map...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={styles.errorContainer}>
        <p style={{ color: '#F87171', marginBottom: '1rem' }}>❌ {error}</p>
        <button onClick={loadMoneyMap} style={styles.retryButton}>
          Try Again
        </button>
      </div>
    );
  }

  if (!moneyMap) {
    return (
      <div style={styles.errorContainer}>
        <p>No money map data available</p>
      </div>
    );
  }

  // Calculate confidence safely
  const calculateConfidence = () => {
    if (!moneyMap.patterns) return 0;
    const patterns = Object.values(moneyMap.patterns);
    if (patterns.length === 0) return 0;
    const totalConfidence = patterns.reduce((sum, p) => sum + (p.confidence || 0), 0);
    return Math.round(totalConfidence / patterns.length);
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>🗺️ Your Money Map</h1>
      <p style={styles.subtitle}>A unified view of your financial landscape</p>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Total Assets</span>
          <span style={styles.summaryValue}>{formatCurrency(moneyMap.summary?.totalAssets)}</span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Accounts</span>
          <span style={styles.summaryValue}>{moneyMap.summary?.totalAccounts || 0}</span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Categories</span>
          <span style={styles.summaryValue}>{moneyMap.summary?.totalCategories || 0}</span>
        </div>
        <div style={styles.summaryCard}>
          <span style={styles.summaryLabel}>Data Confidence</span>
          <span style={styles.summaryValue}>{calculateConfidence()}%</span>
        </div>
      </div>

      {/* Accounts Section */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>📊 Accounts</h2>
        <div style={styles.accountList}>
          {(moneyMap.accounts || []).map(account => (
            <div key={account.id} style={styles.accountItem}>
              <div>
                <span style={styles.accountName}>{account.name}</span>
                <span style={styles.accountType}>{account.type}</span>
                {account.isLiquid && <span style={styles.liquidBadge}>💧 Liquid</span>}
                {account.isDebt && <span style={styles.debtBadge}>📉 Debt</span>}
              </div>
              <span style={{
                ...styles.accountBalance,
                color: account.current_balance >= 0 ? '#4ADE80' : '#F87171'
              }}>
                {formatCurrency(account.current_balance)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Priority Categories */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>🎯 Priority Categories</h2>
        
        {/* Essential */}
        {(moneyMap.categories || []).filter(c => 
          c.group_name?.toLowerCase().includes('fixed') ||
          c.name?.toLowerCase().includes('rent')
        ).length > 0 && (
          <div style={styles.categoryGroup}>
            <h3 style={styles.groupTitle}>🔴 Essential</h3>
            {moneyMap.categories
              .filter(c => c.group_name?.toLowerCase().includes('fixed') || 
                          c.name?.toLowerCase().includes('rent'))
              .slice(0, 5)
              .map(cat => (
                <div key={cat.id} style={styles.categoryItem}>
                  <span>{cat.name}</span>
                  {cat.target_amount > 0 && (
                    <span style={styles.targetBadge}>
                      Target: {formatCurrency(cat.target_amount)}
                    </span>
                  )}
                </div>
              ))}
          </div>
        )}

        {/* Variable */}
        {(moneyMap.categories || []).filter(c => 
          c.group_name?.toLowerCase().includes('variable')
        ).length > 0 && (
          <div style={styles.categoryGroup}>
            <h3 style={styles.groupTitle}>🟡 Variable</h3>
            {moneyMap.categories
              .filter(c => c.group_name?.toLowerCase().includes('variable'))
              .slice(0, 5)
              .map(cat => {
                const pattern = moneyMap.patterns?.[cat.id];
                return (
                  <div key={cat.id} style={styles.categoryItem}>
                    <span>{cat.name}</span>
                    {pattern && (
                      <span style={styles.patternInfo}>
                        Avg: {formatCurrency(pattern.averageSpending)} 
                        {pattern.volatility > 0 && ` ±${Math.round(pattern.volatilityPercentage || 0)}%`}
                      </span>
                    )}
                  </div>
                );
              })}
          </div>
        )}
      </div>

      {/* Top Spending Patterns */}
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>📈 Top Spending Patterns</h2>
        {Object.values(moneyMap.patterns || {})
          .sort((a, b) => (b.averageSpending || 0) - (a.averageSpending || 0))
          .slice(0, 5)
          .map((pattern, index) => (
            <div key={index} style={styles.patternItem}>
              <div>
                <span style={styles.patternName}>{pattern.categoryName || 'Unknown'}</span>
                <span style={styles.patternConfidence}>
                  {pattern.confidence || 0}% confidence
                </span>
              </div>
              <div>
                <span style={styles.patternAmount}>
                  {formatCurrency(pattern.averageSpending)}/month
                </span>
              </div>
            </div>
          ))}
      </div>
    </div>
  );
};

const styles = {
  container: {
    padding: '2rem',
    color: 'white'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem'
  },
  subtitle: {
    color: '#9CA3AF',
    marginBottom: '2rem'
  },
  loadingContainer: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '60vh'
  },
  loadingSpinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #3B82F6',
    borderTopColor: 'transparent',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '1rem'
  },
  errorContainer: {
    padding: '2rem',
    textAlign: 'center',
    color: '#F87171'
  },
  retryButton: {
    background: '#3B82F6',
    color: 'white',
    border: 'none',
    padding: '0.5rem 1rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    marginTop: '1rem'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem'
  },
  summaryCard: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
  },
  summaryLabel: {
    display: 'block',
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white'
  },
  section: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    marginBottom: '2rem',
    border: '1px solid #374151'
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '1.5rem',
    color: 'white'
  },
  accountList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  accountItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    background: '#111827',
    borderRadius: '0.5rem'
  },
  accountName: {
    fontWeight: '600',
    marginRight: '0.5rem'
  },
  accountType: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginRight: '0.5rem',
    textTransform: 'capitalize'
  },
  liquidBadge: {
    fontSize: '0.7rem',
    background: '#065f46',
    color: '#4ADE80',
    padding: '0.2rem 0.5rem',
    borderRadius: '1rem',
    marginLeft: '0.5rem'
  },
  debtBadge: {
    fontSize: '0.7rem',
    background: '#7F1D1D',
    color: '#F87171',
    padding: '0.2rem 0.5rem',
    borderRadius: '1rem',
    marginLeft: '0.5rem'
  },
  accountBalance: {
    fontWeight: '600'
  },
  categoryGroup: {
    marginBottom: '1.5rem'
  },
  groupTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: '#9CA3AF',
    marginBottom: '0.75rem'
  },
  categoryItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.5rem',
    borderBottom: '1px solid #374151'
  },
  targetBadge: {
    fontSize: '0.8rem',
    color: '#3B82F6'
  },
  patternInfo: {
    fontSize: '0.8rem',
    color: '#9CA3AF'
  },
  patternItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    background: '#111827',
    borderRadius: '0.5rem',
    marginBottom: '0.5rem'
  },
  patternName: {
    fontWeight: '600',
    marginRight: '0.5rem'
  },
  patternConfidence: {
    fontSize: '0.75rem',
    color: '#3B82F6'
  },
  patternAmount: {
    color: '#4ADE80'
  }
};

export default MoneyMapView;