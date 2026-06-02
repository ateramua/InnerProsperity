import React from 'react';

const styles = {
  wrap: {
    background: 'linear-gradient(135deg, #1E3A5F, #0F172A)',
    padding: '0.5rem 0.65rem',
    borderRadius: '0.5rem',
    border: '1px solid #F59E0B',
    maxWidth: '100%',
  },
  badge: {
    fontSize: '0.65rem',
    color: '#F59E0B',
    textTransform: 'uppercase',
    letterSpacing: '0.05em',
    marginBottom: '0.35rem',
    fontWeight: 'bold',
    lineHeight: 1.3,
  },
  message: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    lineHeight: 1.4,
    margin: 0,
  },
};

/**
 * Category column state when payee is a Transfer option (matches Add Transaction modals).
 */
export default function TransferCategoryInlineMessage({
  badge = '🔄 ACCOUNT TRANSFER',
  message = 'This is a transfer to another account. No category is needed.',
}) {
  return (
    <div style={styles.wrap} onClick={(e) => e.stopPropagation()}>
      <div style={styles.badge}>{badge}</div>
      <p style={styles.message}>{message}</p>
    </div>
  );
}
