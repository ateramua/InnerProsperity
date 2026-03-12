// src/views/ReflectsView.jsx
import React from 'react';

const ReflectsView = () => {
  // Sample data for the pie chart (will be replaced with real data later)
  const sampleData = [
    { category: 'Housing', amount: 1500, color: '#3B82F6' },
    { category: 'Food', amount: 800, color: '#10B981' },
    { category: 'Transport', amount: 400, color: '#F59E0B' },
    { category: 'Utilities', amount: 300, color: '#8B5CF6' },
    { category: 'Entertainment', amount: 200, color: '#EC4899' },
    { category: 'Other', amount: 300, color: '#6B7280' }
  ];

  const totalBudget = sampleData.reduce((sum, item) => sum + item.amount, 0);

  return (
    <div style={styles.container}>
      <h1 style={styles.title}>Reflects</h1>
      <p style={styles.description}>Pie chart visualization of your budget allocation</p>
      
      <div style={styles.chartContainer}>
        {/* Pie Chart Placeholder */}
        <div style={styles.pieChartPlaceholder}>
          <div style={styles.pieChart}>
            {/* This is a CSS-based pie chart placeholder */}
            <div style={styles.pieInner}>
              <span style={styles.pieTotal}>${totalBudget}</span>
            </div>
          </div>
          <p style={styles.chartNote}>Interactive pie chart coming soon!</p>
        </div>

        {/* Legend */}
        <div style={styles.legend}>
          <h3 style={styles.legendTitle}>Budget Categories</h3>
          {sampleData.map((item, index) => (
            <div key={index} style={styles.legendItem}>
              <div style={{
                ...styles.legendColor,
                backgroundColor: item.color
              }} />
              <span style={styles.legendLabel}>{item.category}</span>
              <span style={styles.legendValue}>
                ${item.amount} ({Math.round((item.amount / totalBudget) * 100)}%)
              </span>
            </div>
          ))}
          <div style={styles.legendTotal}>
            <span style={styles.legendTotalLabel}>Total Budget:</span>
            <span style={styles.legendTotalValue}>${totalBudget}</span>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={styles.summaryGrid}>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Total Budgeted</div>
          <div style={styles.summaryValue}>${totalBudget}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Categories</div>
          <div style={styles.summaryValue}>{sampleData.length}</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Largest Category</div>
          <div style={styles.summaryValue}>Housing ($1500)</div>
        </div>
        <div style={styles.summaryCard}>
          <div style={styles.summaryLabel}>Average per Category</div>
          <div style={styles.summaryValue}>${Math.round(totalBudget / sampleData.length)}</div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    width: '100%'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    marginBottom: '0.5rem',
    color: 'white'
  },
  description: {
    fontSize: '1rem',
    color: '#9CA3AF',
    marginBottom: '2rem'
  },
  chartContainer: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '2rem',
    marginBottom: '2rem',
    background: '#1F2937',
    borderRadius: '0.75rem',
    padding: '2rem'
  },
  pieChartPlaceholder: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center'
  },
  pieChart: {
    width: '250px',
    height: '250px',
    borderRadius: '50%',
    background: 'conic-gradient(#3B82F6 0deg 216deg, #10B981 216deg 288deg, #F59E0B 288deg 324deg, #8B5CF6 324deg 360deg, #EC4899 360deg 0deg)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: '1rem',
    position: 'relative',
    boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
  },
  pieInner: {
    width: '150px',
    height: '150px',
    borderRadius: '50%',
    background: '#1F2937',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
  },
  pieTotal: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white'
  },
  chartNote: {
    color: '#9CA3AF',
    fontSize: '0.9rem',
    fontStyle: 'italic'
  },
  legend: {
    padding: '1rem'
  },
  legendTitle: {
    fontSize: '1.1rem',
    fontWeight: '600',
    color: 'white',
    marginBottom: '1rem'
  },
  legendItem: {
    display: 'flex',
    alignItems: 'center',
    padding: '0.5rem 0',
    borderBottom: '1px solid #374151'
  },
  legendColor: {
    width: '16px',
    height: '16px',
    borderRadius: '4px',
    marginRight: '0.75rem'
  },
  legendLabel: {
    flex: 1,
    color: '#F3F4F6'
  },
  legendValue: {
    color: '#9CA3AF',
    fontSize: '0.9rem'
  },
  legendTotal: {
    display: 'flex',
    justifyContent: 'space-between',
    marginTop: '1rem',
    paddingTop: '0.5rem',
    borderTop: '2px solid #374151',
    fontWeight: 'bold'
  },
  legendTotalLabel: {
    color: 'white'
  },
  legendTotalValue: {
    color: '#3B82F6'
  },
  summaryGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
    gap: '1rem',
    marginTop: '2rem'
  },
  summaryCard: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    borderLeft: '4px solid #3B82F6'
  },
  summaryLabel: {
    color: '#9CA3AF',
    fontSize: '0.875rem',
    marginBottom: '0.5rem'
  },
  summaryValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    color: 'white'
  }
};

export default ReflectsView;