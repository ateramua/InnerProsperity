import React, { useMemo } from 'react';
import Link from 'next/link';
import InstitutionAvatar from './InstitutionAvatar';
import PlaidLinkedBadge from './PlaidLinkedBadge';
import PlaidManageConnectionLink from './PlaidManageConnectionLink';
import ConnectBankCTA from './ConnectBankCTA';

const AccountsByInstitution = ({
  accounts,
  onNavigate,
  formatCurrency,
  getAccountIcon,
  getBalanceColor,
}) => {
  const groups = useMemo(() => {
    const map = new Map();
    for (const acc of accounts) {
      const key = (acc.institution || 'No institution').trim() || 'No institution';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(acc);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [accounts]);

  if (!accounts.length) return null;

  return (
    <div style={styles.section}>
      <h2 style={styles.sectionTitle}>BY INSTITUTION</h2>
      {groups.map(([institution, group]) => (
        <div key={institution} style={styles.institutionGroup}>
          <div style={styles.institutionHeader}>
            <InstitutionAvatar institution={institution} size={32} />
            <span style={styles.institutionName}>{institution}</span>
            <span style={styles.institutionCount}>{group.length} account(s)</span>
          </div>
          <div style={styles.accountList}>
            {group.map((account) => (
              <Link
                href={`/accounts/${account.id}`}
                key={account.id}
                style={{ textDecoration: 'none' }}
              >
                <div style={styles.accountRow}>
                  <div style={styles.accountInfo}>
                    <span style={styles.accountIcon}>{getAccountIcon(account.type)}</span>
                    <div>
                      <div style={styles.accountName}>
                        {account.name}
                        <PlaidLinkedBadge account={account} />
                      </div>
                      <div style={styles.accountMeta}>
                        {account.type}
                        {account.external_mask ? ` •••• ${account.external_mask}` : ''}
                      </div>
                      <PlaidManageConnectionLink account={account} onNavigate={onNavigate} />
                    </div>
                  </div>
                  <div style={styles.accountBalance}>
                    <div
                      style={{
                        ...styles.balanceAmount,
                        color: getBalanceColor(account.balance, account.type),
                      }}
                    >
                      {formatCurrency(account.balance)}
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ))}
      <ConnectBankCTA label="accounts" />
    </div>
  );
};

const styles = {
  section: { marginBottom: '2rem' },
  sectionTitle: {
    fontSize: '0.75rem',
    fontWeight: 700,
    letterSpacing: '0.12em',
    color: '#9CA3AF',
    marginBottom: '1rem',
  },
  institutionGroup: { marginBottom: '1.25rem' },
  institutionHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    marginBottom: '0.5rem',
  },
  institutionName: { fontWeight: 600, color: '#F3F4F6', flex: 1 },
  institutionCount: { fontSize: '0.8rem', color: '#9CA3AF' },
  accountList: { display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  accountRow: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '1rem',
    background: 'rgba(31, 41, 55, 0.6)',
    borderRadius: '0.5rem',
    border: '1px solid rgba(55, 65, 81, 0.5)',
  },
  accountInfo: { display: 'flex', alignItems: 'center', gap: '1rem' },
  accountIcon: { fontSize: '1.5rem' },
  accountName: {
    fontWeight: 600,
    color: '#F3F4F6',
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  accountMeta: { fontSize: '0.85rem', color: '#9CA3AF', marginTop: '0.15rem' },
  accountBalance: { textAlign: 'right' },
  balanceAmount: { fontSize: '1.1rem', fontWeight: 600 },
};

export default AccountsByInstitution;
