// src/views/ValidationView.jsx
import React, { useState, useEffect } from 'react';
import ValidationService from '../services/forecast/validationService.cjs';

const ValidationView = () => {
    const [accuracySummary, setAccuracySummary] = useState(null);
    const [trends, setTrends] = useState([]);
    const [categoryAccuracy, setCategoryAccuracy] = useState([]);
    const [confidenceScore, setConfidenceScore] = useState(null);
    const [errorPatterns, setErrorPatterns] = useState(null);
    const [loading, setLoading] = useState(true);
    const [userId, setUserId] = useState(2);
    const [selectedView, setSelectedView] = useState('overview');

    useEffect(() => {
        loadValidationData();
    }, []);

    const loadValidationData = async () => {
        setLoading(true);
        try {
            const userResult = await window.electronAPI.getCurrentUser();
            const currentUserId = userResult?.success ? userResult.data.id : userId;
            
            const validationService = new ValidationService();
            
            // Load all validation data
            const [summary, trendsData, categoryData, confidence, patterns] = await Promise.all([
                validationService.getAccuracySummary(currentUserId),
                validationService.getAccuracyTrends(currentUserId, 12),
                validationService.getCategoryAccuracy(currentUserId),
                validationService.calculateConfidenceScore(currentUserId),
                validationService.analyzeErrorPatterns(currentUserId)
            ]);

            setAccuracySummary(summary);
            setTrends(trendsData || []);
            setCategoryAccuracy(categoryData || []);
            setConfidenceScore(confidence);
            setErrorPatterns(patterns);
        } catch (error) {
            console.error('Error loading validation data:', error);
        } finally {
            setLoading(false);
        }
    };

    const formatPercentage = (value) => {
        return `${Math.round(value || 0)}%`;
    };

    const getConfidenceColor = (level) => {
        switch(level) {
            case 'high': return '#4ADE80';
            case 'medium': return '#F59E0B';
            case 'low': return '#F87171';
            default: return '#9CA3AF';
        }
    };

    if (loading) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.loadingSpinner}></div>
                <p>Analyzing forecast accuracy...</p>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <h1 style={styles.title}>📊 Forecast Validation</h1>
            <p style={styles.subtitle}>
                Track how well your forecasts match reality and improve prediction accuracy
            </p>

            {/* View Selector */}
            <div style={styles.viewSelector}>
                <button
                    style={{
                        ...styles.viewButton,
                        ...(selectedView === 'overview' ? styles.activeView : {})
                    }}
                    onClick={() => setSelectedView('overview')}
                >
                    Overview
                </button>
                <button
                    style={{
                        ...styles.viewButton,
                        ...(selectedView === 'trends' ? styles.activeView : {})
                    }}
                    onClick={() => setSelectedView('trends')}
                >
                    Trends
                </button>
                <button
                    style={{
                        ...styles.viewButton,
                        ...(selectedView === 'categories' ? styles.activeView : {})
                    }}
                    onClick={() => setSelectedView('categories')}
                >
                    Categories
                </button>
                <button
                    style={{
                        ...styles.viewButton,
                        ...(selectedView === 'patterns' ? styles.activeView : {})
                    }}
                    onClick={() => setSelectedView('patterns')}
                >
                    Error Patterns
                </button>
            </div>

            {/* Overview View */}
            {selectedView === 'overview' && (
                <>
                    {/* Confidence Score Card */}
                    {confidenceScore && (
                        <div style={styles.confidenceCard}>
                            <div style={styles.confidenceHeader}>
                                <span style={styles.confidenceTitle}>Prediction Confidence</span>
                                <span style={{
                                    ...styles.confidenceLevel,
                                    color: getConfidenceColor(confidenceScore.level)
                                }}>
                                    {confidenceScore.level.toUpperCase()}
                                </span>
                            </div>
                            <div style={styles.confidenceScore}>
                                <span style={styles.confidenceValue}>{confidenceScore.score}%</span>
                                <span style={styles.confidenceMessage}>{confidenceScore.message}</span>
                            </div>
                            <div style={styles.confidenceDetails}>
                                <span>Based on {confidenceScore.dataPoints} historical predictions</span>
                            </div>
                        </div>
                    )}

                    {/* Summary Cards */}
                    {accuracySummary && (
                        <div style={styles.summaryGrid}>
                            <div style={styles.summaryCard}>
                                <span style={styles.summaryLabel}>Overall Accuracy</span>
                                <span style={styles.summaryValue}>
                                    {formatPercentage(accuracySummary.overall_accuracy)}
                                </span>
                                <span style={styles.summarySubtext}>
                                    from {accuracySummary.total_predictions} predictions
                                </span>
                            </div>
                            <div style={styles.summaryCard}>
                                <span style={styles.summaryLabel}>Best Accuracy</span>
                                <span style={styles.summaryValue}>
                                    {formatPercentage(accuracySummary.best_accuracy)}
                                </span>
                            </div>
                            <div style={styles.summaryCard}>
                                <span style={styles.summaryLabel}>Worst Accuracy</span>
                                <span style={styles.summaryValue}>
                                    {formatPercentage(accuracySummary.worst_accuracy)}
                                </span>
                            </div>
                            <div style={styles.summaryCard}>
                                <span style={styles.summaryLabel}>Excellent Predictions</span>
                                <span style={styles.summaryValue}>
                                    {accuracySummary.excellent_predictions || 0}
                                </span>
                                <span style={styles.summarySubtext}>
                                    ≥90% accuracy
                                </span>
                            </div>
                        </div>
                    )}

                    {/* Quick Stats */}
                    <div style={styles.statsSection}>
                        <h3 style={styles.sectionTitle}>Quick Stats</h3>
                        <div style={styles.statsGrid}>
                            <div style={styles.statItem}>
                                <span style={styles.statLabel}>Average Error Rate</span>
                                <span style={styles.statValue}>
                                    {errorPatterns ? formatPercentage(errorPatterns.averageError) : 'N/A'}
                                </span>
                            </div>
                            <div style={styles.statItem}>
                                <span style={styles.statLabel}>Over-estimate Bias</span>
                                <span style={styles.statValue}>
                                    {errorPatterns ? errorPatterns.bias.over : 0} times
                                </span>
                            </div>
                            <div style={styles.statItem}>
                                <span style={styles.statLabel}>Under-estimate Bias</span>
                                <span style={styles.statValue}>
                                    {errorPatterns ? errorPatterns.bias.under : 0} times
                                </span>
                            </div>
                            <div style={styles.statItem}>
                                <span style={styles.statLabel}>Exact Predictions</span>
                                <span style={styles.statValue}>
                                    {errorPatterns ? errorPatterns.bias.exact : 0} times
                                </span>
                            </div>
                        </div>
                    </div>
                </>
            )}

            {/* Trends View */}
            {selectedView === 'trends' && (
                <div style={styles.trendsSection}>
                    <h3 style={styles.sectionTitle}>Accuracy Trends Over Time</h3>
                    {trends.length > 0 ? (
                        <div style={styles.trendsList}>
                            {trends.map((trend, index) => (
                                <div key={index} style={styles.trendItem}>
                                    <div style={styles.trendHeader}>
                                        <span style={styles.trendMonth}>{trend.month}</span>
                                        <span style={styles.trendAccuracy}>
                                            {formatPercentage(trend.avg_accuracy)}
                                        </span>
                                    </div>
                                    <div style={styles.trendBar}>
                                        <div style={{
                                            ...styles.trendBarFill,
                                            width: `${trend.avg_accuracy}%`,
                                            backgroundColor: trend.avg_accuracy >= 90 ? '#4ADE80' :
                                                           trend.avg_accuracy >= 70 ? '#F59E0B' : '#F87171'
                                        }} />
                                    </div>
                                    <div style={styles.trendStats}>
                                        <span>{trend.predictions_count} predictions</span>
                                        <span>Range: {formatPercentage(trend.min_accuracy)} - {formatPercentage(trend.max_accuracy)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={styles.noData}>No trend data available</p>
                    )}
                </div>
            )}

            {/* Categories View */}
            {selectedView === 'categories' && (
                <div style={styles.categoriesSection}>
                    <h3 style={styles.sectionTitle}>Category Accuracy</h3>
                    {categoryAccuracy.length > 0 ? (
                        <div style={styles.categoriesList}>
                            {categoryAccuracy.map((cat, index) => (
                                <div key={index} style={styles.categoryItem}>
                                    <div style={styles.categoryHeader}>
                                        <div>
                                            <span style={styles.categoryName}>{cat.category_name}</span>
                                            <span style={styles.categoryGroup}>{cat.group_name}</span>
                                        </div>
                                        <span style={{
                                            ...styles.categoryScore,
                                            color: cat.avg_accuracy >= 90 ? '#4ADE80' :
                                                   cat.avg_accuracy >= 70 ? '#F59E0B' : '#F87171'
                                        }}>
                                            {formatPercentage(cat.avg_accuracy)}
                                        </span>
                                    </div>
                                    <div style={styles.categoryStats}>
                                        <span>{cat.predictions_count} predictions</span>
                                        <span>Volatility: {formatPercentage(cat.accuracy_volatility)}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p style={styles.noData}>No category accuracy data available</p>
                    )}
                </div>
            )}

            {/* Error Patterns View */}
            {selectedView === 'patterns' && errorPatterns && (
                <div style={styles.patternsSection}>
                    <h3 style={styles.sectionTitle}>Error Pattern Analysis</h3>
                    
                    {/* Bias Chart */}
                    <div style={styles.patternCard}>
                        <h4 style={styles.patternTitle}>Prediction Bias</h4>
                        <div style={styles.biasChart}>
                            <div style={styles.biasBar}>
                                <div style={{
                                    ...styles.biasFill,
                                    width: `${(errorPatterns.bias.over / (errorPatterns.bias.over + errorPatterns.bias.under + errorPatterns.bias.exact)) * 100}%`,
                                    backgroundColor: '#F87171'
                                }} />
                                <span style={styles.biasLabel}>Over</span>
                            </div>
                            <div style={styles.biasBar}>
                                <div style={{
                                    ...styles.biasFill,
                                    width: `${(errorPatterns.bias.under / (errorPatterns.bias.over + errorPatterns.bias.under + errorPatterns.bias.exact)) * 100}%`,
                                    backgroundColor: '#60A5FA'
                                }} />
                                <span style={styles.biasLabel}>Under</span>
                            </div>
                            <div style={styles.biasBar}>
                                <div style={{
                                    ...styles.biasFill,
                                    width: `${(errorPatterns.bias.exact / (errorPatterns.bias.over + errorPatterns.bias.under + errorPatterns.bias.exact)) * 100}%`,
                                    backgroundColor: '#4ADE80'
                                }} />
                                <span style={styles.biasLabel}>Exact</span>
                            </div>
                        </div>
                    </div>

                    {/* Best/Worst Months */}
                    {errorPatterns.bestMonth && errorPatterns.worstMonth && (
                        <div style={styles.monthPatterns}>
                            <div style={styles.bestMonth}>
                                <span style={styles.monthIcon}>✅</span>
                                <div>
                                    <span style={styles.monthLabel}>Most Accurate Month</span>
                                    <span style={styles.monthValue}>
                                        {new Date(2024, parseInt(errorPatterns.bestMonth) - 1).toLocaleString('default', { month: 'long' })}
                                    </span>
                                </div>
                            </div>
                            <div style={styles.worstMonth}>
                                <span style={styles.monthIcon}>⚠️</span>
                                <div>
                                    <span style={styles.monthLabel}>Least Accurate Month</span>
                                    <span style={styles.monthValue}>
                                        {new Date(2024, parseInt(errorPatterns.worstMonth) - 1).toLocaleString('default', { month: 'long' })}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Recommendations */}
                    <div style={styles.recommendationsCard}>
                        <h4 style={styles.recommendationsTitle}>💡 Recommendations</h4>
                        <ul style={styles.recommendationsList}>
                            {errorPatterns.averageError > 20 && (
                                <li>Consider reviewing categories with high error rates</li>
                            )}
                            {errorPatterns.bias.over > errorPatterns.bias.under && (
                                <li>You tend to over-estimate - try more conservative predictions</li>
                            )}
                            {errorPatterns.bias.under > errorPatterns.bias.over && (
                                <li>You tend to under-estimate - check for hidden expenses</li>
                            )}
                            {errorPatterns.bestMonth && (
                                <li>Your forecasts are most accurate in {new Date(2024, parseInt(errorPatterns.bestMonth) - 1).toLocaleString('default', { month: 'long' })}</li>
                            )}
                        </ul>
                    </div>
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
    viewSelector: {
        display: 'flex',
        gap: '0.5rem',
        marginBottom: '2rem',
        padding: '0.25rem',
        background: '#1F2937',
        borderRadius: '0.5rem',
        border: '1px solid #374151'
    },
    viewButton: {
        flex: 1,
        padding: '0.5rem',
        background: 'none',
        border: 'none',
        color: '#9CA3AF',
        borderRadius: '0.375rem',
        cursor: 'pointer',
        transition: 'all 0.2s ease'
    },
    activeView: {
        background: '#3B82F6',
        color: 'white'
    },
    confidenceCard: {
        background: '#1F2937',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        marginBottom: '2rem',
        border: '1px solid #374151'
    },
    confidenceHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '1rem'
    },
    confidenceTitle: {
        fontSize: '1.1rem',
        fontWeight: '600'
    },
    confidenceLevel: {
        fontSize: '0.875rem',
        fontWeight: '600'
    },
    confidenceScore: {
        marginBottom: '0.5rem'
    },
    confidenceValue: {
        fontSize: '2rem',
        fontWeight: 'bold',
        marginRight: '0.5rem'
    },
    confidenceMessage: {
        fontSize: '0.95rem',
        color: '#9CA3AF'
    },
    confidenceDetails: {
        fontSize: '0.875rem',
        color: '#6B7280'
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
    summarySubtext: {
        display: 'block',
        fontSize: '0.75rem',
        color: '#6B7280',
        marginTop: '0.25rem'
    },
    statsSection: {
        background: '#1F2937',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        border: '1px solid #374151'
    },
    sectionTitle: {
        fontSize: '1.1rem',
        fontWeight: '600',
        marginBottom: '1rem',
        color: 'white'
    },
    statsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '1rem'
    },
    statItem: {
        padding: '0.75rem',
        background: '#111827',
        borderRadius: '0.5rem'
    },
    statLabel: {
        display: 'block',
        fontSize: '0.75rem',
        color: '#9CA3AF',
        marginBottom: '0.25rem'
    },
    statValue: {
        fontSize: '1.1rem',
        fontWeight: '600',
        color: 'white'
    },
    trendsSection: {
        background: '#1F2937',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        border: '1px solid #374151'
    },
    trendsList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem'
    },
    trendItem: {
        padding: '0.75rem',
        background: '#111827',
        borderRadius: '0.5rem'
    },
    trendHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '0.5rem'
    },
    trendMonth: {
        fontWeight: '500'
    },
    trendAccuracy: {
        fontWeight: '600',
        color: '#4ADE80'
    },
    trendBar: {
        height: '8px',
        background: '#374151',
        borderRadius: '4px',
        marginBottom: '0.5rem',
        overflow: 'hidden'
    },
    trendBarFill: {
        height: '100%',
        borderRadius: '4px',
        transition: 'width 0.3s ease'
    },
    trendStats: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.75rem',
        color: '#9CA3AF'
    },
    categoriesSection: {
        background: '#1F2937',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        border: '1px solid #374151'
    },
    categoriesList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem'
    },
    categoryItem: {
        padding: '0.75rem',
        background: '#111827',
        borderRadius: '0.5rem'
    },
    categoryHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '0.5rem'
    },
    categoryName: {
        fontWeight: '600',
        marginRight: '0.5rem'
    },
    categoryGroup: {
        fontSize: '0.75rem',
        color: '#9CA3AF'
    },
    categoryScore: {
        fontWeight: '600'
    },
    categoryStats: {
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '0.75rem',
        color: '#9CA3AF'
    },
    patternsSection: {
        background: '#1F2937',
        borderRadius: '0.75rem',
        padding: '1.5rem',
        border: '1px solid #374151'
    },
    patternCard: {
        marginBottom: '1.5rem'
    },
    patternTitle: {
        fontSize: '1rem',
        fontWeight: '600',
        marginBottom: '1rem',
        color: '#9CA3AF'
    },
    biasChart: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
    },
    biasBar: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem'
    },
    biasFill: {
        height: '24px',
        borderRadius: '4px',
        transition: 'width 0.3s ease'
    },
    biasLabel: {
        fontSize: '0.875rem',
        color: '#9CA3AF',
        minWidth: '40px'
    },
    monthPatterns: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '1rem',
        marginBottom: '1.5rem'
    },
    bestMonth: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '1rem',
        background: '#065f46',
        borderRadius: '0.5rem'
    },
    worstMonth: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '1rem',
        background: '#7F1D1D',
        borderRadius: '0.5rem'
    },
    monthIcon: {
        fontSize: '1.5rem'
    },
    monthLabel: {
        display: 'block',
        fontSize: '0.75rem',
        color: '#9CA3AF',
        marginBottom: '0.25rem'
    },
    monthValue: {
        fontSize: '0.95rem',
        fontWeight: '600'
    },
    recommendationsCard: {
        padding: '1rem',
        background: '#111827',
        borderRadius: '0.5rem',
        border: '1px solid #3B82F6'
    },
    recommendationsTitle: {
        fontSize: '1rem',
        fontWeight: '600',
        marginBottom: '0.75rem',
        color: '#3B82F6'
    },
    recommendationsList: {
        margin: 0,
        paddingLeft: '1.5rem',
        color: '#9CA3AF'
    },
    noData: {
        textAlign: 'center',
        color: '#9CA3AF',
        padding: '2rem'
    }
};

export default ValidationView;