import React from 'react';
import PlaidTxnBadge from '../PlaidTxnBadge.jsx';

const badgeStyle = {
  marginLeft: '0.35rem',
  fontSize: '0.7rem',
};

/**
 * Payee column badges aligned with All Accounts register.
 */
export default function RegisterPayeeExtras({ transaction, extra }) {
  const tx = transaction;
  return (
    <>
      {(tx?.is_flagged === 1 || tx?.is_flagged === true) && (
        <span style={badgeStyle} title="Flagged">
          🚩
        </span>
      )}
      <PlaidTxnBadge transaction={tx} />
      {tx?.is_transfer === 1 && (
        <span style={{ ...badgeStyle, color: '#93C5FD' }}>Transfer</span>
      )}
      {tx?.is_split_parent === 1 && (
        <span style={{ ...badgeStyle, color: '#A78BFA' }}>Split</span>
      )}
      {extra}
    </>
  );
}
