import React, { useState, useEffect } from 'react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, ComposedChart, Scatter
} from 'recharts';

 function StrategicInvestmentPortfolio({ 
  investments: initialInvestments, 
  accounts,
  transactions = [],
  marketData = {} // Would come from API in real app
}) {
  const [investments, setInvestments] = useState(initialInvestments || []);
  const [selectedInvestment, setSelectedInvestment] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [viewType, setViewType] = useState('dashboard');
  const [riskProfile, setRiskProfile] = useState('moderate'); // conservative, moderate, aggressive
  const [rebalanceMode, setRebalanceMode] = useState(false);
  const [newInvestment, setNewInvestment] = useState({
    symbol: '',
    name: '',
    type: 'stock',
    sector: 'technology',
    shares: '',
    purchase_price: '',
    current_price: '',
    purchase_date: new Date().toISOString().split('T')[0],
    account_id: '',
    dividend_yield: '',
    expense_ratio: '',
    beta: '',
    pe_ratio: '',
    target_allocation: '',
    notes: ''
  });

  // Sample market data (in real app, this would come from API)
  const marketIndices = {
    'S&P 500': { value: 5200, change: 0.8, pe: 22.5, dividend: 1.4 },
    'NASDAQ': { value: 16300, change: 1.2, pe: 28.3, dividend: 0.8 },
    'DOW': { value: 39000, change: 0.5, pe: 18.7, dividend: 2.1 },
    'BTC': { value: 65000, change: -2.1, pe: null, dividend: 0 }
  };

  const COLORS = {
    conservative: ['#3B82F6', '#60A5FA', '#93C5FD'],
    moderate: ['#10B981', '#34D399', '#6EE7B7'],
    aggressive: ['#F59E0B', '#FBBF24', '#FCD34D'],
    danger: '#EF4444',
    success: '#10B981',
    warning: '#F59E0B',
    info: '#3B82F6'
  };

  // ==================== ADVANCED CALCULATIONS ====================

  // Calculate comprehensive portfolio metrics
  const calculatePortfolioMetrics = () => {
    let totalCost = 0;
    let totalValue = 0;
    let totalDividends = 0;
    let totalFees = 0;
    let weightedBeta = 0;
    let weightedPERatio = 0;
    let weightedYield = 0;

    investments.forEach(inv => {
      const cost = inv.shares * inv.purchase_price;
      const value = inv.shares * (inv.current_price || inv.purchase_price);
      const dividends = value * (inv.dividend_yield || 0) / 100;
      
      totalCost += cost;
      totalValue += value;
      totalDividends += dividends;
      totalFees += value * (inv.expense_ratio || 0) / 100;

      // Risk metrics
      weightedBeta += value * (inv.beta || 1.0);
      weightedPERatio += value * (inv.pe_ratio || 20);
      weightedYield += value * (inv.dividend_yield || 0);
    });

    const totalGain = totalValue - totalCost;
    const gainPercent = totalCost > 0 ? (totalGain / totalCost) * 100 : 0;
    const annualReturn = calculateAnnualizedReturn();
    
    weightedBeta = totalValue > 0 ? weightedBeta / totalValue : 1.0;
    weightedPERatio = totalValue > 0 ? weightedPERatio / totalValue : 20;
    weightedYield = totalValue > 0 ? weightedYield / totalValue : 0;

    return {
      totalCost,
      totalValue,
      totalGain,
      gainPercent,
      annualReturn,
      totalDividends,
      totalFees,
      weightedBeta,
      weightedPERatio,
      weightedYield,
      sharpeRatio: calculateSharpeRatio(totalGain, weightedBeta),
      riskLevel: determineRiskLevel(weightedBeta, investments)
    };
  };

  // Calculate annualized return (CAGR)
  const calculateAnnualizedReturn = () => {
    if (investments.length === 0) return 0;
    
    const oldestDate = Math.min(...investments.map(i => new Date(i.purchase_date)));
    const years = (new Date() - oldestDate) / (1000 * 60 * 60 * 24 * 365);
    
    if (years < 0.1) return metrics.gainPercent; // Less than 1 month
    
    const totalValue = metrics.totalValue;
    const totalCost = metrics.totalCost;
    
    return (Math.pow(totalValue / totalCost, 1 / years) - 1) * 100;
  };

  // Calculate Sharpe Ratio (risk-adjusted return)
  const calculateSharpeRatio = (gain, beta) => {
    const riskFreeRate = 2.0; // Assume 2% risk-free rate
    const marketReturn = 10.0; // Assume 10% market return
    
    if (beta === 0) return 0;
    
    const excessReturn = gain - riskFreeRate;
    const portfolioRisk = beta * (marketReturn - riskFreeRate);
    
    return portfolioRisk > 0 ? excessReturn / portfolioRisk : 0;
  };

  // Determine portfolio risk level
  const determineRiskLevel = (beta, investments) => {
    const avgBeta = beta;
    const hasCrypto = investments.some(i => i.type === 'crypto');
    const hasStocks = investments.some(i => i.type === 'stock');
    const hasBonds = investments.some(i => i.type === 'bond');
    
    if (avgBeta > 1.5 || hasCrypto) return 'aggressive';
    if (avgBeta > 1.0 || (hasStocks && !hasBonds)) return 'moderate';
    return 'conservative';
  };

  // Calculate optimal portfolio allocation based on risk profile
  const calculateOptimalAllocation = () => {
    const allocations = {
      conservative: {
        stocks: 30,
        bonds: 50,
        cash: 15,
        alternative: 5
      },
      moderate: {
        stocks: 60,
        bonds: 30,
        cash: 5,
        alternative: 5
      },
      aggressive: {
        stocks: 80,
        bonds: 10,
        cash: 0,
        alternative: 10
      }
    };

    return allocations[riskProfile] || allocations.moderate;
  };

  // Calculate rebalancing recommendations
  const calculateRebalancingNeeds = () => {
    const target = calculateOptimalAllocation();
    const current = getCurrentAllocation();
    const recommendations = [];

    Object.keys(target).forEach(assetClass => {
      const currentPct = current[assetClass] || 0;
      const targetPct = target[assetClass];
      const diff = currentPct - targetPct;
      
      if (Math.abs(diff) > 5) {
        recommendations.push({
          assetClass,
          currentPct,
          targetPct,
          diff,
          action: diff > 0 ? 'sell' : 'buy',
          amount: Math.abs(metrics.totalValue * diff / 100)
        });
      }
    });

    return recommendations;
  };

  // Get current allocation by asset class
  const getCurrentAllocation = () => {
    const allocation = {
      stocks: 0,
      bonds: 0,
      cash: 0,
      alternative: 0
    };

    investments.forEach(inv => {
      const value = inv.shares * (inv.current_price || inv.purchase_price);
      const pct = (value / metrics.totalValue) * 100;

      if (inv.type === 'stock' || inv.type === 'etf') {
        if (inv.sector === 'technology' || inv.beta > 1.2) {
          allocation.stocks += pct;
        } else {
          allocation.stocks += pct;
        }
      } else if (inv.type === 'bond') {
        allocation.bonds += pct;
      } else if (inv.type === 'crypto') {
        allocation.alternative += pct;
      } else {
        allocation.cash += pct;
      }
    });

    return allocation;
  };

  // Calculate tax impact
  const calculateTaxImpact = () => {
    const shortTermGains = [];
    const longTermGains = [];
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

    investments.forEach(inv => {
      const purchaseDate = new Date(inv.purchase_date);
      const gain = (inv.current_price - inv.purchase_price) * inv.shares;
      
      if (gain > 0) {
        if (purchaseDate > oneYearAgo) {
          shortTermGains.push(gain);
        } else {
          longTermGains.push(gain);
        }
      }
    });

    const totalShortTerm = shortTermGains.reduce((a, b) => a + b, 0);
    const totalLongTerm = longTermGains.reduce((a, b) => a + b, 0);
    
    // Assume tax rates (simplified)
    const shortTermTax = totalShortTerm * 0.35; // Income tax rate
    const longTermTax = totalLongTerm * 0.15;   // Capital gains rate

    return {
      shortTerm: totalShortTerm,
      longTerm: totalLongTerm,
      shortTermTax,
      longTermTax,
      totalTax: shortTermTax + longTermTax,
      taxEfficient: longTermTax < shortTermTax
    };
  };

  // Generate diversification score
  const calculateDiversificationScore = () => {
    const allocation = getCurrentAllocation();
    const target = calculateOptimalAllocation();
    
    let score = 100;
    let penalties = [];

    // Check concentration
    Object.keys(allocation).forEach(assetClass => {
      const diff = Math.abs(allocation[assetClass] - target[assetClass]);
      if (diff > 10) {
        penalties.push(`Overweight in ${assetClass}`);
        score -= diff;
      } else if (diff > 5) {
        penalties.push(`Slightly overweight in ${assetClass}`);
        score -= diff / 2;
      }
    });

    // Check number of holdings
    if (investments.length < 5) {
      penalties.push('Too few holdings - consider diversifying');
      score -= 15;
    } else if (investments.length > 20) {
      penalties.push('Many holdings - consider consolidating');
      score -= 5;
    }

    // Check sector concentration
    const sectors = {};
    investments.forEach(inv => {
      if (inv.sector) {
        sectors[inv.sector] = (sectors[inv.sector] || 0) + 1;
      }
    });
    
    if (Object.keys(sectors).length < 3) {
      penalties.push('Sector concentration risk');
      score -= 10;
    }

    return {
      score: Math.max(0, Math.min(100, score)),
      penalties
    };
  };

  const metrics = calculatePortfolioMetrics();
  const currentAllocation = getCurrentAllocation();
  const optimalAllocation = calculateOptimalAllocation();
  const rebalanceNeeds = calculateRebalancingNeeds();
  const taxImpact = calculateTaxImpact();
  const diversification = calculateDiversificationScore();

  // Formatting helpers
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatPercent = (value) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const formatCompact = (value) => {
    if (value >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
    if (value >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
    if (value >= 1e3) return `$${(value / 1e3).toFixed(1)}K`;
    return formatCurrency(value);
  };

  return (
    <div style={styles.container}>
      {/* Header with Market Summary */}
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>📊 Strategic Investment Portfolio</h1>
          <p style={styles.subtitle}>Intelligent insights & optimization</p>
        </div>
        <div style={styles.marketTicker}>
          {Object.entries(marketIndices).map(([name, data]) => (
            <div key={name} style={styles.tickerItem}>
              <span style={styles.tickerName}>{name}</span>
              <span style={styles.tickerValue}>{formatCompact(data.value)}</span>
              <span style={{
                ...styles.tickerChange,
                color: data.change >= 0 ? '#4ADE80' : '#F87171'
              }}>
                {data.change >= 0 ? '▲' : '▼'} {Math.abs(data.change)}%
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Risk Profile Selector */}
      <div style={styles.riskSelector}>
        <span style={styles.riskLabel}>Your Risk Profile:</span>
        <button
          onClick={() => setRiskProfile('conservative')}
          style={{
            ...styles.riskButton,
            ...(riskProfile === 'conservative' ? styles.activeRisk : {}),
            background: riskProfile === 'conservative' ? COLORS.conservative[0] : 'transparent'
          }}
        >
          🛡️ Conservative
        </button>
        <button
          onClick={() => setRiskProfile('moderate')}
          style={{
            ...styles.riskButton,
            ...(riskProfile === 'moderate' ? styles.activeRisk : {}),
            background: riskProfile === 'moderate' ? COLORS.moderate[0] : 'transparent'
          }}
        >
          ⚖️ Moderate
        </button>
        <button
          onClick={() => setRiskProfile('aggressive')}
          style={{
            ...styles.riskButton,
            ...(riskProfile === 'aggressive' ? styles.activeRisk : {}),
            background: riskProfile === 'aggressive' ? COLORS.aggressive[0] : 'transparent'
          }}
        >
          🚀 Aggressive
        </button>
      </div>

      {/* Main Metrics Dashboard */}
      <div style={styles.metricsGrid}>
        <div style={styles.metricCard}>
          <div style={styles.metricIcon}>💰</div>
          <div style={styles.metricContent}>
            <span style={styles.metricLabel}>Total Value</span>
            <span style={styles.metricValue}>{formatCurrency(metrics.totalValue)}</span>
            <span style={{
              ...styles.metricSub,
              color: metrics.gainPercent >= 0 ? '#4ADE80' : '#F87171'
            }}>
              {formatPercent(metrics.gainPercent)} overall
            </span>
          </div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricIcon}>📈</div>
          <div style={styles.metricContent}>
            <span style={styles.metricLabel}>Annual Return</span>
            <span style={{
              ...styles.metricValue,
              color: metrics.annualReturn >= 0 ? '#4ADE80' : '#F87171'
            }}>
              {formatPercent(metrics.annualReturn)}
            </span>
            <span style={styles.metricSub}>CAGR</span>
          </div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricIcon}>⚠️</div>
          <div style={styles.metricContent}>
            <span style={styles.metricLabel}>Risk Level</span>
            <span style={{
              ...styles.metricValue,
              color: metrics.riskLevel === 'conservative' ? '#3B82F6' :
                     metrics.riskLevel === 'moderate' ? '#10B981' : '#F59E0B'
            }}>
              {metrics.riskLevel.toUpperCase()}
            </span>
            <span style={styles.metricSub}>Beta: {metrics.weightedBeta.toFixed(2)}</span>
          </div>
        </div>

        <div style={styles.metricCard}>
          <div style={styles.metricIcon}>🎯</div>
          <div style={styles.metricContent}>
            <span style={styles.metricLabel}>Diversification</span>
            <span style={styles.metricValue}>{diversification.score}/100</span>
            <span style={styles.metricSub}>
              {diversification.score > 80 ? 'Well diversified' : 'Needs improvement'}
            </span>
          </div>
        </div>
      </div>

      {/* Allocation Analysis */}
      <div style={styles.allocationSection}>
        <h2 style={styles.sectionTitle}>📊 Portfolio Allocation</h2>
        <div style={styles.allocationGrid}>
          {/* Current vs Target */}
          <div style={styles.allocationChart}>
            <h3 style={styles.chartTitle}>Current vs Target</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[
                { name: 'Stocks', current: currentAllocation.stocks, target: optimalAllocation.stocks },
                { name: 'Bonds', current: currentAllocation.bonds, target: optimalAllocation.bonds },
                { name: 'Cash', current: currentAllocation.cash, target: optimalAllocation.cash },
                { name: 'Alternative', current: currentAllocation.alternative, target: optimalAllocation.alternative }
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                <XAxis dataKey="name" stroke="#9CA3AF" />
                <YAxis stroke="#9CA3AF" unit="%" />
                <Tooltip 
                  formatter={(value) => `${value.toFixed(1)}%`}
                  contentStyle={{ background: '#1F2937', border: '1px solid #374151' }}
                />
                <Legend />
                <Bar dataKey="current" fill="#3B82F6" name="Current" />
                <Bar dataKey="target" fill="#10B981" name="Target" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Rebalancing Recommendations */}
          <div style={styles.rebalanceCard}>
            <h3 style={styles.chartTitle}>🔄 Rebalancing Needed</h3>
            {rebalanceNeeds.length > 0 ? (
              <>
                {rebalanceNeeds.map((rec, i) => (
                  <div key={i} style={styles.recommendation}>
                    <div style={styles.recommendationHeader}>
                      <span style={styles.recommendationAsset}>{rec.assetClass}</span>
                      <span style={{
                        ...styles.recommendationAction,
                        color: rec.action === 'sell' ? '#EF4444' : '#10B981'
                      }}>
                        {rec.action === 'sell' ? '▼ SELL' : '▲ BUY'}
                      </span>
                    </div>
                    <div style={styles.recommendationDetails}>
                      <span>Current: {rec.currentPct.toFixed(1)}%</span>
                      <span>Target: {rec.targetPct.toFixed(1)}%</span>
                      <span style={{ fontWeight: 'bold' }}>
                        {formatCurrency(rec.amount)}
                      </span>
                    </div>
                  </div>
                ))}
                <button
                  onClick={() => setRebalanceMode(true)}
                  style={styles.rebalanceButton}
                >
                  Generate Rebalancing Plan
                </button>
              </>
            ) : (
              <div style={styles.noRebalance}>
                ✅ Your portfolio is perfectly balanced for your risk profile!
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tax Efficiency Analysis */}
      <div style={styles.taxSection}>
        <h2 style={styles.sectionTitle}>💰 Tax Efficiency</h2>
        <div style={styles.taxGrid}>
          <div style={styles.taxCard}>
            <div style={styles.taxHeader}>
              <span>Short-term Gains</span>
              <span style={{ color: '#F59E0B' }}>{formatCurrency(taxImpact.shortTerm)}</span>
            </div>
            <div style={styles.taxDetail}>
              <span>Estimated Tax</span>
              <span style={{ color: '#EF4444' }}>{formatCurrency(taxImpact.shortTermTax)}</span>
            </div>
            <div style={styles.taxNote}>Higher tax rate (ordinary income)</div>
          </div>

          <div style={styles.taxCard}>
            <div style={styles.taxHeader}>
              <span>Long-term Gains</span>
              <span style={{ color: '#10B981' }}>{formatCurrency(taxImpact.longTerm)}</span>
            </div>
            <div style={styles.taxDetail}>
              <span>Estimated Tax</span>
              <span style={{ color: '#EF4444' }}>{formatCurrency(taxImpact.longTermTax)}</span>
            </div>
            <div style={styles.taxNote}>Lower tax rate (capital gains)</div>
          </div>

          <div style={styles.taxCard}>
            <div style={styles.taxHeader}>
              <span>Total Tax Liability</span>
              <span style={{ color: '#EF4444' }}>{formatCurrency(taxImpact.totalTax)}</span>
            </div>
            <div style={styles.taxDetail}>
              <span>Tax Efficiency</span>
              <span style={{ color: taxImpact.taxEfficient ? '#10B981' : '#F59E0B' }}>
                {taxImpact.taxEfficient ? 'Good' : 'Could improve'}
              </span>
            </div>
            <div style={styles.taxNote}>
              {taxImpact.taxEfficient 
                ? 'Most gains are long-term' 
                : 'Consider holding longer for better tax treatment'}
            </div>
          </div>

          <div style={styles.taxCard}>
            <div style={styles.taxHeader}>
              <span>Dividend Income</span>
              <span style={{ color: '#10B981' }}>{formatCurrency(metrics.totalDividends)}</span>
            </div>
            <div style={styles.taxDetail}>
              <span>Yield</span>
              <span>{metrics.weightedYield.toFixed(2)}%</span>
            </div>
            <div style={styles.taxNote}>
              {metrics.weightedYield > 2 ? 'Good income' : 'Growth focused'}
            </div>
          </div>
        </div>
      </div>

      {/* Holdings Table with Smart Insights */}
      <div style={styles.holdingsSection}>
        <h2 style={styles.sectionTitle}>📋 Holdings & Insights</h2>
        <div style={styles.tableContainer}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Name</th>
                <th>Type</th>
                <th>Shares</th>
                <th>Cost</th>
                <th>Value</th>
                <th>Gain/Loss</th>
                <th>Return</th>
                <th>Allocation</th>
                <th>Insight</th>
              </tr>
            </thead>
            <tbody>
              {investments.map(inv => {
                const cost = inv.shares * inv.purchase_price;
                const value = inv.shares * (inv.current_price || inv.purchase_price);
                const gain = value - cost;
                const gainPercent = cost > 0 ? (gain / cost) * 100 : 0;
                const allocation = (value / metrics.totalValue) * 100;

                // Generate insight
                let insight = '';
                let insightColor = '#9CA3AF';
                
                if (gainPercent > 20) {
                  insight = '🏆 Strong performer';
                  insightColor = '#10B981';
                } else if (gainPercent < -10) {
                  insight = '⚠️ Consider reviewing';
                  insightColor = '#F59E0B';
                } else if (inv.beta > 1.5) {
                  insight = '📈 High volatility';
                  insightColor = '#F59E0B';
                } else if (allocation > 20) {
                  insight = '⚠️ Overweight';
                  insightColor = '#F59E0B';
                } else if (inv.dividend_yield > 3) {
                  insight = '💰 High dividend';
                  insightColor = '#3B82F6';
                } else {
                  insight = '✅ On track';
                  insightColor = '#4ADE80';
                }

                return (
                  <tr key={inv.id}>
                    <td style={{ fontWeight: 'bold' }}>{inv.symbol}</td>
                    <td>{inv.name}</td>
                    <td>{inv.type.toUpperCase()}</td>
                    <td style={{ textAlign: 'right' }}>{inv.shares}</td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(cost)}</td>
                    <td style={{ textAlign: 'right', color: '#10B981' }}>{formatCurrency(value)}</td>
                    <td style={{ 
                      textAlign: 'right',
                      color: gain >= 0 ? '#10B981' : '#EF4444',
                      fontWeight: 'bold'
                    }}>
                      {gain >= 0 ? '+' : '-'}{formatCurrency(Math.abs(gain))}
                    </td>
                    <td style={{ 
                      textAlign: 'right',
                      color: gainPercent >= 0 ? '#10B981' : '#EF4444'
                    }}>
                      {formatPercent(gainPercent)}
                    </td>
                    <td style={{ textAlign: 'right' }}>{allocation.toFixed(1)}%</td>
                    <td style={{ color: insightColor }}>{insight}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Strategic Recommendations */}
      <div style={styles.recommendationsSection}>
        <h2 style={styles.sectionTitle}>💡 Strategic Recommendations</h2>
        <div style={styles.recommendationsGrid}>
          
          {/* Diversification Recommendation */}
          {diversification.penalties.length > 0 && (
            <div style={styles.recommendationCard}>
              <div style={styles.recIcon}>🌐</div>
              <div>
                <h4 style={styles.recTitle}>Improve Diversification</h4>
                <ul style={styles.recList}>
                  {diversification.penalties.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Tax Optimization */}
          {!taxImpact.taxEfficient && (
            <div style={styles.recommendationCard}>
              <div style={styles.recIcon}>💰</div>
              <div>
                <h4 style={styles.recTitle}>Tax Optimization</h4>
                <p style={styles.recText}>
                  Consider holding investments for at least one year to qualify for 
                  lower long-term capital gains rates. You could save{' '}
                  {formatCurrency(taxImpact.shortTermTax - taxImpact.longTermTax)} in taxes.
                </p>
              </div>
            </div>
          )}

          {/* Rebalancing Recommendation */}
          {rebalanceNeeds.length > 0 && (
            <div style={styles.recommendationCard}>
              <div style={styles.recIcon}>⚖️</div>
              <div>
                <h4 style={styles.recTitle}>Portfolio Rebalancing</h4>
                <p style={styles.recText}>
                  Your portfolio is out of alignment with your {riskProfile} risk profile.
                  {rebalanceNeeds.map(r => ` ${r.action} ${formatCurrency(r.amount)} of ${r.assetClass}.`)}
                </p>
              </div>
            </div>
          )}

          {/* Risk Adjustment */}
          {metrics.riskLevel !== riskProfile && (
            <div style={styles.recommendationCard}>
              <div style={styles.recIcon}>⚠️</div>
              <div>
                <h4 style={styles.recTitle}>Risk Profile Mismatch</h4>
                <p style={styles.recText}>
                  Your portfolio risk level ({metrics.riskLevel}) doesn't match your selected profile ({riskProfile}).
                  {metrics.riskLevel === 'aggressive' && riskProfile === 'conservative' 
                    ? ' Consider adding bonds and reducing volatility.'
                    : ' Consider adding growth stocks.'}
                </p>
              </div>
            </div>
          )}

          {/* Dividend Optimization */}
          {metrics.weightedYield < 1 && riskProfile === 'conservative' && (
            <div style={styles.recommendationCard}>
              <div style={styles.recIcon}>📊</div>
              <div>
                <h4 style={styles.recTitle}>Income Generation</h4>
                <p style={styles.recText}>
                  For a conservative profile, consider adding dividend-paying stocks or bonds
                  to generate steady income. Target 2-3% yield.
                </p>
              </div>
            </div>
          )}

          {/* Growth Optimization */}
          {metrics.weightedPERatio < 15 && riskProfile === 'aggressive' && (
            <div style={styles.recommendationCard}>
              <div style={styles.recIcon}>🚀</div>
              <div>
                <h4 style={styles.recTitle}>Growth Potential</h4>
                <p style={styles.recText}>
                  Your portfolio has a low P/E ratio. For an aggressive profile, consider
                  adding growth stocks with higher P/E but stronger growth potential.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    padding: '2rem',
    maxWidth: '1400px',
    margin: '0 auto',
    color: 'white'
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: '2rem',
    flexWrap: 'wrap',
    gap: '1rem'
  },
  title: {
    fontSize: '2rem',
    fontWeight: 'bold',
    margin: '0 0 0.25rem 0',
    background: 'linear-gradient(135deg, #3B82F6, #8B5CF6)',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  },
  subtitle: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    margin: 0
  },
  marketTicker: {
    display: 'flex',
    gap: '1rem',
    background: '#1F2937',
    padding: '0.75rem 1rem',
    borderRadius: '0.5rem',
    border: '1px solid #374151'
  },
  tickerItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0 0.5rem',
    borderRight: '1px solid #374151',
    ':last-child': {
      borderRight: 'none'
    }
  },
  tickerName: {
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  tickerValue: {
    fontSize: '0.875rem',
    fontWeight: '600'
  },
  tickerChange: {
    fontSize: '0.75rem',
    fontWeight: '500'
  },
  riskSelector: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    marginBottom: '2rem',
    background: '#1F2937',
    padding: '0.5rem',
    borderRadius: '0.5rem',
    width: 'fit-content'
  },
  riskLabel: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginRight: '0.5rem'
  },
  riskButton: {
    padding: '0.5rem 1rem',
    border: 'none',
    borderRadius: '0.375rem',
    color: 'white',
    cursor: 'pointer',
    fontSize: '0.875rem',
    transition: 'all 0.2s'
  },
  activeRisk: {
    fontWeight: '600'
  },
  metricsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem',
    marginBottom: '2rem'
  },
  metricCard: {
    background: '#1F2937',
    padding: '1.25rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    display: 'flex',
    alignItems: 'center',
    gap: '1rem'
  },
  metricIcon: {
    fontSize: '2rem'
  },
  metricContent: {
    flex: 1
  },
  metricLabel: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    marginBottom: '0.25rem',
    textTransform: 'uppercase'
  },
  metricValue: {
    fontSize: '1.5rem',
    fontWeight: 'bold',
    display: 'block',
    lineHeight: 1.2
  },
  metricSub: {
    fontSize: '0.75rem',
    color: '#9CA3AF'
  },
  sectionTitle: {
    fontSize: '1.25rem',
    fontWeight: '600',
    margin: '0 0 1.5rem 0',
    color: 'white'
  },
  allocationSection: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    marginBottom: '2rem'
  },
  allocationGrid: {
    display: 'grid',
    gridTemplateColumns: '2fr 1fr',
    gap: '1.5rem'
  },
  allocationChart: {
    height: '350px'
  },
  chartTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    margin: '0 0 1rem 0',
    color: '#9CA3AF'
  },
  rebalanceCard: {
    background: '#111827',
    padding: '1.5rem',
    borderRadius: '0.75rem'
  },
  recommendation: {
    marginBottom: '1rem',
    padding: '1rem',
    background: '#1F2937',
    borderRadius: '0.5rem'
  },
  recommendationHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
    fontWeight: 'bold'
  },
  recommendationAsset: {
    textTransform: 'capitalize'
  },
  recommendationAction: {
    fontSize: '0.875rem'
  },
  recommendationDetails: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: '#9CA3AF'
  },
  rebalanceButton: {
    width: '100%',
    padding: '0.75rem',
    background: 'linear-gradient(135deg, #3B82F6, #2563EB)',
    color: 'white',
    border: 'none',
    borderRadius: '0.5rem',
    cursor: 'pointer',
    marginTop: '1rem'
  },
  noRebalance: {
    textAlign: 'center',
    padding: '2rem',
    color: '#4ADE80'
  },
  taxSection: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    marginBottom: '2rem'
  },
  taxGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
    gap: '1rem'
  },
  taxCard: {
    background: '#111827',
    padding: '1rem',
    borderRadius: '0.5rem'
  },
  taxHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    marginBottom: '0.5rem',
    fontWeight: 'bold'
  },
  taxDetail: {
    display: 'flex',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: '#9CA3AF',
    marginBottom: '0.5rem'
  },
  taxNote: {
    fontSize: '0.75rem',
    color: '#6B7280',
    fontStyle: 'italic'
  },
  holdingsSection: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151',
    marginBottom: '2rem'
  },
  tableContainer: {
    overflowX: 'auto'
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem'
  },
  recommendationsSection: {
    background: '#1F2937',
    padding: '1.5rem',
    borderRadius: '0.75rem',
    border: '1px solid #374151'
  },
  recommendationsGrid: {
    display: 'grid',
    gap: '1rem'
  },
  recommendationCard: {
    display: 'flex',
    gap: '1rem',
    padding: '1rem',
    background: '#111827',
    borderRadius: '0.5rem',
    border: '1px solid #374151'
  },
  recIcon: {
    fontSize: '1.5rem'
  },
  recTitle: {
    fontSize: '1rem',
    fontWeight: '600',
    margin: '0 0 0.25rem 0',
    color: 'white'
  },
  recText: {
    fontSize: '0.875rem',
    color: '#9CA3AF',
    margin: 0,
    lineHeight: 1.5
  },
  recList: {
    margin: 0,
    paddingLeft: '1.25rem',
    color: '#9CA3AF',
    fontSize: '0.875rem'
  }
};

export default StrategicInvestmentPortfolio;