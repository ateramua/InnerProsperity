import React from 'react';
import { useRouter } from 'next/router';

/** Empty-state CTA: manual add or connect via Linked Banks (plan §16). */
const ConnectBankCTA = ({ onNavigate, label = 'accounts' }) => {
  const router = useRouter();

  const goLinkedBanks = () => {
    if (typeof onNavigate === 'function') {
      onNavigate('linked-banks');
    } else {
      router.push('/?view=linked-banks');
    }
  };

  return (
    <p style={styles.text}>
      No {label} yet. Add manually or{' '}
      <button type="button" style={styles.linkBtn} onClick={goLinkedBanks}>
        connect a bank in Linked Banks
      </button>
      .
    </p>
  );
};

const styles = {
  text: {
    color: '#9CA3AF',
    fontSize: '0.9rem',
    lineHeight: 1.5,
    margin: 0,
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: '#60A5FA',
    cursor: 'pointer',
    padding: 0,
    fontSize: 'inherit',
    textDecoration: 'underline',
  },
};

export default ConnectBankCTA;
