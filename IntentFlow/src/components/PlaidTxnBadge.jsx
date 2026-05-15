import React from 'react';
import { isPlaidImportedTransaction } from '../utils/plaidTransactionUtils';

/** Small indicator on bank-imported transactions in register views. */
const PlaidTxnBadge = ({ transaction, style = {} }) => {
  if (!isPlaidImportedTransaction(transaction)) return null;
  return (
    <span style={{ ...styles.badge, ...style }} title="Imported from your bank via Plaid">
      Bank
    </span>
  );
};

const styles = {
  badge: {
    display: 'inline-block',
    marginLeft: '0.35rem',
    padding: '0.1rem 0.35rem',
    fontSize: '0.65rem',
    fontWeight: 600,
    borderRadius: '0.25rem',
    background: 'rgba(0, 71, 171, 0.35)',
    color: '#93C5FD',
    verticalAlign: 'middle',
  },
};

export default PlaidTxnBadge;
