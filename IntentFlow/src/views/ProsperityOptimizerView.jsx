// src/views/ProsperityOptimizerView.jsx
import React, { useState } from 'react';
import ProsperityOptimizer from '../services/prosperity/prosperityOptimizer.renderer.cjs';

const ProsperityOptimizerView = () => {
    const [optimization, setOptimization] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [userId] = useState(2); // Default user ID

    const runOptimization = async () => {
        setLoading(true);
        setError(null);
        
        try {
            const optimizer = new ProsperityOptimizer();
            
            // Get current user
            let currentUserId = userId;
            try {
                const userResult = await window.electronAPI.getCurrentUser();
                if (userResult?.success && userResult?.data) {
                    currentUserId = userResult.data.id;
                }
            } catch (userError) {
                console.warn('Could not get current user, using default:', userError);
            }
            
            // Sample income - in real app, this would come from your data
            const sampleIncome = 5000;
            
            const result = await optimizer.optimizeProsperityMap(currentUserId, sampleIncome);
            
            if (result.success) {
                setOptimization(result.data);
            } else {
                setError(result.error || 'Failed to optimize ProsperityMap');
            }
        } catch (error) {
            console.error('Error running optimization:', error);
            setError(error.message || 'An unexpected error occurred');
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

    const getPriorityColor = (priority) => {
        switch(priority) {
            case 1: return '#EF4444'; // Red - Essential
            case 2: return '#F59E0B'; // Orange - Debt
            case 3: return '#10B981'; // Green - Savings
            case 4: return '#3B82F6'; // Blue - Variable
            case 5: return '#8B5CF6'; // Purple - Discretionary
            default: return '#6B7280';
        }
    };

    const getPriorityLabel = (priority) => {
        switch(priority) {
            case 1: return 'Essential';
            case 2: return 'Debt';
            case 3: return 'Savings';
            case 4: return 'Variable';
            case 5: return 'Discretionary';
            default: return 'Other';
        }
    };

    return (
        <div style={styles.container}>
            <h1 style={styles.title}>🎯 ProsperityMap Optimizer</h1>
            <p style={styles.subtitle}>
                AI-powered recommendations to optimize your ProsperityMap allocation
            </p>

            <button 
                onClick={runOptimization} 
                style={{
                    ...styles.optimizeButton,
                    opacity: loading ? 0.7 : 1,
                    cursor: loading ? 'not-allowed' : 'pointer'
                }}
                disabled={loading}
            >
                {loading ? 'Optimizing...' : 'Run ProsperityMap Optimization'}
            </button>

            {error && (
                <div style={styles.errorContainer}>
                    <p style={styles.errorText}>❌ {error}</p>
                    <button onClick={runOptimization} style={styles.retryButton}>
                        Try Again
                    </button>
                </div>
            )}

            {optimization && (
                <div style={styles.results}>
                    {/* Summary */}
                    <div style={styles.summaryGrid}>
                        <div style={styles.summaryCard}>
                            <span style={styles.summaryLabel}>Total to Assign</span>
                            <span style={styles.summaryValue}>
                                {formatCurrency(optimization.totalAssigned)}
                            </span>
                        </div>
                        <div style={styles.summaryCard}>
                            <span style={styles.summaryLabel}>Remaining</span>
                            <span style={styles.summaryValue}>
                                {formatCurrency(optimization.remainingFunds)}
                            </span>
                        </div>
                    </div>

                    {/* Allocation by Priority */}
                    <div style={styles.section}>
                        <h2 style={styles.sectionTitle}>Priority-Based Allocation</h2>
                        {optimization.categories && optimization.categories.length > 0 ? (
                            [1,2,3,4,5].map(priority => {
                                const priorityAllocations = optimization.categories.filter(
                                    c => c.priority === priority
                                );
                                if (priorityAllocations.length === 0) return null;

                                const totalForPriority = priorityAllocations.reduce(
                                    (sum, c) => sum + c.amount, 0
                                );

                                return (
                                    <div key={priority} style={styles.priorityGroup}>
                                        <div style={{
                                            ...styles.priorityHeader,
                                            borderLeftColor: getPriorityColor(priority)
                                        }}>
                                            <span style={styles.priorityName}>
                                                {getPriorityLabel(priority)}
                                            </span>
                                            <span style={styles.priorityTotal}>
                                                {formatCurrency(totalForPriority)}
                                            </span>
                                        </div>
                                        {priorityAllocations.map((item, index) => (
                                            <div key={index} style={styles.allocationItem}>
                                                <div style={styles.allocationInfo}>
                                                    <span style={styles.categoryName}>
                                                        {item.categoryName || 'Unknown'}
                                                    </span>
                                                    <span style={styles.allocationReason}>
                                                        {item.reason || 'Allocation'}
                                                    </span>
                                                </div>
                                                <span style={styles.allocationAmount}>
                                                    +{formatCurrency(item.amount)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })
                        ) : (
                            <p style={styles.noData}>No allocation data available</p>
                        )}
                    </div>

                    {/* Recommendations */}
                    {optimization.recommendations && optimization.recommendations.length > 0 && (
                        <div style={styles.section}>
                            <h2 style={styles.sectionTitle}>💡 Prosperity Insights</h2>
                            {optimization.recommendations.map((rec, index) => (
                                <div key={index} style={{
                                    ...styles.recommendationCard,
                                    backgroundColor: rec.type === 'warning' ? '#7F1D1D20' :
                                                   rec.type === 'success' ? '#065f4620' :
                                                   rec.type === 'opportunity' ? '#1E3A8A20' :
                                                   '#1F2937'
                                }}>
                                    <span style={styles.recommendationIcon}>
                                        {rec.type === 'warning' ? '⚠️' :
                                         rec.type === 'success' ? '✅' :
                                         rec.type === 'opportunity' ? '💰' : '💡'}
                                    </span>
                                    <div style={styles.recommendationContent}>
                                        <p style={styles.recommendationMessage}>
                                            {rec.message || 'Recommendation'}
                                        </p>
                                        <p style={styles.recommendationAction}>
                                            {rec.action || 'Review your ProsperityMap'}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
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
    optimizeButton: {
        background: '#3B82F6',
        color: 'white',
        border: 'none',
        padding: '1rem 2rem',
        borderRadius: '0.5rem',
        fontSize: '1rem',
        fontWeight: '600',
        marginBottom: '2rem',
        transition: 'all 0.2s ease',
        ':hover': {
            background: '#2563EB'
        }
    },
    errorContainer: {
        padding: '1rem',
        background: '#7F1D1D',
        borderRadius: '0.5rem',
        marginBottom: '1rem',
        textAlign: 'center'
    },
    errorText: {
        color: '#F87171',
        marginBottom: '0.5rem'
    },
    retryButton: {
        background: '#EF4444',
        color: 'white',
        border: 'none',
        padding: '0.5rem 1rem',
        borderRadius: '0.25rem',
        cursor: 'pointer'
    },
    results: {
        marginTop: '2rem'
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
    priorityGroup: {
        marginBottom: '1.5rem'
    },
    priorityHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.75rem',
        background: '#111827',
        borderRadius: '0.5rem',
        marginBottom: '0.5rem',
        borderLeftWidth: '4px',
        borderLeftStyle: 'solid'
    },
    priorityName: {
        fontWeight: '600',
        color: 'white'
    },
    priorityTotal: {
        color: '#9CA3AF'
    },
    allocationItem: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0.5rem 0.75rem',
        borderBottom: '1px solid #374151'
    },
    allocationInfo: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.25rem'
    },
    categoryName: {
        fontSize: '0.95rem'
    },
    allocationReason: {
        fontSize: '0.75rem',
        color: '#9CA3AF'
    },
    allocationAmount: {
        color: '#4ADE80',
        fontWeight: '500'
    },
    noData: {
        textAlign: 'center',
        color: '#9CA3AF',
        padding: '2rem'
    },
    recommendationCard: {
        display: 'flex',
        gap: '1rem',
        padding: '1rem',
        borderRadius: '0.5rem',
        marginBottom: '0.75rem',
        border: '1px solid #374151'
    },
    recommendationIcon: {
        fontSize: '1.5rem'
    },
    recommendationContent: {
        flex: 1
    },
    recommendationMessage: {
        margin: '0 0 0.25rem 0',
        fontWeight: '500'
    },
    recommendationAction: {
        margin: 0,
        fontSize: '0.875rem',
        color: '#3B82F6'
    }
};

export default ProsperityOptimizerView;