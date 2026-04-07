import React, { useState } from 'react';

const GoalReportsView = ({ categories, formatCurrency, calculateTargetProgress }) => {
  const [selectedReport, setSelectedReport] = useState('overview');

  // Calculate goal statistics
  const getGoalStats = () => {
    const activeCategories = categories.filter(c => !c.archived);
    const categoriesWithGoals = activeCategories.filter(c => c.target_amount && c.target_amount > 0);
    
    const stats = {
      total: categoriesWithGoals.length,
      completed: 0,
      onTrack: 0,
      behind: 0,
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

  const getNeedsAttention = () => {
    return categories.filter(cat => {
      if (cat.archived || !cat.target_amount) return false;
      const info = calculateTargetProgress(cat);
      return info.status === 'partial' || info.status === 'unfunded' || (cat.available || 0) < 0;
    }).slice(0, 5);
  };

  const stats = getGoalStats();
  const needsAttention = getNeedsAttention();
  const overallProgress = stats.totalTargetAmount > 0 
    ? (stats.totalProgressAmount / stats.totalTargetAmount) * 100 
    : 0;

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h3 style={styles.title}>🎯 Goal Progress</h3>
        <div style={styles.tabBar}>
          <button 
            onClick={() => setSelectedReport('overview')}
            style={{ ...styles.tab, ...(selectedReport === 'overview' ? styles.activeTab : {}) }}
          >
            Overview
          </button>
          <button 
            onClick={() => setSelectedReport('attention')}
            style={{ ...styles.tab, ...(selectedReport === 'attention' ? styles.activeTab : {}) }}
          >
            Needs Attention
          </button>
        </div>
      </div>

      {selectedReport === 'overview' && (
        <div>
          <div style={styles.statsGrid}>
            <div style={styles.statCard}>
              <div style={styles.statValue}>{stats.total}</div>
              <div style={styles.statLabel}>Active Goals</div>
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
              <div style={{ ...styles.progressBarFill, width: `${overallProgress}%` }} />
            </div>
            <div style={styles.progressText}>{Math.round(overallProgress)}% Complete</div>
            <div style={styles.progressDetails}>
              {formatCurrency(stats.totalProgressAmount)} of {formatCurrency(stats.totalTargetAmount)}
            </div>
          </div>

          <div style={styles.typeGrid}>
            <div style={styles.typeCard}>
              <div>📅 Monthly</div>
              <div style={styles.typeCount}>{stats.byType.monthly.count}</div>
              <div style={styles.typeProgress}>
                {stats.byType.monthly.totalTarget > 0 
                  ? Math.round((stats.byType.monthly.progress / stats.byType.monthly.totalTarget) * 100)
                  : 0}%
              </div>
            </div>
            <div style={styles.typeCard}>
              <div>🏦 Balance</div>
              <div style={styles.typeCount}>{stats.byType.balance.count}</div>
              <div style={styles.typeProgress}>
                {stats.byType.balance.totalTarget > 0 
                  ? Math.round((stats.byType.balance.progress / stats.byType.balance.totalTarget) * 100)
                  : 0}%
              </div>
            </div>
            <div style={styles.typeCard}>
              <div>⏰ Date</div>
              <div style={styles.typeCount}>{stats.byType.by_date.count}</div>
              <div style={styles.typeProgress}>
                {stats.byType.by_date.totalTarget > 0 
                  ? Math.round((stats.byType.by_date.progress / stats.byType.by_date.totalTarget) * 100)
                  : 0}%
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedReport === 'attention' && needsAttention.length > 0 && (
        <div style={styles.attentionCard}>
          {needsAttention.map(cat => {
            const info = calculateTargetProgress(cat);
            return (
              <div key={cat.id} style={styles.attentionItem}>
                <div style={styles.attentionName}>{cat.name}</div>
                <div style={styles.attentionDetails}>
                  <span>Need: {formatCurrency(info.needed)}</span>
                  <span>{Math.round(info.progress)}%</span>
                </div>
                <div style={styles.smallProgressBar}>
                  <div style={{ ...styles.smallProgressFill, width: `${info.progress}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedReport === 'attention' && needsAttention.length === 0 && (
        <div style={styles.emptyState}>🎉 All goals are on track!</div>
      )}
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
  header: {
    marginBottom: '16px'
  },
  title: {
    color: '#FFFFFF',
    fontSize: '16px',
    fontWeight: '600',
    marginBottom: '12px'
  },
  tabBar: {
    display: 'flex',
    gap: '8px',
    borderBottom: '1px solid #334155',
    paddingBottom: '8px'
  },
  tab: {
    background: 'none',
    border: 'none',
    color: '#94A3B8',
    padding: '6px 12px',
    cursor: 'pointer',
    fontSize: '12px',
    borderRadius: '4px'
  },
  activeTab: {
    color: '#60A5FA',
    background: '#0F172A'
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
    backgroundColor: '#8B5CF6',
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
  typeProgress: {
    fontSize: '11px',
    color: '#4ADE80'
  },
  attentionCard: {
    backgroundColor: '#0F172A',
    borderRadius: '8px',
    padding: '8px'
  },
  attentionItem: {
    padding: '10px',
    borderBottom: '1px solid #334155'
  },
  attentionName: {
    color: '#FFFFFF',
    fontSize: '13px',
    fontWeight: '500',
    marginBottom: '6px'
  },
  attentionDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '11px',
    marginBottom: '6px',
    color: '#94A3B8'
  },
  smallProgressBar: {
    backgroundColor: '#1E3A8A',
    borderRadius: '4px',
    height: '4px',
    overflow: 'hidden'
  },
  smallProgressFill: {
    height: '100%',
    backgroundColor: '#F59E0B',
    transition: 'width 0.3s ease'
  },
  emptyState: {
    textAlign: 'center',
    padding: '20px',
    color: '#4ADE80',
    fontSize: '13px'
  }
};

export default GoalReportsView;