// src/components/CreditCardPaymentModal.jsx
import React, { useState } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import the payment option components
const PaymentOptionsSelector = dynamic(() => import('./PaymentOptionsSelector'), { ssr: false });
const EmbeddedPaymentView = dynamic(() => import('./EmbeddedPaymentView'), { ssr: false });
const MobilePaymentView = dynamic(() => import('./MobilePaymentView'), { ssr: false });

const CreditCardPaymentModal = ({ isOpen, onClose, card, onPaymentComplete }) => {
  const [selectedOption, setSelectedOption] = useState(null);
  const [paymentCompleted, setPaymentCompleted] = useState(false);

  if (!isOpen) return null;

  const handleOptionSelect = (option) => {
    setSelectedOption(option);
  };

  const handlePaymentComplete = () => {
    setPaymentCompleted(true);
    onPaymentComplete && onPaymentComplete();
    
    setTimeout(() => {
      handleClose();
    }, 2000);
  };

  const handleBack = () => {
    setSelectedOption(null);
    setPaymentCompleted(false);
  };

  const handleClose = () => {
    setSelectedOption(null);
    setPaymentCompleted(false);
    onClose();
  };

  return (
    <div style={styles.modalOverlay} onClick={handleClose}>
      <div style={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
        
        <div style={styles.modalHeader}>
          <div style={styles.headerLeft}>
            {selectedOption && (
              <button onClick={handleBack} style={styles.backButton}>
                ← Back
              </button>
            )}
            <h2 style={styles.modalTitle}>
              {selectedOption === 'embedded' && 'Pay on Computer'}
              {selectedOption === 'mobile' && 'Pay on Phone'}
              {!selectedOption && 'Make Payment'}
            </h2>
          </div>
          <button onClick={handleClose} style={styles.closeButton}>×</button>
        </div>

        <div style={styles.cardBanner}>
          <div style={styles.cardIcon}>💳</div>
          <div style={styles.cardDetails}>
            <div style={styles.cardName}>{card.name}</div>
            <div style={styles.cardNumber}>•••• {card.card_number?.slice(-4)}</div>
          </div>
          <div style={styles.cardBalance}>
            <div style={styles.balanceLabel}>Balance</div>
            <div style={styles.balanceAmount}>${Math.abs(card.balance || 0).toLocaleString()}</div>
          </div>
          <div style={styles.cardDueDate}>
            <div style={styles.dueLabel}>Due Date</div>
            <div style={styles.dueDate}>{card.due_date || 'N/A'}</div>
          </div>
        </div>

        <div style={styles.modalBody}>
          {paymentCompleted ? (
            <div style={styles.successMessage}>
              <div style={styles.successIcon}>✅</div>
              <h3>Payment Initiated!</h3>
              <p>Your payment is being processed. The balance will update shortly.</p>
            </div>
          ) : !selectedOption ? (
            <PaymentOptionsSelector card={card} onSelect={handleOptionSelect} />
          ) : selectedOption === 'embedded' ? (
            <EmbeddedPaymentView card={card} onPaymentComplete={handlePaymentComplete} />
          ) : (
            <MobilePaymentView card={card} onPaymentComplete={handlePaymentComplete} />
          )}
        </div>
      </div>
    </div>
  );
};

const styles = {
  modalOverlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0, 0, 0, 0.85)',
    backdropFilter: 'blur(8px)',
    zIndex: 10000,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContainer: {
    width: '90%',
    maxWidth: '1100px',
    height: '85vh',
    background: '#1F2937',
    borderRadius: '16px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    boxShadow: '0 25px 50px -12px rgba(0,0,0,0.5)',
    border: '1px solid rgba(76, 175, 80, 0.2)',
  },
  modalHeader: {
    padding: '16px 24px',
    borderBottom: '1px solid #374151',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    background: '#111827',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  backButton: {
    background: '#374151',
    border: 'none',
    color: 'white',
    padding: '6px 12px',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '14px',
  },
  modalTitle: {
    fontSize: '20px',
    fontWeight: '600',
    color: 'white',
    margin: 0,
  },
  closeButton: {
    background: 'none',
    border: 'none',
    color: '#9CA3AF',
    fontSize: '28px',
    cursor: 'pointer',
    padding: '0 8px',
  },
  cardBanner: {
    background: 'linear-gradient(135deg, #2E7D32, #1B5E20)',
    padding: '16px 24px',
    display: 'flex',
    alignItems: 'center',
    gap: '24px',
    flexWrap: 'wrap',
  },
  cardIcon: {
    fontSize: '32px',
  },
  cardDetails: {
    flex: 1,
  },
  cardName: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
  },
  cardNumber: {
    fontSize: '14px',
    color: '#C8E6C9',
    fontFamily: 'monospace',
  },
  cardBalance: {
    textAlign: 'right',
  },
  balanceLabel: {
    fontSize: '11px',
    color: '#C8E6C9',
    textTransform: 'uppercase',
  },
  balanceAmount: {
    fontSize: '24px',
    fontWeight: 'bold',
    color: '#FFD700',
  },
  cardDueDate: {
    textAlign: 'right',
  },
  dueLabel: {
    fontSize: '11px',
    color: '#C8E6C9',
    textTransform: 'uppercase',
  },
  dueDate: {
    fontSize: '16px',
    fontWeight: '600',
    color: 'white',
  },
  modalBody: {
    flex: 1,
    overflow: 'auto',
    padding: '24px',
  },
  successMessage: {
    textAlign: 'center',
    padding: '60px 20px',
  },
  successIcon: {
    fontSize: '64px',
    marginBottom: '16px',
  },
};

export default CreditCardPaymentModal;