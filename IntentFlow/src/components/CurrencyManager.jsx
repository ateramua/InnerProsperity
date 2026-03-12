import React, { useState, useEffect } from 'react';

export default function CurrencyManager({ accounts, onUpdateRates }) {
  const [currencies, setCurrencies] = useState([]);
  const [exchangeRates, setExchangeRates] = useState({});
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [showRateModal, setShowRateModal] = useState(false);
  const [editingRate, setEditingRate] = useState({ from: 'USD', to: 'EUR', rate: '' });
  const [lastUpdated, setLastUpdated] = useState(new Date());

  // Load currencies (mock data for now)
  useEffect(() => {
    const mockCurrencies = [
      { code: 'USD', name: 'US Dollar', symbol: '$', decimal_places: 2, is_base: true },
      { code: 'EUR', name: 'Euro', symbol: '€', decimal_places: 2, is_base: false },
      { code: 'GBP', name: 'British Pound', symbol: '£', decimal_places: 2, is_base: false },
      { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimal_places: 0, is_base: false },
      { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimal_places: 2, is_base: false },
      { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimal_places: 2, is_base: false },
      { code: 'CHF', name: 'Swiss Franc', symbol: 'Fr', decimal_places: 2, is_base: false },
      { code: 'CNY', name: 'Chinese Yuan', symbol: '¥', decimal_places: 2, is_base: false },
      { code: 'INR', name: 'Indian Rupee', symbol: '₹', decimal_places: 2, is_base: false },
      { code: 'BTC', name: 'Bitcoin', symbol: '₿', decimal_places: 8, is_base: false }
    ];
    setCurrencies(mockCurrencies);

    // Mock exchange rates
    const mockRates = {
      'USD-EUR': 0.92,
      'USD-GBP': 0.79,
      'USD-JPY': 148.50,
      'USD-CAD': 1.35,
      'USD-AUD': 1.52,
      'USD-CHF': 0.88,
      'USD-CNY': 7.19,
      'USD-INR': 83.12,
      'USD-BTC': 0.000024
    };
    setExchangeRates(mockRates);
  }, []);

  // Calculate total net worth in base currency
  const calculateNetWorth = () => {
    let total = 0;
    accounts.forEach(acc => {
      const rate = getExchangeRate(acc.currency || 'USD', baseCurrency);
      total += acc.balance * rate;
    });
    return total;
  };

  // Get exchange rate between two currencies
  const getExchangeRate = (from, to) => {
    if (from === to) return 1;
    
    const key = `${from}-${to}`;
    const reverseKey = `${to}-${from}`;
    
    if (exchangeRates[key]) return exchangeRates[key];
    if (exchangeRates[reverseKey]) return 1 / exchangeRates[reverseKey];
    
    // If no direct rate, try via USD
    if (from !== 'USD' && to !== 'USD') {
      const fromToUsd = getExchangeRate(from, 'USD');
      const usdToTo = getExchangeRate('USD', to);
      return fromToUsd * usdToTo;
    }
    
    return 1; // Default to 1 if no rate found
  };

  // Format amount with currency symbol
  const formatCurrency = (amount, currencyCode) => {
    const currency = currencies.find(c => c.code === currencyCode) || 
                    { symbol: '$', decimal_places: 2 };
    
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: currency.decimal_places,
      maximumFractionDigits: currency.decimal_places
    }).format(amount);
  };

  const handleUpdateRates = async () => {
    // In a real app, this would fetch live rates from an API
    setLastUpdated(new Date());
    alert('Exchange rates updated! (Mock - would fetch from API)');
  };

  const handleAddRate = () => {
    const key = `${editingRate.from}-${editingRate.to}`;
    setExchangeRates({
      ...exchangeRates,
      [key]: parseFloat(editingRate.rate)
    });
    setShowRateModal(false);
    setEditingRate({ from: 'USD', to: 'EUR', rate: '' });
  };

  const netWorth = calculateNetWorth();

  return (
    <div style={{ padding: '20px', color: 'white' }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '20px' 
      }}>
        <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span>🌍</span> Multi-Currency Support
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <select
            value={baseCurrency}
            onChange={(e) => setBaseCurrency(e.target.value)}
            style={{
              background: '#1F2937',
              color: 'white',
              border: '1px solid #374151',
              padding: '8px 12px',
              borderRadius: '6px'
            }}
          >
            {currencies.map(c => (
              <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
            ))}
          </select>
          <button
            onClick={handleUpdateRates}
            style={{
              background: '#3B82F6',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            🔄 Update Rates
          </button>
          <button
            onClick={() => setShowRateModal(true)}
            style={{
              background: '#10B981',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            ➕ Add Rate
          </button>
        </div>
      </div>

      {/* Net Worth Card */}
      <div style={{
        background: 'linear-gradient(135deg, #3B82F6 0%, #8B5CF6 100%)',
        borderRadius: '12px',
        padding: '25px',
        marginBottom: '25px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '5px' }}>
          Net Worth ({baseCurrency})
        </div>
        <div style={{ fontSize: '36px', fontWeight: 'bold' }}>
          {formatCurrency(netWorth, baseCurrency)}
        </div>
        <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '5px' }}>
          Last updated: {lastUpdated.toLocaleString()}
        </div>
      </div>

      {/* Accounts by Currency */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
        gap: '20px',
        marginBottom: '25px'
      }}>
        {currencies.filter(c => accounts.some(a => (a.currency || 'USD') === c.code)).map(currency => {
          const currencyAccounts = accounts.filter(a => (a.currency || 'USD') === currency.code);
          const total = currencyAccounts.reduce((sum, a) => sum + a.balance, 0);
          const totalInBase = total * getExchangeRate(currency.code, baseCurrency);

          return (
            <div key={currency.code} style={{
              background: '#1F2937',
              borderRadius: '8px',
              padding: '15px'
            }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '10px'
              }}>
                <div>
                  <span style={{ fontSize: '20px', marginRight: '5px' }}>{currency.symbol}</span>
                  <strong>{currency.code}</strong>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '18px', fontWeight: 'bold' }}>
                    {formatCurrency(total, currency.code)}
                  </div>
                  <div style={{ fontSize: '12px', color: '#9CA3AF' }}>
                    ≈ {formatCurrency(totalInBase, baseCurrency)}
                  </div>
                </div>
              </div>
              {currencyAccounts.map(acc => (
                <div key={acc.id} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: '8px 0',
                  borderTop: '1px solid #374151',
                  fontSize: '14px'
                }}>
                  <span>{acc.name}</span>
                  <span style={{ color: acc.balance >= 0 ? '#10B981' : '#EF4444' }}>
                    {formatCurrency(acc.balance, currency.code)}
                  </span>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Exchange Rates Table */}
      <div style={{
        background: '#1F2937',
        padding: '20px',
        borderRadius: '8px'
      }}>
        <h3 style={{ marginTop: 0, marginBottom: '15px' }}>Exchange Rates (vs {baseCurrency})</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #374151' }}>
                <th style={{ textAlign: 'left', padding: '10px', color: '#9CA3AF' }}>Currency</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Rate</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>1 {baseCurrency} =</th>
                <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {currencies.filter(c => c.code !== baseCurrency).map(currency => {
                const rate = getExchangeRate(baseCurrency, currency.code);
                return (
                  <tr key={currency.code} style={{ borderBottom: '1px solid #2d3748' }}>
                    <td style={{ padding: '10px' }}>
                      <strong>{currency.code}</strong> - {currency.name}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      {rate.toFixed(currency.decimal_places)}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      1 {baseCurrency} = {rate.toFixed(currency.decimal_places)} {currency.code}
                    </td>
                    <td style={{ padding: '10px', textAlign: 'right' }}>
                      <button
                        onClick={() => {
                          setEditingRate({
                            from: baseCurrency,
                            to: currency.code,
                            rate: rate.toString()
                          });
                          setShowRateModal(true);
                        }}
                        style={{
                          background: 'none',
                          border: '1px solid #3B82F6',
                          color: '#3B82F6',
                          padding: '4px 8px',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px'
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Rate Modal */}
      {showRateModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#1F2937',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '20px' }}>
              {editingRate.rate ? 'Edit' : 'Add'} Exchange Rate
            </h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                From Currency
              </label>
              <select
                value={editingRate.from}
                onChange={(e) => setEditingRate({...editingRate, from: e.target.value})}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '4px'
                }}
              >
                {currencies.map(c => (
                  <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                To Currency
              </label>
              <select
                value={editingRate.to}
                onChange={(e) => setEditingRate({...editingRate, to: e.target.value})}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '4px'
                }}
              >
                {currencies.map(c => (
                  <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                Exchange Rate
              </label>
              <input
                type="number"
                value={editingRate.rate}
                onChange={(e) => setEditingRate({...editingRate, rate: e.target.value})}
                placeholder="0.00"
                step="0.000001"
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '4px'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleAddRate}
                style={{
                  flex: 1,
                  background: '#10B981',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Save Rate
              </button>
              <button
                onClick={() => setShowRateModal(false)}
                style={{
                  flex: 1,
                  background: '#6B7280',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
