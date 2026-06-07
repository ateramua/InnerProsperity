/** Transfer / payment payee helpers (main process). */

const TRANSFER_PAYEE_PREFIX = 'Transfer:';
const PAYMENT_PAYEE_PREFIX = 'Payment:';

const PAYMENT_DESTINATION_TYPES = new Set(['credit', 'loan']);
const TRANSFER_DESTINATION_TYPES = new Set(['checking', 'savings']);

function stripRoutingSuffixAfterPrefix(payee, prefix) {
  const name = String(payee || '').trim();
  const head = `${prefix} `;
  if (!name.startsWith(head)) return null;
  let rest = name.slice(head.length).trim();
  if (rest.toLowerCase().startsWith('to ')) rest = rest.slice(3).trim();
  return rest || null;
}

function isTransferPayeeLabel(payee) {
  const name = String(payee || '').trim();
  return name.length > TRANSFER_PAYEE_PREFIX.length + 1 && name.startsWith(`${TRANSFER_PAYEE_PREFIX} `);
}

function isPaymentPayeeLabel(payee) {
  const name = String(payee || '').trim();
  return name.length > PAYMENT_PAYEE_PREFIX.length + 1 && name.startsWith(`${PAYMENT_PAYEE_PREFIX} `);
}

function isAccountRoutingPayeeLabel(payee) {
  return isTransferPayeeLabel(payee) || isPaymentPayeeLabel(payee);
}

function formatTransferPayeeName(accountName) {
  return `${TRANSFER_PAYEE_PREFIX} to ${String(accountName || '').trim()}`;
}

function formatPaymentPayeeName(accountName) {
  return `${PAYMENT_PAYEE_PREFIX} to ${String(accountName || '').trim()}`;
}

function parseTransferDestinationName(payee) {
  if (!isTransferPayeeLabel(payee)) return null;
  return stripRoutingSuffixAfterPrefix(payee, TRANSFER_PAYEE_PREFIX);
}

function parsePaymentDestinationName(payee) {
  if (!isPaymentPayeeLabel(payee)) return null;
  return stripRoutingSuffixAfterPrefix(payee, PAYMENT_PAYEE_PREFIX);
}

function parseAccountRoutingDestinationName(payee) {
  return parsePaymentDestinationName(payee) || parseTransferDestinationName(payee);
}

/**
 * Build payee dropdown rows for account-to-account routing (excludes current account).
 * @returns {{ paymentPayees: object[], transferPayees: object[] }}
 */
function buildAccountPayeeOptions(accounts, currentAccountId) {
  const paymentPayees = [];
  const transferPayees = [];
  const excludeId = currentAccountId != null ? String(currentAccountId) : null;

  for (const account of accounts || []) {
    if (account?.id == null) continue;
    if (excludeId && String(account.id) === excludeId) continue;

    const type = String(account.type || '').toLowerCase();
    const base = {
      is_transfer_payee: true,
      isTransfer: true,
      transfer_account_id: account.id,
      transferAccountId: account.id,
      account_type: account.type,
      accountType: account.type,
    };

    if (PAYMENT_DESTINATION_TYPES.has(type)) {
      paymentPayees.push({
        ...base,
        id: `payment_${account.id}`,
        name: formatPaymentPayeeName(account.name),
        payeeKind: 'payment',
        isPaymentPayee: true,
      });
    }

    if (TRANSFER_DESTINATION_TYPES.has(type)) {
      transferPayees.push({
        ...base,
        id: `transfer_${account.id}`,
        name: formatTransferPayeeName(account.name),
        payeeKind: 'transfer',
        isPaymentPayee: false,
      });
    } else if (!PAYMENT_DESTINATION_TYPES.has(type)) {
      transferPayees.push({
        ...base,
        id: `transfer_${account.id}`,
        name: formatTransferPayeeName(account.name),
        payeeKind: 'transfer',
        isPaymentPayee: false,
      });
    }
  }

  const byName = (a, b) => String(a.name).localeCompare(String(b.name));
  paymentPayees.sort(byName);
  transferPayees.sort(byName);

  return { paymentPayees, transferPayees };
}

module.exports = {
  TRANSFER_PAYEE_PREFIX,
  PAYMENT_PAYEE_PREFIX,
  isTransferPayeeLabel,
  isPaymentPayeeLabel,
  isAccountRoutingPayeeLabel,
  formatTransferPayeeName,
  formatPaymentPayeeName,
  parseTransferDestinationName,
  parsePaymentDestinationName,
  parseAccountRoutingDestinationName,
  buildAccountPayeeOptions,
};
