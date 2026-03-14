// src/views/CashFlowForecast.jsx
import React, { useState, useEffect } from 'react';

const CashFlowForecast = ({
    budgetData = { categories: [] },
    transactions = [],
    accounts = [],
    creditCards = [],
    loans = []
}) => {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [forecastData, setForecastData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [forecastPeriods, setForecastPeriods] = useState([
        { label: '1 Week', days: 7, enabled: true },
        { label: '2 Weeks', days: 14, enabled: true },
        { label: '1 Month', days: 30, enabled: true },
        { label: '3 Months', days: 90, enabled: true },
        { label: '6 Months', days: 180, enabled: true },
        { label: '1 Year', days: 365, enabled: true }
    ]);

    // Format currency helper
    const formatCurrency = (amount) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(amount || 0);
    };

    // Get color based on value
    const getValueColor = (value) => {
        if (value > 0) return '#4ADE80';
        if (value < 0) return '#F87171';
        return '#9CA3AF';
    };

    // Calculate historical patterns from actual data
    const calculatePatterns = () => {
        // Get last 3 months of transactions
        const now = new Date();
        const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1);

        const recentTransactions = transactions.filter(t =>
            new Date(t.date) >= threeMonthsAgo
        );

        // Calculate average monthly income
        const monthlyIncome = [];
        const monthlyExpenses = [];

        for (let i = 0; i < 3; i++) {
            const monthStart = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const monthEnd = new Date(now.getFullYear(), now.getMonth() - i + 1, 0);

            const monthTxs = recentTransactions.filter(t => {
                const tDate = new Date(t.date);
                return tDate >= monthStart && tDate <= monthEnd;
            });

            const income = monthTxs
                .filter(t => t.amount > 0)
                .reduce((sum, t) => sum + t.amount, 0);

            const expenses = monthTxs
                .filter(t => t.amount < 0)
                .reduce((sum, t) => sum + Math.abs(t.amount), 0);

            if (income > 0) monthlyIncome.push(income);
            if (expenses > 0) monthlyExpenses.push(expenses);
        }

        // Calculate averages
        const avgMonthlyIncome = monthlyIncome.length > 0
            ? monthlyIncome.reduce((a, b) => a + b, 0) / monthlyIncome.length
            : 0;

        const avgMonthlyExpenses = monthlyExpenses.length > 0
            ? monthlyExpenses.reduce((a, b) => a + b, 0) / monthlyExpenses.length
            : 0;

        // Calculate recurring bills (fixed expenses)
        const budgetCategories = budgetData.categories || [];
        const fixedExpenses = budgetCategories
            .filter(c => c.groupId === 'fixed' || (c.name && c.name.match(/rent|mortgage|utilities|insurance/i)))
            .reduce((sum, c) => sum + (c.assigned || 0), 0);

        // Calculate minimum debt payments
        const minCreditCardPayments = creditCards.reduce((sum, c) =>
            sum + (c.minimumPayment || Math.max(25, Math.abs(c.balance || 0) * 0.02)), 0);

        const minLoanPayments = loans.reduce((sum, l) =>
            sum + (l.monthlyPayment || 0), 0);

        return {
            avgMonthlyIncome,
            avgMonthlyExpenses,
            fixedExpenses,
            minDebtPayments: minCreditCardPayments + minLoanPayments,
            netMonthlyCashflow: avgMonthlyIncome - avgMonthlyExpenses,
            creditCardDebt: creditCards.reduce((sum, c) => sum + Math.abs(c.balance || 0), 0),
            loanDebt: loans.reduce((sum, l) => sum + Math.abs(l.balance || 0), 0)
        };
    };

    // Calculate forecast for a specific date
    const calculateForecastForDate = (targetDate, patterns, currentCash) => {
        const now = new Date();
        const daysDiff = Math.ceil((targetDate - now) / (1000 * 60 * 60 * 24));
        const monthsDiff = daysDiff / 30.44; // Average days per month

        // Projected cash = current cash + (net monthly cashflow * months)
        const projectedCash = currentCash + (patterns.netMonthlyCashflow * monthsDiff);

        // Calculate debt payoff progress
        const totalDebt = patterns.creditCardDebt + patterns.loanDebt;
        const debtPayoffMonths = patterns.netMonthlyCashflow > 0 && patterns.minDebtPayments > 0
            ? totalDebt / (patterns.netMonthlyCashflow + patterns.minDebtPayments)
            : Infinity;

        return {
            date: targetDate,
            daysFromNow: daysDiff,
            projectedCash,
            debtRemaining: Math.max(0, totalDebt - (patterns.netMonthlyCashflow * monthsDiff)),
            isDebtFree: (totalDebt - (patterns.netMonthlyCashflow * monthsDiff)) <= 0,
            confidence: calculateConfidence(daysDiff, patterns)
        };
    };

    // Calculate confidence score based on historical data reliability
    const calculateConfidence = (daysDiff, patterns) => {
        if (daysDiff <= 30) return 95; // High confidence for 1 month
        if (daysDiff <= 90) return 85;  // Good confidence for 3 months
        if (daysDiff <= 180) return 70; // Medium confidence for 6 months
        return 50; // Lower confidence beyond 6 months
    };

    // Generate forecast
    useEffect(() => {
        setLoading(true);

        try {
            const patterns = calculatePatterns();

            // Get current cash position
            const currentCash = accounts
                .filter(a => a.type === 'checking' || a.type === 'savings')
                .reduce((sum, a) => sum + (a.balance || 0), 0);

            // Calculate forecasts for each period
            const now = new Date();
            const forecasts = forecastPeriods
                .filter(p => p.enabled)
                .map(period => {
                    const targetDate = new Date(now);
                    targetDate.setDate(now.getDate() + period.days);
                    return {
                        ...period,
                        ...calculateForecastForDate(targetDate, patterns, currentCash)
                    };
                });

            // Calculate key milestones
            const totalDebt = patterns.creditCardDebt + patterns.loanDebt;
            const debtFreeDate = patterns.netMonthlyCashflow > 0
                ? new Date(now.getTime() + (totalDebt / patterns.netMonthlyCashflow) * 30.44 * 24 * 60 * 60 * 1000)
                : null;

            const oneYearCash = currentCash + (patterns.netMonthlyCashflow * 12);

            setForecastData({
                currentCash,
                patterns,
                forecasts,
                debtFreeDate,
                oneYearCash,
                totalDebt
            });

        } catch (error) {
            console.error('Error calculating forecast:', error);
        } finally {
            setLoading(false);
        }
    }, [selectedDate, transactions, accounts, creditCards, loans, budgetData]);

    if (loading || !forecastData) {
        return (
            <div style={styles.loadingContainer}>
                <div style={styles.spinner}></div>
                <p>Calculating your cash flow forecast...</p>
            </div>
        );
    }

    const patterns = forecastData.patterns;
    const hasPositiveCashflow = patterns.netMonthlyCashflow > 0;

    return (
        <div style={styles.container}>
            {/* Header */}
            <div style={styles.header}>
                <h1 style={styles.title}>📈 Cash Flow Forecaster</h1>
                <div style={styles.dateDisplay}>
                    {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                </div>
            </div>

            {/* Current Position Summary */}
            <div style={styles.summaryGrid}>
                <div style={styles.summaryCard}>
                    <div style={styles.summaryIcon}>💰</div>
                    <div style={styles.summaryContent}>
                        <span style={styles.summaryLabel}>Current Cash</span>
                        <span style={styles.summaryValue}>{formatCurrency(forecastData.currentCash)}</span>
                    </div>
                </div>
                <div style={styles.summaryCard}>
                    <div style={styles.summaryIcon}>📊</div>
                    <div style={styles.summaryContent}>
                        <span style={styles.summaryLabel}>Monthly Cashflow</span>
                        <span style={{
                            ...styles.summaryValue,
                            color: getValueColor(patterns.netMonthlyCashflow)
                        }}>
                            {formatCurrency(patterns.netMonthlyCashflow)}
                        </span>
                    </div>
                </div>
                <div style={styles.summaryCard}>
                    <div style={styles.summaryIcon}>💳</div>
                    <div style={styles.summaryContent}>
                        <span style={styles.summaryLabel}>Total Debt</span>
                        <span style={{ ...styles.summaryValue, color: '#F87171' }}>
                            {formatCurrency(forecastData.totalDebt)}
                        </span>
                    </div>
                </div>
                <div style={styles.summaryCard}>
                    <div style={styles.summaryIcon}>🎯</div>
                    <div style={styles.summaryContent}>
                        <span style={styles.summaryLabel}>1 Year Projection</span>
                        <span style={{
                            ...styles.summaryValue,
                            color: getValueColor(forecastData.oneYearCash - forecastData.currentCash)
                        }}>
                            {formatCurrency(forecastData.oneYearCash)}
                        </span>
                    </div>
                </div>
            </div>

            {/* Pattern Analysis */}
            <div style={styles.patternSection}>
                <h2 style={styles.sectionTitle}>📊 Your Financial Patterns</h2>
                <div style={styles.patternGrid}>
                    <div style={styles.patternItem}>
                        <span>Avg Monthly Income</span>
                        <strong style={{ color: '#4ADE80' }}>{formatCurrency(patterns.avgMonthlyIncome)}</strong>
                    </div>
                    <div style={styles.patternItem}>
                        <span>Avg Monthly Expenses</span>
                        <strong style={{ color: '#F87171' }}>{formatCurrency(patterns.avgMonthlyExpenses)}</strong>
                    </div>
                    <div style={styles.patternItem}>
                        <span>Fixed Expenses</span>
                        <strong>{formatCurrency(patterns.fixedExpenses)}</strong>
                    </div>
                    <div style={styles.patternItem}>
                        <span>Min Debt Payments</span>
                        <strong>{formatCurrency(patterns.minDebtPayments)}</strong>
                    </div>
                </div>
            </div>

            {/* Forecast Timeline */}
            <div style={styles.forecastSection}>
                <h2 style={styles.sectionTitle}>⏳ Projected Timeline</h2>

                {/* Progress Bar for Overall */}
                <div style={styles.timelineHeader}>
                    <span>Current Cash: {formatCurrency(forecastData.currentCash)}</span>
                    <span>1 Year Target: {formatCurrency(forecastData.oneYearCash)}</span>
                </div>
                <div style={styles.timelineProgress}>
                    <div style={{
                        ...styles.timelineFill,
                        width: `${Math.min(100, (forecastData.oneYearCash - forecastData.currentCash) / forecastData.currentCash * 100)}%`
                    }} />
                </div>

                {/* Forecast Cards */}
                <div style={styles.forecastGrid}>
                    {forecastData.forecasts.map((forecast, index) => {
                        const change = forecast.projectedCash - forecastData.currentCash;
                        const percentChange = (change / forecastData.currentCash) * 100;

                        return (
                            <div key={index} style={styles.forecastCard}>
                                <div style={styles.forecastHeader}>
                                    <span style={styles.forecastPeriod}>{forecast.label}</span>
                                    <span style={styles.forecastDate}>
                                        {forecast.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                    </span>
                                </div>

                                <div style={styles.forecastAmount}>
                                    {formatCurrency(forecast.projectedCash)}
                                </div>

                                <div style={styles.forecastChange}>
                                    <span style={{ color: getValueColor(change) }}>
                                        {change > 0 ? '+' : ''}{formatCurrency(change)}
                                    </span>
                                    <span style={styles.percentChange}>
                                        ({percentChange > 0 ? '+' : ''}{percentChange.toFixed(1)}%)
                                    </span>
                                </div>

                                {/* Visual Bar */}
                                <div style={styles.forecastBar}>
                                    <div style={{
                                        ...styles.forecastBarFill,
                                        width: `${Math.min(100, (forecast.projectedCash / forecastData.oneYearCash) * 100)}%`,
                                        background: change >= 0
                                            ? 'linear-gradient(90deg, #4ADE80, #10B981)'
                                            : 'linear-gradient(90deg, #F87171, #EF4444)'
                                    }} />
                                </div>

                                {/* Confidence Badge */}
                                <div style={styles.confidenceBadge}>
                                    <span style={{
                                        ...styles.confidenceDot,
                                        backgroundColor: forecast.confidence >= 80 ? '#4ADE80' :
                                            forecast.confidence >= 60 ? '#F59E0B' : '#F87171'
                                    }} />
                                    <span>{forecast.confidence}% confidence</span>
                                </div>

                                {/* Debt Info if applicable */}
                                {forecast.isDebtFree ? (
                                    <div style={styles.debtFreeBadge}>
                                        🎉 Debt Free!
                                    </div>
                                ) : (
                                    <div style={styles.debtRemaining}>
                                        Debt: {formatCurrency(forecast.debtRemaining)}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Key Milestones */}
            <div style={styles.milestonesSection}>
                <h2 style={styles.sectionTitle}>🎯 Key Milestones</h2>
                <div style={styles.milestonesGrid}>
                    {forecastData.debtFreeDate && (
                        <div style={styles.milestoneCard}>
                            <span style={styles.milestoneIcon}>🎉</span>
                            <div>
                                <h4 style={styles.milestoneTitle}>Debt Free Date</h4>
                                <p style={styles.milestoneDate}>
                                    {forecastData.debtFreeDate.toLocaleDateString('en-US', {
                                        month: 'long',
                                        year: 'numeric',
                                        day: 'numeric'
                                    })}
                                </p>
                                <p style={styles.milestoneNote}>
                                    Based on current cashflow of {formatCurrency(patterns.netMonthlyCashflow)}/month
                                </p>
                            </div>
                        </div>
                    )}

                    <div style={styles.milestoneCard}>
                        <span style={styles.milestoneIcon}>💰</span>
                        <div>
                            <h4 style={styles.milestoneTitle}>6 Month Cash</h4>
                            <p style={styles.milestoneAmount}>
                                {formatCurrency(forecastData.currentCash + (patterns.netMonthlyCashflow * 6))}
                            </p>
                        </div>
                    </div>

                    <div style={styles.milestoneCard}>
                        <span style={styles.milestoneIcon}>📈</span>
                        <div>
                            <h4 style={styles.milestoneTitle}>1 Year Growth</h4>
                            <p style={{
                                ...styles.milestoneAmount,
                                color: getValueColor(forecastData.oneYearCash - forecastData.currentCash)
                            }}>
                                {formatCurrency(forecastData.oneYearCash - forecastData.currentCash)}
                            </p>
                            <p style={styles.milestoneNote}>
                                Total: {formatCurrency(forecastData.oneYearCash)}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Insights */}
            <div style={styles.insightsSection}>
                <h2 style={styles.sectionTitle}>💡 Forecast Insights</h2>
                <div style={styles.insightsGrid}>
                    {hasPositiveCashflow ? (
                        <div style={styles.insightCard}>
                            <span style={styles.insightIcon}>✅</span>
                            <div>
                                <h4 style={styles.insightTitle}>Positive Trajectory</h4>
                                <p style={styles.insightText}>
                                    With your current cashflow of {formatCurrency(patterns.netMonthlyCashflow)}/month,
                                    you're on track to grow your cash by {formatCurrency(patterns.netMonthlyCashflow * 12)} in the next year.
                                </p>
                            </div>
                        </div>
                    ) : (
                        <div style={styles.insightCard}>
                            <span style={styles.insightIcon}>⚠️</span>
                            <div>
                                <h4 style={styles.insightTitle}>Negative Cashflow</h4>
                                <p style={styles.insightText}>
                                    Your expenses exceed income by {formatCurrency(Math.abs(patterns.netMonthlyCashflow))}/month.
                                    At this rate, you'll run out of cash in approximately{' '}
                                    {Math.floor(forecastData.currentCash / Math.abs(patterns.netMonthlyCashflow))} months.
                                </p>
                            </div>
                        </div>
                    )}

                    {forecastData.debtFreeDate && (
                        <div style={styles.insightCard}>
                            <span style={styles.insightIcon}>🎯</span>
                            <div>
                                <h4 style={styles.insightTitle}>Debt Freedom</h4>
                                <p style={styles.insightText}>
                                    You'll be debt-free by {forecastData.debtFreeDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}.
                                    That's {Math.ceil((forecastData.debtFreeDate - new Date()) / (1000 * 60 * 60 * 24 * 30))} months away!
                                </p>
                            </div>
                        </div>
                    )}

                    <div style={styles.insightCard}>
                        <span style={styles.insightIcon}>📊</span>
                        <div>
                            <h4 style={styles.insightTitle}>Savings Rate</h4>
                            <p style={styles.insightText}>
                                You're saving {((patterns.netMonthlyCashflow / patterns.avgMonthlyIncome) * 100).toFixed(1)}% of your income.
                                {patterns.netMonthlyCashflow / patterns.avgMonthlyIncome > 0.2
                                    ? ' Great job!'
                                    : ' Try to aim for 20%+'}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// Styles (reuse from CashFlowView with additions)
const styles = {
    container: {
        padding: '2rem',
        maxWidth: '1200px',
        margin: '0 auto',
        color: 'white'
    },
    loadingContainer: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '400px',
        color: '#9CA3AF'
    },
    spinner: {
        width: '40px',
        height: '40px',
        border: '3px solid #374151',
        borderTopColor: '#3B82F6',
        borderRadius: '50%',
        animation: 'spin 1s linear infinite',
        marginBottom: '1rem'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '2rem'
    },
    title: {
        fontSize: '2rem',
        fontWeight: 'bold',
        margin: 0,
        background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent'
    },
    dateDisplay: {
        fontSize: '1.1rem',
        color: '#9CA3AF',
        background: '#1F2937',
        padding: '0.5rem 1rem',
        borderRadius: '0.5rem'
    },
    summaryGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem',
        marginBottom: '2rem'
    },
    summaryCard: {
        background: '#1F2937',
        padding: '1.25rem',
        borderRadius: '0.75rem',
        border: '1px solid #374151',
        display: 'flex',
        alignItems: 'center',
        gap: '1rem',
        minWidth: 0, // Allows content to shrink
        overflow: 'hidden' // Prevents overflow
    },
    summaryIcon: {
        fontSize: '2rem',
        flexShrink: 0 // Prevents icon from shrinking
    },
    summaryContent: {
        flex: 1,
        minWidth: 0, // Allows text to shrink and wrap
        overflow: 'hidden'
    },
    summaryLabel: {
        fontSize: '0.75rem',
        color: '#9CA3AF',
        marginBottom: '0.25rem',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap', // Prevents label from wrapping
        overflow: 'hidden',
        textOverflow: 'ellipsis' // Adds ... if label is too long
    },
    summaryValue: {
        fontSize: '1.5rem',
        fontWeight: 'bold',
        whiteSpace: 'nowrap', // Keeps number on one line
        overflow: 'hidden',
        textOverflow: 'ellipsis', // Adds ... if number is too long
        display: 'block',
        width: '100%'
    },
    sectionTitle: {
        fontSize: '1.25rem',
        fontWeight: '600',
        margin: '0 0 1.5rem 0',
        color: 'white'
    },
    patternSection: {
        background: '#1F2937',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        border: '1px solid #374151',
        marginBottom: '2rem'
    },
    patternGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '1rem'
    },
    patternItem: {
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem',
        padding: '1rem',
        background: '#111827',
        borderRadius: '0.5rem'
    },
    forecastSection: {
        background: '#1F2937',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        border: '1px solid #374151',
        marginBottom: '2rem'
    },
    timelineHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '0.5rem',
        color: '#9CA3AF'
    },
    timelineProgress: {
        height: '8px',
        background: '#374151',
        borderRadius: '4px',
        marginBottom: '2rem',
        overflow: 'hidden'
    },
    timelineFill: {
        height: '100%',
        background: 'linear-gradient(90deg, #3B82F6, #8B5CF6)',
        borderRadius: '4px'
    },
    forecastGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1rem'
    },
    forecastCard: {
        background: '#111827',
        padding: '1.25rem',
        borderRadius: '0.75rem',
        border: '1px solid #374151'
    },
    forecastHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '0.75rem'
    },
    forecastPeriod: {
        fontSize: '1rem',
        fontWeight: '600',
        color: 'white'
    },
    forecastDate: {
        fontSize: '0.875rem',
        color: '#9CA3AF'
    },
    forecastAmount: {
        fontSize: '1.5rem',
        fontWeight: 'bold',
        marginBottom: '0.5rem'
    },
    forecastChange: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '1rem'
    },
    percentChange: {
        fontSize: '0.875rem',
        color: '#9CA3AF'
    },
    forecastBar: {
        height: '4px',
        background: '#374151',
        borderRadius: '2px',
        marginBottom: '1rem',
        overflow: 'hidden'
    },
    forecastBarFill: {
        height: '100%',
        borderRadius: '2px'
    },
    confidenceBadge: {
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        marginBottom: '0.5rem',
        fontSize: '0.875rem',
        color: '#9CA3AF'
    },
    confidenceDot: {
        width: '8px',
        height: '8px',
        borderRadius: '50%'
    },
    debtFreeBadge: {
        background: '#10B98120',
        color: '#10B981',
        padding: '0.25rem 0.5rem',
        borderRadius: '0.25rem',
        fontSize: '0.875rem',
        textAlign: 'center'
    },
    debtRemaining: {
        fontSize: '0.875rem',
        color: '#F87171'
    },
    milestonesSection: {
        marginBottom: '2rem'
    },
    milestonesGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '1rem'
    },
    milestoneCard: {
        display: 'flex',
        gap: '1rem',
        padding: '1.5rem',
        background: '#1F2937',
        borderRadius: '0.75rem',
        border: '1px solid #374151'
    },
    milestoneIcon: {
        fontSize: '2rem'
    },
    milestoneTitle: {
        fontSize: '1rem',
        fontWeight: '600',
        margin: '0 0 0.5rem 0',
        color: 'white'
    },
    milestoneDate: {
        fontSize: '1.25rem',
        fontWeight: 'bold',
        color: '#4ADE80',
        margin: '0 0 0.25rem 0'
    },
    milestoneAmount: {
        fontSize: '1.25rem',
        fontWeight: 'bold',
        margin: '0 0 0.25rem 0'
    },
    milestoneNote: {
        fontSize: '0.875rem',
        color: '#9CA3AF',
        margin: 0
    },
    insightsSection: {
        background: '#1F2937',
        padding: '1.5rem',
        borderRadius: '0.75rem',
        border: '1px solid #374151'
    },
    insightsGrid: {
        display: 'grid',
        gap: '1rem'
    },
    insightCard: {
        display: 'flex',
        gap: '1rem',
        padding: '1rem',
        background: '#111827',
        borderRadius: '0.5rem'
    },
    insightIcon: {
        fontSize: '1.5rem'
    },
    insightTitle: {
        fontSize: '1rem',
        fontWeight: '600',
        margin: '0 0 0.25rem 0',
        color: 'white'
    },
    insightText: {
        fontSize: '0.875rem',
        color: '#9CA3AF',
        margin: 0
    }
};

export default CashFlowForecast;