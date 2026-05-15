import React from 'react';
import { isPlaidLinkedAccount } from '../utils/plaidAccountUtils';

const PlaidLinkedBadge = ({ account, style = {} }) => {
  if (!isPlaidLinkedAccount(account)) return null;
  return (
    <span
      title="Synced from your bank via Plaid. Balance updates when you sync in Linked Banks."
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.25rem',
        marginLeft: '0.5rem',
        padding: '0.15rem 0.5rem',
        fontSize: '0.7rem',
        fontWeight: 600,
        borderRadius: '9999px',
        background: 'rgba(0, 71, 171, 0.35)',
        color: '#93C5FD',
        border: '1px solid rgba(147, 197, 253, 0.4)',
        verticalAlign: 'middle',
        ...style,
      }}
    >
      🔗 Bank-linked
    </span>
  );
};

export default PlaidLinkedBadge;
