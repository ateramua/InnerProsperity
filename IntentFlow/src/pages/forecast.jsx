// src/pages/forecast.jsx
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import ForecastService from '../services/forecast/forecastService.renderer.cjs';

export default function ForecastPage() {
  const [timeframe, setTimeframe] = useState('monthly');
  const [loading, setLoading] = useState(false);
  const [forecastData, setForecastData] = useState(null);
  const [error, setError] = useState(null);
  const [userId, setUserId] = useState(2);
  const [animatedValue, setAnimatedValue] = useState(0);

  const timeframes = [
    { id: 'daily', label: 'Daily', icon: '📅', description: 'Day-by-day projections' },
    { id: 'weekly', label: 'Weekly', icon: '📊', description: 'Week-over-week trends' },
    { id: 'monthly', label: 'Monthly', icon: '📈', description: 'Month-to-month growth' },
    { id: 'yearly', label: 'Yearly', icon: '🎯', description: 'Long-term wealth building' }
  ];

  useEffect(() => {
    loadForecast();
  }, [timeframe]);

  // Animate numbers when forecast data changes
  useEffect(() => {
    if (forecastData) {
      let targetValue = 0;
      if (timeframe === 'monthly' && forecastData.forecast?.[0]) {
        targetValue = forecastData.forecast[0].projectedAssets;
      } else if (timeframe === 'yearly' && forecastData.yearly?.[0]) {
        targetValue = forecastData.yearly[0].endBalance;
      }
      
      let startValue = animatedValue;
      const duration = 1000;
      const step = (targetValue - startValue) / (duration / 16);
      let current = startValue;
      
      const interval = setInterval(() => {
        current += step;
        if ((step > 0 && current >= targetValue) || (step < 0 && current <= targetValue)) {
          setAnimatedValue(targetValue);
          clearInterval(interval);
        } else {
          setAnimatedValue(current);
        }
      }, 16);
      
      return () => clearInterval(interval);
    }
  }, [forecastData, timeframe]);

  const loadForecast = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const forecastService = new ForecastService();
      
      const userResult = await window.electronAPI.getCurrentUser();
      const currentUserId = userResult?.success ? userResult.data.id : userId;
      
      let data = null;
      
      switch(timeframe) {
        case 'daily':
          data = await forecastService.getDailyForecast(currentUserId);
          break;
        case 'weekly':
          data = await forecastService.getWeeklyForecast(currentUserId, 12);
          break;
        case 'monthly':
          data = await forecastService.generateForecast(currentUserId, { months: 12 });
          break;
        case 'yearly':
          data = await forecastService.getYearlyForecast(currentUserId, 5);
          break;
      }
      
      setForecastData(data);
      
    } catch (err) {
      console.error('Error loading forecast:', err);
      setError('Failed to load forecast data. Please try again.');
    } finally {
      setLoading(false);
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

  const formatCompactCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      notation: 'compact',
      compactDisplay: 'short',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1
    }).format(amount);
  };

  const renderKeyMetrics = () => {
    if (!forecastData || loading) return null;

    let metrics = [];
    
    if (timeframe === 'monthly' && forecastData.forecast) {
      const firstMonth = forecastData.forecast[0];
      const lastMonth = forecastData.forecast[forecastData.forecast.length - 1];
      const growth = ((lastMonth.projectedAssets - firstMonth.projectedAssets) / firstMonth.projectedAssets) * 100;
      
      metrics = [
        { label: 'Projected Growth', value: `${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`, color: growth >= 0 ? '#4ADE80' : '#F87171', icon: '📈' },
        { label: 'Peak Balance', value: formatCompactCurrency(Math.max(...forecastData.forecast.map(m => m.projectedAssets))), color: '#F59E0B', icon: '🏔️' },
        { label: 'Average Monthly', value: formatCompactCurrency(forecastData.forecast.reduce((sum, m) => sum + m.projectedAssets, 0) / forecastData.forecast.length), color: '#3B82F6', icon: '📊' }
      ];
    } else if (timeframe === 'yearly' && forecastData.yearly) {
      const firstYear = forecastData.yearly[0];
      const lastYear = forecastData.yearly[forecastData.yearly.length - 1];
      const growth = ((lastYear.endBalance - firstYear.endBalance) / firstYear.endBalance) * 100;
      
      metrics = [
        { label: '5-Year Growth', value: `${growth > 0 ? '+' : ''}${growth.toFixed(1)}%`, color: growth >= 0 ? '#4ADE80' : '#F87171', icon: '🚀' },
        { label: 'Final Balance', value: formatCompactCurrency(lastYear.endBalance), color: '#10B981', icon: '🎯' },
        { label: 'Avg Yearly Return', value: `${(forecastData.yearly.reduce((sum, y) => sum + y.growthPercentage, 0) / forecastData.yearly.length).toFixed(1)}%`, color: '#8B5CF6', icon: '📈' }
      ];
    }
    
    if (metrics.length === 0) return null;
    
    return (
      <div style={styles.metricsGrid}>
        {metrics.map((metric, idx) => (
          <div key={idx} style={styles.metricCard}>
            <div style={styles.metricIcon}>{metric.icon}</div>
            <div style={styles.metricContent}>
              <span style={styles.metricLabel}>{metric.label}</span>
              <span style={{ ...styles.metricValue, color: metric.color }}>{metric.value}</span>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const renderForecastContent = () => {
    if (loading) {
      return (
        <div style={styles.loadingContainer}>
          <div style={styles.spinner}></div>
          <div style={styles.loadingText}>
            <p style={styles.loadingTitle}>Analyzing your financial future...</p>
            <p style={styles.loadingSubtitle}>AI is crunching the numbers</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div style={styles.errorContainer}>
          <div style={styles.errorIcon}>⚠️</div>
          <h3 style={styles.errorTitle}>Unable to load forecast</h3>
          <p style={styles.errorMessage}>{error}</p>
          <button onClick={loadForecast} style={styles.retryButton}>
            Try Again
          </button>
        </div>
      );
    }

    if (!forecastData) {
      return (
        <div style={styles.emptyContainer}>
          <div style={styles.emptyIcon}>🔮</div>
          <h3 style={styles.emptyTitle}>No forecast data available</h3>
          <p style={styles.emptyText}>Add some transactions to see your financial forecast</p>
        </div>
      );
    }

    // Render different content based on timeframe
    if (timeframe === 'daily' && forecastData.daily) {
      return (
        <div style={styles.forecastContainer}>
          <div style={styles.chartHeader}>
            <h3 style={styles.sectionTitle}>Daily Balance Projection</h3>
            <span style={styles.nextDays}>Next 7 days</span>
          </div>
          <div style={styles.dailyGrid}>
            {forecastData.daily.slice(0, 7).map((day, index) => {
              const balance = day.projectedBalance;
              const maxBalance = Math.max(...forecastData.daily.slice(0, 7).map(d => d.projectedBalance));
              const heightPercent = (balance / maxBalance) * 100;
              
              return (
                <div key={index} style={styles.dailyCard}>
                  <div style={styles.dailyBarContainer}>
                    <div style={{
                      ...styles.dailyBar,
                      height: `${heightPercent}%`,
                      background: `linear-gradient(180deg, ${balance >= 0 ? '#4ADE80' : '#F87171'} 0%, ${balance >= 0 ? '#10B981' : '#EF4444'} 100%)`
                    }}></div>
                  </div>
                  <div style={styles.dailyInfo}>
                    <div style={styles.dailyDate}>{new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div style={styles.dailyDay}>{new Date(day.date).getDate()}</div>
                    <div style={styles.dailyAmount}>{formatCompactCurrency(balance)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (timeframe === 'weekly' && forecastData.weekly) {
      return (
        <div style={styles.forecastContainer}>
          <h3 style={styles.sectionTitle}>Weekly Trends</h3>
          <div style={styles.weeklyList}>
            {forecastData.weekly.slice(0, 12).map((week, index) => (
              <div key={index} style={styles.weeklyCard}>
                <div style={styles.weeklyHeader}>
                  <span style={styles.weekNumber}>Week {index + 1}</span>
                  <span style={styles.weekDate}>
                    {new Date(week.startDate).toLocaleDateString()} - {new Date(week.endDate).toLocaleDateString()}
                  </span>
                </div>
                <div style={styles.weeklyStats}>
                  <div style={styles.weeklyStat}>
                    <span style={styles.statLabel}>Start</span>
                    <span style={styles.statValue}>{formatCompactCurrency(week.startBalance)}</span>
                  </div>
                  <div style={styles.weeklyStat}>
                    <span style={styles.statLabel}>End</span>
                    <span style={styles.statValue}>{formatCompactCurrency(week.endBalance)}</span>
                  </div>
                  <div style={styles.weeklyStat}>
                    <span style={styles.statLabel}>Change</span>
                    <span style={{ ...styles.statValue, color: week.change >= 0 ? '#4ADE80' : '#F87171' }}>
                      {week.change >= 0 ? '+' : ''}{formatCompactCurrency(week.change)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (timeframe === 'monthly' && forecastData.forecast) {
      return (
        <div style={styles.forecastContainer}>
          {renderKeyMetrics()}
          <h3 style={styles.sectionTitle}>Monthly Projections</h3>
          <div style={styles.monthlyGrid}>
            {forecastData.forecast.slice(0, 6).map((month, index) => {
              const confidence = month.confidence;
              return (
                <div key={index} style={styles.monthlyCard}>
                  <div style={styles.monthlyHeader}>
                    <div>
                      <div style={styles.monthName}>
                        {new Date(month.date).toLocaleDateString('en-US', { month: 'long' })}
                      </div>
                      <div style={styles.monthYear}>
                        {new Date(month.date).getFullYear()}
                      </div>
                    </div>
                    <div style={styles.confidenceBadge}>
                      {confidence.toFixed(0)}% confidence
                    </div>
                  </div>
                  <div style={styles.monthlyAmount}>
                    {formatCurrency(month.projectedAssets)}
                  </div>
                  <div style={styles.monthlyTrend}>
                    <div style={styles.trendBar}>
                      <div style={{
                        ...styles.trendFill,
                        width: `${confidence}%`,
                        background: `linear-gradient(90deg, #3B82F6, ${confidence > 70 ? '#4ADE80' : '#F59E0B'})`
                      }}></div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (timeframe === 'yearly' && forecastData.yearly) {
      return (
        <div style={styles.forecastContainer}>
          {renderKeyMetrics()}
          <h3 style={styles.sectionTitle}>Long-term Wealth Projection</h3>
          <div style={styles.yearlyTimeline}>
            {forecastData.yearly.map((year, index) => (
              <div key={index} style={styles.yearlyNode}>
                <div style={styles.yearlyMarker}></div>
                {index < forecastData.yearly.length - 1 && <div style={styles.yearlyLine}></div>}
                <div style={styles.yearlyCard}>
                  <div style={styles.yearlyHeader}>
                    <span style={styles.yearlyYear}>{year.year}</span>
                    <span style={{ ...styles.yearlyGrowth, color: year.growth >= 0 ? '#4ADE80' : '#F87171' }}>
                      {year.growth >= 0 ? '↑' : '↓'} {Math.abs(year.growthPercentage).toFixed(1)}%
                    </span>
                  </div>
                  <div style={styles.yearlyBalance}>
                    {formatCurrency(year.endBalance)}
                  </div>
                  <div style={styles.yearlyDetails}>
                    <span>Start: {formatCurrency(year.startBalance)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div style={styles.container}>
      {/* Animated Background */}
      <div style={styles.backgroundGradient}></div>
      <div style={styles.backgroundPattern}></div>
      
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.headerContent}>
          <div style={styles.headerBadge}>AI-Powered Insights</div>
          <h1 style={styles.title}>
            <span style={styles.titleIcon}>📈</span>
            Smart Forecast
          </h1>
          <p style={styles.subtitle}>
            AI-powered predictions based on your spending patterns and budget goals
          </p>
        </div>
      </div>

      {/* Timeframe Selector */}
      <div style={styles.timeframeWrapper}>
        <div style={styles.timeframeSelector}>
          {timeframes.map((tf) => (
            <button
              key={tf.id}
              onClick={() => setTimeframe(tf.id)}
              style={{
                ...styles.timeframeButton,
                ...(timeframe === tf.id ? styles.activeTimeframe : {})
              }}
            >
              <span style={styles.timeframeIcon}>{tf.icon}</span>
              <div style={styles.timeframeText}>
                <span style={styles.timeframeLabel}>{tf.label}</span>
                <span style={styles.timeframeDesc}>{tf.description}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Forecast Content */}
      {renderForecastContent()}

      {/* Back to Budget Link */}
      <div style={styles.backLink}>
        <Link href="/" passHref>
          <button style={styles.backButton}>
            <span style={styles.backIcon}>←</span>
            Back to Dashboard
          </button>
        </Link>
      </div>

      <style jsx>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 0.6; }
          50% { opacity: 1; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: '#3B82F6',
    color: '#0047AB',
    padding: '2rem',
    position: 'relative',
    overflowX: 'hidden'
  },
  backgroundGradient: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'radial-gradient(circle at 20% 50%, rgba(59, 130, 246, 0.1) 0%, transparent 50%)',
    pointerEvents: 'none',
    zIndex: 0
  },
  backgroundPattern: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundImage: 'url("data:image/svg+xml,%3Csvg width="60" height="60" xmlns="http://www.w3.org/2000/svg"%3E%3Cdefs%3E%3Cpattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse"%3E%3Cpath d="M 60 0 L 0 0 0 60" fill="none" stroke="rgba(59,130,246,0.05)" stroke-width="1"/%3E%3C/pattern%3E%3C/defs%3E%3Crect width="100%" height="100%" fill="url(%23grid)"/%3E%3C/svg%3E")',
    pointerEvents: 'none',
    zIndex: 0,
    opacity: 0.5
  },
  header: {
    position: 'relative',
    zIndex: 1,
    marginBottom: '3rem',
    textAlign: 'center'
  },
  headerContent: {
    maxWidth: '800px',
    margin: '0 auto'
  },
  headerBadge: {
    display: 'inline-block',
    background: 'rgba(59, 130, 246, 0.2)',
    backdropFilter: 'blur(10px)',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px',
    fontSize: '0.75rem',
    color: '#60A5FA',
    marginBottom: '1rem',
    border: '1px solid rgba(59, 130, 246, 0.3)'
  },
  title: {
    fontSize: '3rem',
    fontWeight: 'bold',
    marginBottom: '1rem',
    color: '#0047AB',
    animation: 'pulse 2s ease-in-out infinite'
  },
  titleIcon: {
    marginRight: '0.5rem',
    display: 'inline-block'
  },
  subtitle: {
    color: '#0047AB',
    fontSize: '1.125rem',
    lineHeight: 1.6
  },
  timeframeWrapper: {
    position: 'relative',
    zIndex: 1,
    marginBottom: '2rem',
    display: 'flex',
    justifyContent: 'center'
  },
  timeframeSelector: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    maxWidth: '800px',
    width: '100%',
    background: '#0047AB',
    backdropFilter: 'blur(10px)',
    padding: '0.5rem',
    borderRadius: '1rem',
    border: '2px solid #3B82F6'
  },
  timeframeButton: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '0.75rem 1rem',
    background: 'transparent',
    border: 'none',
    borderRadius: '0.75rem',
    color: 'rgba(255,255,255,0.85)',
    cursor: 'pointer',
    transition: 'all 0.3s ease',
    textAlign: 'left'
  },
  activeTimeframe: {
    background: '#3B82F6',
    color: '#0047AB',
    boxShadow: '0 4px 12px rgba(0, 71, 171, 0.25)'
  },
  timeframeIcon: {
    fontSize: '1.5rem'
  },
  timeframeText: {
    display: 'flex',
    flexDirection: 'column'
  },
  timeframeLabel: {
    fontSize: '1rem',
    fontWeight: '600'
  },
  timeframeDesc: {
    fontSize: '0.75rem',
    opacity: 0.7
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem'
  },
  metricCard: {
    background: '#0047AB',
    backdropFilter: 'blur(10px)',
    padding: '1.25rem',
    borderRadius: '1rem',
    border: '2px solid #3B82F6',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem',
    transition: 'transform 0.3s ease, box-shadow 0.3s ease',
    ':hover': {
      transform: 'translateY(-4px)',
      boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)'
    }
  },
  metricIcon: {
    fontSize: '2rem'
  },
  metricContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column'
  },
  metricLabel: {
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.75)',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.25rem'
  },
  metricValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#FFFFFF'
  },
  loadingContainer: {
    position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '4rem',
    background: '#0047AB',
    backdropFilter: 'blur(10px)',
    borderRadius: '1rem',
    border: '1px solid rgba(55, 65, 81, 0.5)',
    minHeight: '400px'
  },
  spinner: {
    width: '60px',
    height: '60px',
    border: '4px solid rgba(59, 130, 246, 0.2)',
    borderTopColor: '#3B82F6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '1.5rem'
  },
  loadingText: {
    textAlign: 'center'
  },
  loadingTitle: {
    fontSize: '1.125rem',
    fontWeight: '600',
    marginBottom: '0.5rem',
    color: 'white'
  },
  loadingSubtitle: {
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  forecastContainer: {
    position: 'relative',
    zIndex: 1,
    background: '#0047AB',
    backdropFilter: 'blur(10px)',
    borderRadius: '1rem',
    padding: '2rem',
    border: '1px solid rgba(55, 65, 81, 0.5)',
    marginBottom: '2rem',
    animation: 'fadeIn 0.5s ease-out'
  },
  sectionTitle: {
    fontSize: '1.5rem',
    fontWeight: '600',
    marginBottom: '1.5rem',
    background: 'linear-gradient(135deg, #60A5FA, #A78BFA)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  chartHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '1.5rem'
  },
  nextDays: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    background: '#374151',
    padding: '0.25rem 0.75rem',
    borderRadius: '9999px'
  },
  dailyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
    gap: '1rem'
  },
  dailyCard: {
    textAlign: 'center'
  },
  dailyBarContainer: {
    height: '120px',
    display: 'flex',
    alignItems: 'flex-end',
    marginBottom: '0.75rem'
  },
  dailyBar: {
    width: '100%',
    borderRadius: '0.5rem',
    transition: 'height 0.3s ease'
  },
  dailyInfo: {
    marginTop: '0.5rem'
  },
  dailyDate: {
    fontSize: '0.875rem',
    fontWeight: '600',
    color: 'white'
  },
  dailyDay: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginTop: '0.25rem'
  },
  dailyAmount: {
    fontSize: '0.75rem',
    color: '#4ADE80',
    marginTop: '0.25rem'
  },
  weeklyList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem'
  },
  weeklyCard: {
    background: '#0047AB',
    padding: '1rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
  },
  weeklyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.75rem'
  },
  weekNumber: {
    fontWeight: '600',
    color: '#3B82F6'
  },
  weekDate: {
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  weeklyStats: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1rem'
  },
  weeklyStat: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  statLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem'
  },
  statValue: {
    fontSize: '1rem',
    fontWeight: '600',
    color: 'white'
  },
  monthlyGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
    gap: '1rem'
  },
  monthlyCard: {
    background: '#0047AB',
    padding: '1.25rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    transition: 'transform 0.3s ease',
    ':hover': {
      transform: 'translateY(-4px)',
      boxShadow: '0 8px 25px rgba(0, 0, 0, 0.3)'
    }
  },
  monthlyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: '1rem'
  },
  monthName: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: 'white'
  },
  monthYear: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginTop: '0.25rem'
  },
  confidenceBadge: {
    fontSize: '0.75rem',
    color: '#3B82F6',
    background: 'rgba(59, 130, 246, 0.2)',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.375rem'
  },
  monthlyAmount: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: '#4ADE80',
    marginBottom: '1rem'
  },
  monthlyTrend: {
    marginTop: '0.5rem'
  },
  trendBar: {
    height: '4px',
    background: '#374151',
    borderRadius: '2px',
    overflow: 'hidden'
  },
  trendFill: {
    height: '100%',
    borderRadius: '2px',
    transition: 'width 0.5s ease'
  },
  yearlyTimeline: {
    position: 'relative',
    paddingLeft: '2rem'
  },
  yearlyNode: {
    position: 'relative',
    marginBottom: '2rem'
  },
  yearlyMarker: {
    position: 'absolute',
    left: '-1.5rem',
    top: '1rem',
    width: '12px',
    height: '12px',
    borderRadius: '50%',
    background: '#3B82F6',
    border: '2px solid #60A5FA',
    zIndex: 1
  },
  yearlyLine: {
    position: 'absolute',
    left: '-1rem',
    top: '1.5rem',
    width: '2px',
    height: 'calc(100% + 2rem)',
    background: 'linear-gradient(180deg, #3B82F6, #8B5CF6)',
    zIndex: 0
  },
  yearlyCard: {
    background: '#0047AB',
    padding: '1rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    marginLeft: '1rem'
  },
  yearlyHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '0.5rem'
  },
  yearlyYear: {
    fontSize: '1.125rem',
    fontWeight: '600',
    color: 'white'
  },
  yearlyGrowth: {
    fontSize: '0.875rem',
    fontWeight: '600'
  },
  yearlyBalance: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: '#4ADE80',
    marginBottom: '0.5rem'
  },
  yearlyDetails: {
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  errorContainer: {
    position: 'relative',
    zIndex: 1,
    textAlign: 'center',
    padding: '3rem',
    background: 'rgba(239, 68, 68, 0.1)',
    backdropFilter: 'blur(10px)',
    borderRadius: '1rem',
    border: '1px solid rgba(239, 68, 68, 0.3)'
  },
  errorIcon: {
    fontSize: '3rem',
    marginBottom: '1rem'
  },
  errorTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '0.5rem',
    color: '#F87171'
  },
  errorMessage: {
    color: '#9CA3AF',
    marginBottom: '1.5rem'
  },
  retryButton: {
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    padding: '0.75rem 1.5rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: '600',
    transition: 'transform 0.2s ease',
    ':hover': {
      transform: 'scale(1.05)'
    }
  },
  emptyContainer: {
    position: 'relative',
    zIndex: 1,
    textAlign: 'center',
    padding: '3rem',
    background: '#0047AB',
    backdropFilter: 'blur(10px)',
    borderRadius: '1rem',
    border: '1px solid rgba(55, 65, 81, 0.5)'
  },
  emptyIcon: {
    fontSize: '4rem',
    marginBottom: '1rem',
    animation: 'float 3s ease-in-out infinite'
  },
  emptyTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '0.5rem',
    color: 'white'
  },
  emptyText: {
    color: '#9CA3AF'
  },
  backLink: {
    position: 'relative',
    zIndex: 1,
    textAlign: 'center',
    marginTop: '2rem'
  },
  backButton: {
    background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
    color: 'white',
    border: 'none',
    padding: '0.75rem 2rem',
    borderRadius: '0.75rem',
    cursor: 'pointer',
    fontSize: '1rem',
    fontWeight: '600',
    transition: 'all 0.3s ease',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    ':hover': {
      transform: 'translateY(-2px)',
      boxShadow: '0 8px 25px rgba(59, 130, 246, 0.3)'
    }
  },
  backIcon: {
    fontSize: '1.125rem'
  }
};

// Add keyframes to document
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement('style');
  styleSheet.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes pulse {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 1; }
    }
    @keyframes float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-20px); }
    }
    @keyframes fadeIn {
      from {
        opacity: 0;
        transform: translateY(20px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;
  document.head.appendChild(styleSheet);
}