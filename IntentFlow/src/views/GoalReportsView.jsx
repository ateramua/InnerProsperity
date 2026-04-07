import React, { useState } from 'react';

const GoalReportsView = ({ categories, formatCurrency, calculateTargetProgress }) => {
  const [selectedReport, setSelectedReport] = useState('overview');

  const getGoalStats = () => {
    const activeCategories = categories.filter(c => !c.archived);
    const categoriesWithGoals = activeCategories.filter(c => c.target_amount && c.target_amount > 0);
    
    const stats = {
      total: categoriesWithGoals.length,
      completed: 0,
      onTrack: 0,
      notStarted: 0,
      totalTargetAmount: 0,
      totalProgressAmount: 0,
      byType: {
        monthly: { count: 0, totalTarget: 0, progress: 0 },
        balance: { count: 0, totalTarget: 0, progress: 0 },
        by_date: { count: 0, totalTarget: 0, progress: 0 }
      }
    };

    categoriesWithGoals.forEach(cat => {
      const info = calculateTargetProgress(cat);
      stats.totalTargetAmount += info.targetAmount;
      stats.totalProgressAmount += info.currentAmount;

      if (info.status === 'funded' || info.status === 'completed') {
        stats.completed++;
      } else if (info.status === 'partial' || info.status === 'in-progress') {
        stats.onTrack++;
      } else if (info.status === 'unfunded' || info.status === 'not-started') {
        stats.notStarted++;
      }

      if (stats.byType[cat.target_type]) {
        stats.byType[cat.target_type].count++;
        stats.byType[cat.target_type].totalTarget += info.targetAmount;
        stats.byType[cat.target_type].progress += info.currentAmount;
      }
    });

    return stats;
  };

  const stats = getGoalStats();
  const overallProgress = stats.totalTargetAmount > 0 
    ? (stats.totalProgressAmount / stats.totalTargetAmount) * 100 
    : 0;

  return (
    <div style={styles.container}>
      <h3 style={styles.title}>🎯 Goal Progress</h3>
      <div style={styles.statsGrid}>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.total}</div>
          <div style={styles.statLabel}>Total Goals</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.completed}</div>
          <div style={styles.statLabel}>Completed</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.onTrack}</div>
          <div style={styles.statLabel}>On Track</div>
        </div>
        <div style={styles.statCard}>
          <div style={styles.statValue}>{stats.notStarted}</div>
          <div style={styles.statLabel}>Not Started</div>
        </div>
      </div>
      <div style={styles.progressCard}>
        <div style={styles.progressLabel}>Overall Progress</div>
        <div style={styles.progressBarContainer}>
          <div style={{ ...styles.progressBarFill, width: `${overallProgress}%`, backgroundColor: '#8B5CF6' }} />
        </div>
        <div style={styles.progressText}>{Math.round(overallProgress)}%</div>
        <div style={styles.progressDetails}>
          {formatCurrency(stats.totalProgressAmount)} of {formatCurrency(stats.totalTargetAmount)}
        </div>
      </div>
      <div style={styles.typeGrid}>
        <div style={styles.typeCard}>
          <div>📅 Monthly</div>
          <div style={styles.typeCount}>{stats.byType.monthly.count}</div>
          <div style={styles.typePercent}>
            {stats.byType.monthly.totalTarget > 0 
              ? Math.round((stats.byType.monthly.progress / stats.byType.monthly.totalTarget) * 100)
              : 0}%
          </div>
        </div>
        <div style={styles.typeCard}>
          <div>🏦 Balance</div>
          <div style={styles.typeCount}>{stats.byType.balance.count}</div>
          <div style={styles.typePercent}>
            {stats.byType.balance.totalTarget > 0 
              ? Math.round((stats.byType.balance.progress / stats.byType.balance.totalTarget) * 100)
              : 0}%
          </div>
        </div>
        <div style={styles.typeCard}>
          <div>⏰ Date</div>
          <div style={styles.typeCount}>{stats.byType.by_date.count}</div>
          <div style={styles.typePercent}>
            {stats.byType.by_date.totalTarget > 0 
              ? Math.round((stats.byType.by_date.progress / stats.byType.by_date.totalTarget) * 100)
              : 0}%
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    backgroundColor: '#1E3A8A',
    borderRadius: '12px',
    padding: '16px',
    marginBottom: '20px',
    border: '1px solid #334155'
  },
  title: {
    color: '#FFFFFF',
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '12px'
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
    marginBottom: '16px'
  },
  statCard: {
    backgroundColor: '#0F172A',
    borderRadius: '8px',
    padding: '10px',
    textAlign: 'center'
  },
  statValue: {
    fontSize: '20px',
    fontWeight: '700',
    color: '#60A5FA'
  },
  statLabel: {
    fontSize: '10px',
    color: '#94A3B8',
    marginTop: '4px'
  },
  progressCard: {
    backgroundColor: '#0F172A',
    borderRadius: '8px',
    padding: '12px',
    marginBottom: '16px',
    textAlign: 'center'
  },
  progressLabel: {
    fontSize: '12px',
    color: '#94A3B8',
    marginBottom: '8px'
  },
  progressBarContainer: {
    backgroundColor: '#1E3A8A',
    borderRadius: '10px',
    height: '8px',
    overflow: 'hidden',
    marginBottom: '8px'
  },
  progressBarFill: {
    height: '100%',
    transition: 'width 0.3s ease'
  },
  progressText: {
    fontSize: '14px',
    fontWeight: '600',
    color: '#8B5CF6',
    marginBottom: '4px'
  },
  progressDetails: {
    fontSize: '11px',
    color: '#94A3B8'
  },
  typeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '8px'
  },
  typeCard: {
    backgroundColor: '#0F172A',
    borderRadius: '8px',
    padding: '10px',
    textAlign: 'center',
    fontSize: '12px',
    color: '#94A3B8'
  },
  typeCount: {
    fontSize: '18px',
    fontWeight: '700',
    color: '#60A5FA',
    margin: '4px 0'
  },
  typePercent: {
    fontSize: '11px',
    color: '#4ADE80'
  }
};

export default GoalReportsView;
