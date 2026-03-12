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

  const timeframes = [
    { id: 'daily', label: 'Daily' },
    { id: 'weekly', label: 'Weekly' },
    { id: 'monthly', label: 'Monthly' },
    { id: 'yearly', label: 'Yearly' }
  ];

  useEffect(() => {
    loadForecast();
  }, [timeframe]);

  const loadForecast = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const forecastService = new ForecastService();
      
      // Get current user
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
      currency: 'USD'
    }).format(amount);
  };

  const renderForecastContent = () => {
    if (loading) {
      return (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '4rem',
          background: '#1F2937',
          borderRadius: '0.75rem',
          border: '1px solid #374151'
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '4px solid #3B82F6',
            borderTopColor: 'transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
            marginBottom: '1rem'
          }}></div>
          <p style={{ color: '#9CA3AF' }}>Calculating your forecast...</p>
        </div>
      );
    }

    if (error) {
      return (
        <div style={{
          padding: '2rem',
          background: '#1F2937',
          borderRadius: '0.75rem',
          border: '1px solid #EF4444',
          textAlign: 'center'
        }}>
          <p style={{ color: '#F87171', marginBottom: '1rem' }}>❌ {error}</p>
          <button
            onClick={loadForecast}
            style={{
              background: '#3B82F6',
              color: 'white',
              border: 'none',
              padding: '0.5rem 1rem',
              borderRadius: '0.5rem',
              cursor: 'pointer'
            }}
          >
            Try Again
          </button>
        </div>
      );
    }

    if (!forecastData) {
      return (
        <div style={{
          padding: '2rem',
          background: '#1F2937',
          borderRadius: '0.75rem',
          border: '1px solid #374151',
          textAlign: 'center'
        }}>
          <p style={{ color: '#9CA3AF' }}>No forecast data available</p>
        </div>
      );
    }

    // Render different content based on timeframe
    if (timeframe === 'daily' && forecastData.daily) {
      return (
        <div style={styles.forecastContainer}>
          <h3 style={styles.sectionTitle}>Next 30 Days</h3>
          {forecastData.daily.slice(0, 7).map((day, index) => (
            <div key={index} style={styles.forecastItem}>
              <div>
                <div style={styles.itemDate}>{new Date(day.date).toLocaleDateString()}</div>
                <div style={styles.itemDay}>{['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.dayOfWeek]}</div>
              </div>
              <div style={styles.itemAmount}>
                {formatCurrency(day.projectedBalance)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (timeframe === 'monthly' && forecastData.forecast) {
      return (
        <div style={styles.forecastContainer}>
          <h3 style={styles.sectionTitle}>Monthly Projections</h3>
          {forecastData.forecast.slice(0, 6).map((month, index) => (
            <div key={index} style={styles.forecastItem}>
              <div>
                <div style={styles.itemDate}>
                  {new Date(month.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </div>
                <div style={styles.itemConfidence}>
                  Confidence: {month.confidence.toFixed(0)}%
                </div>
              </div>
              <div style={styles.itemAmount}>
                {formatCurrency(month.projectedAssets)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (timeframe === 'yearly' && forecastData.yearly) {
      return (
        <div style={styles.forecastContainer}>
          <h3 style={styles.sectionTitle}>Yearly Projections</h3>
          {forecastData.yearly.map((year, index) => (
            <div key={index} style={styles.forecastItem}>
              <div>
                <div style={styles.itemDate}>{year.year}</div>
                <div style={{
                  ...styles.itemGrowth,
                  color: year.growth >= 0 ? '#4ADE80' : '#F87171'
                }}>
                  {year.growth >= 0 ? '+' : ''}{year.growthPercentage.toFixed(1)}% growth
                </div>
              </div>
              <div style={styles.itemAmount}>
                {formatCurrency(year.endBalance)}
              </div>
            </div>
          ))}
        </div>
      );
    }

    return (
      <div style={{
        padding: '2rem',
        background: '#1F2937',
        borderRadius: '0.75rem',
        border: '1px solid #374151',
        textAlign: 'center'
      }}>
        <p style={{ color: '#9CA3AF' }}>No data available for {timeframe} view</p>
      </div>
    );
  };

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>📈 Smart Forecast</h1>
      <p style={styles.subtitle}>
        AI-powered predictions based on your spending patterns and budget goals
      </p>

      {/* Timeframe Selector */}
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
            {tf.label}
          </button>
        ))}
      </div>

      {/* Forecast Content */}
      {renderForecastContent()}

      {/* Back to Budget Link */}
      <div style={styles.backLink}>
        <Link href="/" passHref>
          <button style={styles.backButton}
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
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #111827 0%, #1F2937 100%)',
    color: 'white',
    padding: '2rem'
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
  timeframeSelector: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '2rem',
    padding: '0.25rem',
    background: '#1F2937',
    borderRadius: '0.5rem',
    border: '1px solid #374151',
    maxWidth: '400px'
  },
  timeframeButton: {
    flex: 1,
    padding: '0.5rem 1rem',
    background: 'transparent',
    border: 'none',
    borderRadius: '0.375rem',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    cursor: 'pointer',
    transition: 'all 0.2s ease'
  },
  activeTimeframe: {
    background: '#3B82F6',
    color: 'white',
    fontWeight: '600'
  },
  forecastContainer: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    border: '1px solid #374151',
    marginBottom: '2rem'
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    marginBottom: '1.5rem',
    color: 'white'
  },
  forecastItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    background: '#111827',
    borderRadius: '0.5rem',
    marginBottom: '0.5rem'
  },
  itemDate: {
    fontSize: '1rem',
    fontWeight: '500',
    color: 'white',
    marginBottom: '0.25rem'
  },
  itemDay: {
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  itemConfidence: {
    fontSize: '0.75rem',
    color: '#3B82F6'
  },
  itemGrowth: {
    fontSize: '0.875rem'
  },
  itemAmount: {
    fontSize: '1.25rem',
    fontWeight: 'bold',
    color: '#4ADE80'
  },
  backLink: {
    marginTop: '2rem',
    textAlign: 'center'
  },
  backButton: {
    background: 'none',
    border: '1px solid #3B82F6',
    color: '#3B82F6',
    padding: '0.75rem 2rem',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    fontSize: '1rem',
    transition: 'all 0.2s'
  }
};