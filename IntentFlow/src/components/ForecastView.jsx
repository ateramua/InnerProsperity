// src/components/ForecastView.jsx
import React, { useState, useEffect } from 'react';

const ForecastView = ({ forecast, timeframe, onTimeframeChange }) => {
  const [selectedMetric, setSelectedMetric] = useState('balance');
  const [showDetails, setShowDetails] = useState(false);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatPercentage = (value) => {
    return `${value.toFixed(1)}%`;
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 80) return '#4ADE80';
    if (confidence >= 60) return '#F59E0B';
    return '#F87171';
  };

  const getMetricColor = (value) => {
    if (value > 0) return '#4ADE80';
    if (value < 0) return '#F87171';
    return '#9CA3AF';
  };

  const renderTimeframeSelector = () => (
    <div style={styles.timeframeSelector}>
      <button
        style={{
          ...styles.timeframeButton,
          ...(timeframe === 'daily' ? styles.activeTimeframe : {})
        }}
        onClick={() => onTimeframeChange('daily')}
      >
        Daily
      </button>
      <button
        style={{
          ...styles.timeframeButton,
          ...(timeframe === 'weekly' ? styles.activeTimeframe : {})
        }}
        onClick={() => onTimeframeChange('weekly')}
      >
        Weekly
      </button>
      <button
        style={{
          ...styles.timeframeButton,
          ...(timeframe === 'monthly' ? styles.activeTimeframe : {})
        }}
        onClick={() => onTimeframeChange('monthly')}
      >
        Monthly
      </button>
      <button
        style={{
          ...styles.timeframeButton,
          ...(timeframe === 'yearly' ? styles.activeTimeframe : {})
        }}
        onClick={() => onTimeframeChange('yearly')}
      >
        Yearly
      </button>
    </div>
  );

  const renderMetricSelector = () => (
    <div style={styles.metricSelector}>
      <button
        style={{
          ...styles.metricButton,
          ...(selectedMetric === 'balance' ? styles.activeMetric : {})
        }}
        onClick={() => setSelectedMetric('balance')}
      >
        Balance
      </button>
      <button
        style={{
          ...styles.metricButton,
          ...(selectedMetric === 'income' ? styles.activeMetric : {})
        }}
        onClick={() => setSelectedMetric('income')}
      >
        Income
      </button>
      <button
        style={{
          ...styles.metricButton,
          ...(selectedMetric === 'expenses' ? styles.activeMetric : {})
        }}
        onClick={() => setSelectedMetric('expenses')}
      >
        Expenses
      </button>
    </div>
  );

  const renderDailyForecast = () => {
    if (!forecast || !forecast.daily) return null;

    return (
      <div style={styles.forecastContainer}>
        <div style={styles.currentBalance}>
          <span style={styles.balanceLabel}>Current Balance</span>
          <span style={styles.balanceValue}>
            {formatCurrency(forecast.currentBalance)}
          </span>
        </div>

        <div style={styles.chartContainer}>
          {forecast.daily.slice(0, 14).map((day, index) => (
            <div key={index} style={styles.chartBar}>
              <div
                style={{
                  ...styles.chartFill,
                  height: `${Math.min(100, (day.projectedBalance / forecast.currentBalance) * 100)}px`,
                  background: day.projectedBalance >= 0 
                    ? 'linear-gradient(180deg, #4ADE80 0%, #10B981 100%)'
                    : 'linear-gradient(180deg, #F87171 0%, #EF4444 100%)'
                }}
              />
              <span style={styles.chartLabel}>
                {new Date(day.date).getDate()}
              </span>
            </div>
          ))}
        </div>

        <div style={styles.forecastList}>
          {forecast.daily.slice(0, 7).map((day, index) => (
            <div key={index} style={styles.forecastItem}>
              <div style={styles.forecastItemLeft}>
                <span style={styles.forecastDate}>
                  {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </span>
                <span style={styles.forecastDayOfWeek}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][day.dayOfWeek]}
                </span>
              </div>
              <div style={styles.forecastItemRight}>
                <span style={{
                  ...styles.forecastAmount,
                  color: getMetricColor(day.projectedBalance)
                }}>
                  {formatCurrency(day.projectedBalance)}
                </span>
                <span style={styles.forecastChange}>
                  {day.projectedIncome > 0 && `+${formatCurrency(day.projectedIncome)} `}
                  {day.projectedExpenses > 0 && `-${formatCurrency(day.projectedExpenses)}`}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderMonthlyForecast = () => {
    if (!forecast || !forecast.monthly) return null;

    return (
      <div style={styles.forecastContainer}>
        <div style={styles.summaryCards}>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Projected Income</span>
            <span style={styles.summaryValue}>
              {formatCurrency(forecast.monthly.reduce((sum, m) => sum + m.projectedIncome, 0))}
            </span>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Projected Expenses</span>
            <span style={styles.summaryValue}>
              {formatCurrency(forecast.monthly.reduce((sum, m) => sum + m.projectedExpenses, 0))}
            </span>
          </div>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>Net Change</span>
            <span style={{
              ...styles.summaryValue,
              color: getMetricColor(forecast.monthly.reduce((sum, m) => sum + m.netChange, 0))
            }}>
              {formatCurrency(forecast.monthly.reduce((sum, m) => sum + m.netChange, 0))}
            </span>
          </div>
        </div>

        <div style={styles.forecastList}>
          {forecast.monthly.map((month, index) => (
            <div key={index} style={styles.forecastItem}>
              <div style={styles.forecastItemLeft}>
                <span style={styles.forecastDate}>
                  {new Date(month.date).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
                <div style={styles.confidenceBadge}>
                  <span style={styles.confidenceDot} style={{ backgroundColor: getConfidenceColor(month.confidence) }} />
                  <span style={styles.confidenceText}>{month.confidence.toFixed(0)}% confidence</span>
                </div>
              </div>
              <div style={styles.forecastItemRight}>
                <span style={styles.forecastAmount}>
                  {formatCurrency(month.projectedAssets)}
                </span>
                <button
                  style={styles.detailsButton}
                  onClick={() => setShowDetails(showDetails === index ? null : index)}
                >
                  {showDetails === index ? '▲' : '▼'}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderYearlyForecast = () => {
    if (!forecast || !forecast.yearly) return null;

    return (
      <div style={styles.forecastContainer}>
        <div style={styles.growthCard}>
          <span style={styles.growthLabel}>Projected 5-Year Growth</span>
          <span style={{
            ...styles.growthValue,
            color: forecast.yearly[forecast.yearly.length - 1].growth >= 0 ? '#4ADE80' : '#F87171'
          }}>
            {formatCurrency(forecast.yearly[forecast.yearly.length - 1].endBalance - forecast.yearly[0].startBalance)}
          </span>
        </div>

        <div style={styles.forecastList}>
          {forecast.yearly.map((year, index) => (
            <div key={index} style={styles.forecastItem}>
              <div style={styles.forecastItemLeft}>
                <span style={styles.forecastDate}>{year.year}</span>
                <span style={styles.forecastGrowth}>
                  {year.growth > 0 ? '+' : ''}{formatPercentage(year.growthPercentage)} growth
                </span>
              </div>
              <div style={styles.forecastItemRight}>
                <span style={styles.forecastAmount}>
                  {formatCurrency(year.endBalance)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderRecommendations = () => {
    if (!forecast || !forecast.recommendations || forecast.recommendations.length === 0) return null;

    return (
      <div style={styles.recommendationsSection}>
        <h3 style={styles.recommendationsTitle}>Smart Recommendations</h3>
        {forecast.recommendations.map((rec, index) => (
          <div key={index} style={{
            ...styles.recommendationCard,
            borderLeftColor: 
              rec.priority === 'high' ? '#EF4444' :
              rec.priority === 'medium' ? '#F59E0B' : '#3B82F6'
          }}>
            <span style={styles.recommendationIcon}>{rec.icon}</span>
            <div style={styles.recommendationContent}>
              <h4 style={styles.recommendationTitle}>{rec.title}</h4>
              <p style={styles.recommendationDescription}>{rec.description}</p>
              <p style={styles.recommendationAction}>💡 {rec.action}</p>
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div style={styles.container}>
      {renderTimeframeSelector()}
      {renderMetricSelector()}
      
      {timeframe === 'daily' && renderDailyForecast()}
      {timeframe === 'weekly' && renderMonthlyForecast()} {/* Simplified for now */}
      {timeframe === 'monthly' && renderMonthlyForecast()}
      {timeframe === 'yearly' && renderYearlyForecast()}
      
      {renderRecommendations()}
    </div>
  );
};

const styles = {
  container: {
    width: '100%',
    maxWidth: '800px',
    margin: '0 auto',
    padding: '1rem'
  },
  timeframeSelector: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1rem',
    padding: '0.25rem',
    background: '#1F2937',
    borderRadius: '0.5rem',
    border: '1px solid #374151'
  },
  timeframeButton: {
    flex: 1,
    padding: '0.5rem',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    fontWeight: '500',
    cursor: 'pointer',
    borderRadius: '0.375rem',
    transition: 'all 0.2s ease'
  },
  activeTimeframe: {
    background: '#3B82F6',
    color: 'white'
  },
  metricSelector: {
    display: 'flex',
    gap: '0.5rem',
    marginBottom: '1.5rem',
    padding: '0.25rem',
    background: '#1F2937',
    borderRadius: '0.5rem',
    border: '1px solid #374151'
  },
  metricButton: {
    flex: 1,
    padding: '0.5rem',
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '0.875rem',
    cursor: 'pointer',
    borderRadius: '0.375rem'
  },
  activeMetric: {
    background: '#10B981',
    color: 'white'
  },
  forecastContainer: {
    background: '#1F2937',
    borderRadius: '0.75rem',
    padding: '1.5rem',
    border: '1px solid #374151',
    marginBottom: '1.5rem'
  },
  currentBalance: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    background: '#111827',
    borderRadius: '0.5rem',
    marginBottom: '1.5rem'
  },
  balanceLabel: {
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  balanceValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white'
  },
  chartContainer: {
    display: 'flex',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: '120px',
    marginBottom: '1rem',
    padding: '0.5rem 0'
  },
  chartBar: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    height: '100%',
    margin: '0 2px'
  },
  chartFill: {
    width: '100%',
    minHeight: '4px',
    borderRadius: '2px 2px 0 0',
    transition: 'height 0.3s ease'
  },
  chartLabel: {
    marginTop: '4px',
    fontSize: '0.7rem',
    color: '#9CA3AF'
  },
  summaryCards: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1rem',
    marginBottom: '1.5rem'
  },
  summaryCard: {
    padding: '1rem',
    background: '#111827',
    borderRadius: '0.5rem',
    textAlign: 'center'
  },
  summaryLabel: {
    display: 'block',
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem'
  },
  summaryValue: {
    fontSize: '1.1rem',
    fontWeight: 'bold',
    color: 'white'
  },
  forecastList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem'
  },
  forecastItem: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0.75rem',
    background: '#111827',
    borderRadius: '0.5rem',
    border: '1px solid #374151'
  },
  forecastItemLeft: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem'
  },
  forecastDate: {
    fontSize: '0.95rem',
    fontWeight: '500',
    color: 'white'
  },
  forecastDayOfWeek: {
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  forecastItemRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  forecastAmount: {
    fontSize: '1rem',
    fontWeight: '600'
  },
  forecastChange: {
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  forecastGrowth: {
    fontSize: '0.75rem',
    color: '#4ADE80'
  },
  confidenceBadge: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.25rem'
  },
  confidenceDot: {
    width: '8px',
    height: '8px',
    borderRadius: '50%'
  },
  confidenceText: {
    fontSize: '0.7rem',
    color: '#9CA3AF'
  },
  detailsButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '0.8rem',
    cursor: 'pointer',
    padding: '0.25rem 0.5rem',
    borderRadius: '0.25rem'
  },
  growthCard: {
    padding: '1.5rem',
    background: 'linear-gradient(135deg, #065f46 0%, #047857 100%)',
    borderRadius: '0.5rem',
    textAlign: 'center',
    marginBottom: '1.5rem'
  },
  growthLabel: {
    display: 'block',
    fontSize: '0.875rem',
    color: 'rgba(255,255,255,0.8)',
    marginBottom: '0.5rem'
  },
  growthValue: {
    fontSize: '2rem',
    fontWeight: 'bold',
    color: 'white'
  },
  recommendationsSection: {
    marginTop: '2rem'
  },
  recommendationsTitle: {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '1rem'
  },
  recommendationCard: {
    display: 'flex',
    gap: '1rem',
    padding: '1rem',
    background: '#1F2937',
    borderRadius: '0.5rem',
    border: '1px solid #374151',
    borderLeftWidth: '4px',
    marginBottom: '0.75rem'
  },
  recommendationIcon: {
    fontSize: '1.5rem'
  },
  recommendationContent: {
    flex: 1
  },
  recommendationTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    color: 'white',
    margin: '0 0 0.25rem 0'
  },
  recommendationDescription: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    margin: '0 0 0.5rem 0'
  },
  recommendationAction: {
    fontSize: '0.875rem',
    color: '#3B82F6',
    margin: 0
  }
};

export default ForecastView;