import React from 'react';
import { useRouter } from 'next/router';
import { isPlaidLinkedAccount } from '../utils/plaidAccountUtils';

/**
 * Deep link to Linked Banks for a bank-linked account (plan §16).
 */
const PlaidManageConnectionLink = ({ account, onNavigate, style = {} }) => {
  const router = useRouter();
  if (!isPlaidLinkedAccount(account)) return null;

  const go = (e) => {
    e?.stopPropagation?.();
    e?.preventDefault?.();
    if (typeof onNavigate === 'function') {
      onNavigate('linked-banks');
      return;
    }
    router.push('/?view=linked-banks');
  };

  return (
    <button type="button" onClick={go} style={{ ...styles.link, ...style }} title="Manage bank connection">
      Manage connection
    </button>
  );
};

const styles = {
  link: {
    marginTop: '0.35rem',
    padding: '0.25rem 0.5rem',
    background: 'transparent',
    border: '1px solid rgba(147, 197, 253, 0.45)',
    borderRadius: '0.25rem',
    color: '#93C5FD',
    fontSize: '0.75rem',
    cursor: 'pointer',
    fontWeight: 500,
  },
};

export default PlaidManageConnectionLink;
