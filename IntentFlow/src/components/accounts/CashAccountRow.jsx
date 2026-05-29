import React from 'react';
import PlaidLinkedBadge from '../PlaidLinkedBadge';
import PlaidManageConnectionLink from '../PlaidManageConnectionLink';
import { normalizeAccountId } from '../../utils/cashAccountUtils';

/**
 * One checking or savings row — edit/delete behavior is identical for both types.
 */
const CashAccountRow = ({
  account,
  styles,
  deletingAccountId,
  onAccountClick,
  onEdit,
  onDelete,
  formatCurrency,
  getAccountIcon,
}) => {
  const id = normalizeAccountId(account.id);
  const isDeleting = deletingAccountId === id;

  return (
    <div style={styles.accountRow}>
      <div
        style={styles.accountInfo}
        onClick={() => onAccountClick(account.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onAccountClick(account.id);
          }
        }}
        role="button"
        tabIndex={0}
      >
        <span style={styles.accountIcon}>{getAccountIcon(account.type)}</span>
        <div>
          <div style={styles.accountName}>
            {account.name}
            <PlaidLinkedBadge account={account} />
            <PlaidManageConnectionLink account={account} />
          </div>
          <div style={styles.accountMeta}>
            {account.institution || 'No institution'}
            {account.account_number && ` • •••• ${String(account.account_number).slice(-4)}`}
          </div>
        </div>
      </div>
      <div style={styles.accountActions}>
        <div style={styles.accountBalance}>
          <div style={styles.balanceAmount}>{formatCurrency(account.balance)}</div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(account);
          }}
          style={styles.editButton}
          title="Edit Account"
          disabled={isDeleting}
        >
          ✏️
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete(account);
          }}
          style={styles.deleteButton}
          title="Delete Account"
          disabled={isDeleting}
          aria-busy={isDeleting}
        >
          {isDeleting ? '…' : '🗑️'}
        </button>
      </div>
    </div>
  );
};

export default CashAccountRow;
