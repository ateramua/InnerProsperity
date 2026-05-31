import React from 'react';
import { isPlaidLinkedAccount } from '../../utils/accountRegisterBalance.jsx';
import { isCreditCardAccountType } from '../../utils/accountBalanceEngine.jsx';

const styles = {
  card: {
    background: '#1F2937',
    borderRadius: '12px',
    padding: '1.25rem 1.5rem',
    marginBottom: '1.5rem',
    border: '1px solid #374151',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '1rem',
  },
  item: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  label: {
    fontSize: '0.75rem',
    color: '#9CA3AF',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
  },
  value: {
    fontSize: '1.25rem',
    fontWeight: 700,
    color: '#F3F4F6',
  },
  sub: {
    fontSize: '0.75rem',
    color: '#6B7280',
    marginTop: '0.125rem',
  },
  note: {
    marginTop: '0.75rem',
    fontSize: '0.8125rem',
    color: '#9CA3AF',
    lineHeight: 1.4,
  },
  divider: {
    borderTop: '1px solid #374151',
    marginTop: '1rem',
    paddingTop: '0.75rem',
  },
};

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount) || 0);
}

function balanceColor(amount, accountType) {
  const n = Number(amount) || 0;
  if (isCreditCardAccountType(accountType)) {
    return n < 0 ? '#F87171' : '#4ADE80';
  }
  return n >= 0 ? '#4ADE80' : '#F87171';
}

function formatBalanceDisplay(amount, accountType) {
  const n = Number(amount) || 0;
  if (isCreditCardAccountType(accountType)) {
    return formatCurrency(Math.abs(n));
  }
  return formatCurrency(n);
}

function balanceSuffix(amount, accountType) {
  if (isCreditCardAccountType(accountType) && Number(amount) < 0) {
    return ' (you owe)';
  }
  return '';
}

/**
 * Three-tier balance summary: working, cleared, uncleared (+ optional bank balance for Plaid).
 */
export default function AccountBalanceSummary({
  account,
  balances,
  formatCurrency: formatFn = formatCurrency,
}) {
  if (!account || !balances) return null;

  const accountType = account.type;
  const plaidLinked = isPlaidLinkedAccount(account);
  const bankBalance = Number(account.balance);
  const showBankBalance =
    plaidLinked && Number.isFinite(bankBalance) && Math.abs(bankBalance - balances.working_balance) > 0.01;

  const working = balances.working_balance;
  const cleared = balances.cleared_balance;
  const uncleared = balances.uncleared_balance;

  return (
    <div style={styles.card}>
      <div style={styles.grid}>
        <div style={styles.item}>
          <div style={styles.label}>Working Balance</div>
          <div style={{ ...styles.value, color: balanceColor(working, accountType) }}>
            {formatBalanceDisplay(working, accountType)}
            {balanceSuffix(working, accountType) && (
              <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#9CA3AF' }}>
                {balanceSuffix(working, accountType)}
              </span>
            )}
          </div>
          <div style={styles.sub}>All transactions (cleared + pending)</div>
        </div>

        <div style={styles.item}>
          <div style={styles.label}>Cleared Balance</div>
          <div style={{ ...styles.value, color: balanceColor(cleared, accountType) }}>
            {formatBalanceDisplay(cleared, accountType)}
          </div>
          <div style={styles.sub}>Bank-cleared &amp; reconciled only</div>
        </div>

        <div style={styles.item}>
          <div style={styles.label}>Uncleared</div>
          <div
            style={{
              ...styles.value,
              color: uncleared === 0 ? '#9CA3AF' : balanceColor(uncleared, accountType),
              fontSize: '1.1rem',
            }}
          >
            {uncleared >= 0 ? '+' : ''}
            {formatFn(uncleared)}
          </div>
          <div style={styles.sub}>Pending transaction impact</div>
        </div>

        {showBankBalance && (
          <div style={styles.item}>
            <div style={styles.label}>Bank Balance</div>
            <div style={{ ...styles.value, color: balanceColor(bankBalance, accountType) }}>
              {formatBalanceDisplay(bankBalance, accountType)}
            </div>
            <div style={styles.sub}>Last synced from your bank</div>
          </div>
        )}
      </div>

      <div style={styles.divider}>
        <div style={styles.note}>
          <strong>Working balance</strong> is your register total (starting balance + all transactions).
          {plaidLinked && (
            <> For linked accounts, <strong>bank balance</strong> comes from your institution and may differ until you reconcile.</>
          )}
          {!plaidLinked && (
            <> This is your account&apos;s current balance — not the same as individual transaction amounts in the list.</>
          )}
        </div>
      </div>
    </div>
  );
}

export { formatBalanceDisplay, balanceColor, balanceSuffix };
