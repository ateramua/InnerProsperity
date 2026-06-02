/**
 * Credit card signed balance helpers (renderer).
 * Convention: negative = debt, zero = paid in full, positive = credit (overpayment).
 */

import { isCreditCardAccountType } from './accountBalanceEngine.jsx';

export function getCreditCardBalanceState(signedBalance) {
  const n = Number(signedBalance) || 0;
  if (Math.abs(n) < 0.005) return 'zero';
  if (n > 0) return 'credit';
  return 'debt';
}

export function computeAvailableCredit(creditLimit, signedBalance) {
  const limit = Number(creditLimit) || 0;
  const bal = Number(signedBalance) || 0;
  return limit + bal;
}

export function computeCreditCardDebtAmount(signedBalance) {
  const n = Number(signedBalance) || 0;
  return Math.max(0, -n);
}

export function creditCardBalanceIcon(state) {
  if (state === 'debt') return '🔴';
  if (state === 'credit') return '🟢';
  return '⚪';
}

export function creditCardBalanceSuffix(state) {
  if (state === 'debt') return ' (you owe)';
  if (state === 'credit') return ' (Credit)';
  return '';
}

export function creditCardBalanceColor(signedBalance) {
  const state = getCreditCardBalanceState(signedBalance);
  if (state === 'debt') return '#F87171';
  if (state === 'credit') return '#4ADE80';
  return '#9CA3AF';
}

export function formatCreditCardBalanceDisplay(signedBalance, formatCurrencyFn) {
  const n = Number(signedBalance) || 0;
  const state = getCreditCardBalanceState(n);
  const fmt =
    formatCurrencyFn ||
    ((x) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(x));

  let text;
  if (state === 'credit') {
    text = `+${fmt(Math.abs(n))}`;
  } else if (state === 'debt') {
    text = fmt(n);
  } else {
    text = fmt(0);
  }

  return {
    text,
    suffix: creditCardBalanceSuffix(state),
    state,
    icon: creditCardBalanceIcon(state),
  };
}

export function formatBalanceForAccountType(amount, accountType, formatCurrencyFn) {
  if (isCreditCardAccountType(accountType)) {
    return formatCreditCardBalanceDisplay(amount, formatCurrencyFn);
  }
  const n = Number(amount) || 0;
  const fmt =
    formatCurrencyFn ||
    ((x) =>
      new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(x));
  return {
    text: fmt(n),
    suffix: '',
    state: n >= 0 ? 'asset' : 'liability',
    icon: '',
  };
}

export { isCreditCardAccountType };
