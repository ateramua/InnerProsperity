// src/components/MobilePaymentView.jsx
import React, { useState, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';

const MobilePaymentView = ({ card, onPaymentComplete }) => {
  const [deepLink, setDeepLink] = useState('');
  const [copied, setCopied] = useState(false);
  const [timeLeft, setTimeLeft] = useState(900); // 15 minutes in seconds

  useEffect(() => {
    // Generate deep link for mobile banking app
    const link = generateMobileDeepLink(card);
    setDeepLink(link);
    
    // Timer for QR code expiration
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [card]);

  const generateMobileDeepLink = (card) => {
    const issuer = detectIssuer(card.card_number);
    const deepLinks = {
      visa: 'visa://payments?card=' + card.card_number?.slice(-4),
      mastercard: 'mastercard://pay?account=' + card.account_number,
      amex: 'amex://make-payment',
      discover: 'discover://mobile/payment',
      capitalone: 'capitalone://pay-bill',
      chase: 'chase://pay?card=' + card.card_number?.slice(-4),
      citi: 'citi://payment',
      bankofamerica: 'boa://payments/creditcard',
      wellsFargo: 'wellsfargo://payments',
    };
    return deepLinks[issuer] || 'https://www.google.com/search?q=pay+credit+card+bill';
  };

  const detectIssuer = (cardNumber) => {
    const firstDigits = cardNumber?.replace(/\D/g, '').substring(0, 4);
    if (firstDigits?.startsWith('4')) return 'visa';
    if (/^5[1-5]/.test(firstDigits)) return 'mastercard';
    if (/^3[47]/.test(firstDigits)) return 'amex';
    if (/^6011|65|64[4-9]|622/.test(firstDigits)) return 'discover';
    return 'other';
  };

  const copyDeepLink = () => {
    navigator.clipboard.writeText(deepLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendToPhone = () => {
    // Create SMS link
    const smsBody = encodeURIComponent(`Pay your ${card.name} card: ${deepLink}`);
    window.open(`sms:&body=${smsBody}`, '_blank');
  };

  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div style={styles.container}>
      <div style={styles.splitLayout}>
        {/* Left Side - QR Code */}
        <div style={styles.qrSection}>
          <div style={styles.qrCard}>
            <h3 style={styles.sectionTitle}>Scan QR Code</h3>
            <div style={styles.qrCodeWrapper}>
              <QRCodeSVG 
                value={deepLink} 
                size={200}
                bgColor="#FFFFFF"
                fgColor="#1F2937"
                level="H"
                includeMargin={true}
              />
            </div>
            <p style={styles.qrInstruction}>
              Open your phone's camera and scan the QR code
            </p>
            <div style={styles.timerBox}>
              <span>⏱️ QR expires in: {formatTime(timeLeft)}</span>
            </div>
            <p style={styles.qrAlt}>
              This will open your banking app directly to the payment page
            </p>
          </div>
        </div>

        {/* Right Side - Instructions & Alternative Methods */}
        <div style={styles.instructionsSection}>
          <div style={styles.stepsCard}>
            <h3 style={styles.sectionTitle}>📱 How to Pay with Your Phone</h3>
            
            <div style={styles.stepList}>
              <div style={styles.stepItem}>
                <div style={styles.stepNumber}>1</div>
                <div style={styles.stepContent}>
                  <div style={styles.stepTitle}>Open your camera app</div>
                  <div style={styles.stepDescription}>Point your phone's camera at the QR code on the left</div>
                </div>
              </div>
              
              <div style={styles.stepItem}>
                <div style={styles.stepNumber}>2</div>
                <div style={styles.stepContent}>
                  <div style={styles.stepTitle}>Tap the notification</div>
                  <div style={styles.stepDescription}>Your phone will detect the QR code and show a notification</div>
                </div>
              </div>
              
              <div style={styles.stepItem}>
                <div style={styles.stepNumber}>3</div>
                <div style={styles.stepContent}>
                  <div style={styles.stepTitle}>Authenticate with Face ID/Fingerprint</div>
                  <div style={styles.stepDescription}>Use biometric authentication to securely log in</div>
                </div>
              </div>
              
              <div style={styles.stepItem}>
                <div style={styles.stepNumber}>4</div>
                <div style={styles.stepContent}>
                  <div style={styles.stepTitle}>Complete your payment</div>
                  <div style={styles.stepDescription}>Your card details will be pre-filled. Enter the amount and submit</div>
                </div>
              </div>
            </div>

            <div style={styles.divider} />

            <h3 style={styles.sectionTitle}>🔄 Alternative Methods</h3>
            
            <div style={styles.alternativeButtons}>
              <button onClick={copyDeepLink} style={styles.altButton}>
                {copied ? '✓ Copied!' : '📋 Copy Payment Link'}
              </button>
              <button onClick={sendToPhone} style={styles.altButton}>
                📱 Send to Phone (SMS)
              </button>
            </div>

            <div style={styles.securityNote}>
              <span>🔒</span>
              <span>QR code expires in 15 minutes for security</span>
            </div>
          </div>

          {/* Payment Summary */}
          <div style={styles.summaryCard}>
            <div style={styles.summaryRow}>
              <span>Card:</span>
              <div style={styles.summaryValue}>{card.name}</div>
            </div>
            <div style={styles.summaryRow}>
              <span>Balance Due:</span>
              <div style={{...styles.summaryValue, color: '#FFD700'}}>
                ${Math.abs(card.balance || 0).toLocaleString()}
              </div>
            </div>
            <div style={styles.summaryRow}>
              <span>Minimum Payment:</span>
              <div style={styles.summaryValue}>${(card.minimum_payment || 25).toLocaleString()}</div>
            </div>
            <div style={styles.summaryRow}>
              <span>Due Date:</span>
              <div style={styles.summaryValue}>{card.due_date || 'N/A'}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

const styles = {
  container: {
    height: '100%',
  },
  splitLayout: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: '24px',
    height: '100%',
  },
  qrSection: {
    display: 'flex',
    flexDirection: 'column',
  },
  qrCard: {
    background: '#111827',
    borderRadius: '12px',
    padding: '24px',
    textAlign: 'center',
    border: '1px solid #374151',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
    marginBottom: '16px',
  },
  qrCodeWrapper: {
    display: 'flex',
    justifyContent: 'center',
    margin: '20px 0',
    padding: '20px',
    background: 'white',
    borderRadius: '12px',
  },
  qrInstruction: {
    fontSize: '13px',
    color: '#D1D5DB',
    marginTop: '16px',
  },
  timerBox: {
    marginTop: '12px',
    padding: '8px',
    background: '#374151',
    borderRadius: '6px',
    fontSize: '12px',
    color: '#F59E0B',
  },
  qrAlt: {
    fontSize: '11px',
    color: '#6B7280',
    marginTop: '8px',
  },
  instructionsSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  stepsCard: {
    background: '#111827',
    borderRadius: '12px',
    padding: '24px',
    border: '1px solid #374151',
  },
  stepList: {
    marginBottom: '24px',
  },
  stepItem: {
    display: 'flex',
    gap: '12px',
    marginBottom: '20px',
  },
  stepNumber: {
    width: '28px',
    height: '28px',
    background: '#3B82F6',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '14px',
    fontWeight: 'bold',
    flexShrink: 0,
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontWeight: 'bold',
    marginBottom: '4px',
    color: 'white',
  },
  stepDescription: {
    fontSize: '12px',
    color: '#9CA3AF',
    margin: 0,
  },
  divider: {
    height: '1px',
    background: '#374151',
    margin: '20px 0',
  },
  alternativeButtons: {
    display: 'flex',
    gap: '12px',
    marginBottom: '16px',
  },
  altButton: {
    flex: 1,
    padding: '10px',
    background: '#374151',
    border: 'none',
    borderRadius: '6px',
    color: 'white',
    cursor: 'pointer',
    fontSize: '13px',
    transition: 'background 0.2s',
    ':hover': {
      background: '#4B5563',
    },
  },
  securityNote: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '11px',
    color: '#6B7280',
    justifyContent: 'center',
  },
  summaryCard: {
    background: 'rgba(16, 185, 129, 0.1)',
    borderRadius: '12px',
    padding: '16px',
    border: '1px solid rgba(16, 185, 129, 0.3)',
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '8px 0',
    fontSize: '13px',
    color: '#D1D5DB',
  },
  summaryValue: {
    fontWeight: 'bold',
    color: 'white',
  },
};

export default MobilePaymentView;