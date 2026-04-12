// src/components/EmbeddedPaymentView.jsx
import React, { useState, useRef, useEffect } from 'react';

const EmbeddedPaymentView = ({ card, onPaymentComplete }) => {
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const webviewRef = useRef(null);

  useEffect(() => {
    const paymentUrl = getPaymentUrl(card);
    setUrl(paymentUrl);
  }, [card]);

  const getPaymentUrl = (card) => {
    const issuer = detectIssuer(card.card_number);
    const baseUrls = {
      visa: 'https://www.visa.com/pay',
      mastercard: 'https://www.mastercard.us/en-us/personal.html',
      amex: 'https://global.americanexpress.com/dashboard',
      discover: 'https://portal.discover.com/cardmembersvcs/weblogin/app/login',
      chase: 'https://secure.chase.com/web/auth/dashboard',
      citi: 'https://online.citi.com/US/login.do',
      capitalone: 'https://www.capitalone.com/sign-in/',
      bankofamerica: 'https://secure.bankofamerica.com/login/',
      wellsFargo: 'https://connect.secure.wellsfargo.com/auth/login',
    };
    return baseUrls[issuer] || 'https://www.google.com/search?q=pay+credit+card+bill';
  };

  const detectIssuer = (cardNumber) => {
    const firstDigits = cardNumber?.replace(/\D/g, '').substring(0, 4);
    if (firstDigits?.startsWith('4')) return 'visa';
    if (/^5[1-5]/.test(firstDigits)) return 'mastercard';
    if (/^3[47]/.test(firstDigits)) return 'amex';
    if (/^6011|65|64[4-9]|622/.test(firstDigits)) return 'discover';
    return 'other';
  };

  // Use onLoad instead of onDidFinishLoad for webview
  const handleWebViewLoad = () => {
    setLoading(false);
  };

  const handleOpenInBrowser = () => {
    window.open(url, '_blank');
  };

  return (
    <div style={styles.container}>
      <div style={styles.toolbar}>
        <div style={styles.urlBar}>
          <span style={styles.lockIcon}>🔒</span>
          <span style={styles.urlText}>{url}</span>
        </div>
        <button onClick={handleOpenInBrowser} style={styles.externalButton}>
          Open in Browser ↗
        </button>
      </div>
      
      <div style={styles.webviewContainer}>
        {loading && (
          <div style={styles.loadingOverlay}>
            <div style={styles.spinner}></div>
            <p>Loading secure payment portal...</p>
            <p style={styles.loadingHint}>This may take a few seconds</p>
          </div>
        )}
        
        <webview
          ref={webviewRef}
          src={url}
          style={styles.webview}
          // Use onLoad instead of onDidFinishLoad
          onLoad={handleWebViewLoad}
          partition="persist:banking"
        />
      </div>
      
      <div style={styles.instructions}>
        <span>💡</span>
        <span>Log in to your account and complete the payment. The app will detect when payment is made.</span>
      </div>
    </div>
  );
};

const styles = {
  container: {
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  toolbar: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
    alignItems: 'center',
  },
  urlBar: {
    flex: 1,
    background: '#111827',
    padding: '8px 12px',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '12px',
    color: '#9CA3AF',
    fontFamily: 'monospace',
  },
  lockIcon: {
    fontSize: '14px',
  },
  urlText: {
    flex: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  externalButton: {
    padding: '8px 16px',
    background: '#374151',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '13px',
  },
  webviewContainer: {
    flex: 1,
    position: 'relative',
    background: 'white',
    borderRadius: '8px',
    overflow: 'hidden',
    minHeight: '400px',
  },
  webview: {
    width: '100%',
    height: '100%',
    border: 'none',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: '#1F2937',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  spinner: {
    width: '48px',
    height: '48px',
    border: '4px solid #374151',
    borderTopColor: '#3B82F6',
    borderRadius: '50%',
    animation: 'spin 1s linear infinite',
    marginBottom: '16px',
  },
  loadingHint: {
    fontSize: '12px',
    color: '#6B7280',
    marginTop: '8px',
  },
  instructions: {
    marginTop: '16px',
    padding: '12px',
    background: 'rgba(59, 130, 246, 0.1)',
    borderRadius: '8px',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: '#9CA3AF',
  },
};

// Add keyframe animation
if (typeof document !== 'undefined') {
  const styleSheet = document.createElement("style");
  styleSheet.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(styleSheet);
}

export default EmbeddedPaymentView;