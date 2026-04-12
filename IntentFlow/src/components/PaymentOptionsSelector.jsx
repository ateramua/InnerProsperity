// src/components/PaymentOptionsSelector.jsx
import React from 'react';

const PaymentOptionsSelector = ({ card, onSelect }) => {
  const options = [
    {
      id: 'embedded',
      title: '💻 Pay on Computer',
      description: 'Complete payment directly in this window',
      features: [
        'Login to your bank\'s website',
        'Make payment immediately',
        'No phone required',
        'Secure encrypted connection'
      ],
      estimatedTime: '2-3 minutes',
      color: '#3B82F6',
    },
    {
      id: 'mobile',
      title: '📱 Pay on Phone',
      description: 'Scan QR code and pay with mobile banking',
      features: [
        'Use Face ID / Fingerprint',
        'No password typing needed',
        'Bank app already logged in',
        'Extra security layer'
      ],
      estimatedTime: '30 seconds',
      color: '#10B981',
    },
  ];

  return (
    <div style={styles.container}>
      <p style={styles.subtitle}>
        Choose how you'd like to make your payment to {card.name}
      </p>
      
      <div style={styles.optionsGrid}>
        {options.map(option => (
          <div
            key={option.id}
            style={styles.optionCard}
            onClick={() => onSelect(option.id)}
          >
            <div style={styles.optionHeader}>
              <span style={styles.optionIcon}>{option.title}</span>
            </div>
            
            <p style={styles.optionDescription}>{option.description}</p>
            
            <div style={styles.featureList}>
              {option.features.map((feature, idx) => (
                <div key={idx} style={styles.featureItem}>
                  <span style={styles.featureCheck}>✓</span>
                  <span>{feature}</span>
                </div>
              ))}
            </div>
            
            <div style={styles.optionFooter}>
              <span style={styles.timeEstimate}>⏱ {option.estimatedTime}</span>
              <button style={{...styles.selectButton, background: option.color}}>
                Select & Continue →
              </button>
            </div>
          </div>
        ))}
      </div>
      
      <div style={styles.securityNote}>
        <span>🔒</span>
        <span>Your banking credentials are never stored or seen by this application</span>
      </div>
    </div>
  );
};

const styles = {
  container: {
    height: '100%',
  },
  subtitle: {
    color: '#9CA3AF',
    textAlign: 'center',
    marginBottom: '32px',
    fontSize: '14px',
  },
  optionsGrid: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    marginBottom: '24px',
  },
  optionCard: {
    background: '#111827',
    borderRadius: '12px',
    padding: '24px',
    cursor: 'pointer',
    transition: 'transform 0.2s, box-shadow 0.2s',
    border: '1px solid #374151',
  },
  optionHeader: {
    fontSize: '20px',
    fontWeight: '600',
    marginBottom: '12px',
    color: 'white',
  },
  optionIcon: {
    fontSize: '24px',
  },
  optionDescription: {
    color: '#9CA3AF',
    fontSize: '14px',
    marginBottom: '20px',
    lineHeight: '1.5',
  },
  featureList: {
    marginBottom: '24px',
  },
  featureItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    fontSize: '13px',
    color: '#D1D5DB',
  },
  featureCheck: {
    color: '#10B981',
    fontWeight: 'bold',
  },
  optionFooter: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: '16px',
    paddingTop: '16px',
    borderTop: '1px solid #374151',
  },
  timeEstimate: {
    fontSize: '12px',
    color: '#6B7280',
  },
  selectButton: {
    padding: '8px 16px',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    fontSize: '13px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'opacity 0.2s',
  },
  securityNote: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '8px',
    padding: '12px',
    background: 'rgba(59, 130, 246, 0.1)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#9CA3AF',
  },
};

export default PaymentOptionsSelector;