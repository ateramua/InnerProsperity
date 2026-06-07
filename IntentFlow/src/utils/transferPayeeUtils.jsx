/** Payee labels for account-to-account routing in dropdowns and stored rows. */
export const TRANSFER_PAYEE_PREFIX = 'Transfer:';
export const PAYMENT_PAYEE_PREFIX = 'Payment:';

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

export function isTransferPayeeLabel(payee) {
  const name = (payee || '').trim();
  return name.length > TRANSFER_PAYEE_PREFIX.length + 1 && name.startsWith(`${TRANSFER_PAYEE_PREFIX} `);
}

export function isPaymentPayeeLabel(payee) {
  const name = (payee || '').trim();
  return name.length > PAYMENT_PAYEE_PREFIX.length + 1 && name.startsWith(`${PAYMENT_PAYEE_PREFIX} `);
}

export function isAccountRoutingPayeeLabel(payee) {
  return isTransferPayeeLabel(payee) || isPaymentPayeeLabel(payee);
}

export function formatTransferPayeeName(accountName) {
  return `${TRANSFER_PAYEE_PREFIX} to ${String(accountName || '').trim()}`;
}

export function formatPaymentPayeeName(accountName) {
  return `${PAYMENT_PAYEE_PREFIX} to ${String(accountName || '').trim()}`;
}

export function parseTransferDestinationName(payee) {
  if (!isTransferPayeeLabel(payee)) return null;
  return stripRoutingSuffixAfterPrefix(payee, TRANSFER_PAYEE_PREFIX);
}

export function parsePaymentDestinationName(payee) {
  if (!isPaymentPayeeLabel(payee)) return null;
  return stripRoutingSuffixAfterPrefix(payee, PAYMENT_PAYEE_PREFIX);
}

export function parseAccountRoutingDestinationName(payee) {
  return parsePaymentDestinationName(payee) || parseTransferDestinationName(payee);
}

/**
 * @returns {{ paymentPayees: object[], transferPayees: object[] }}
 */
export function buildAccountPayeeOptions(accounts, currentAccountId) {
  const paymentPayees = [];
  const transferPayees = [];
  const excludeId = currentAccountId != null ? String(currentAccountId) : null;

  for (const account of accounts || []) {
    if (account?.id == null) continue;
    if (excludeId && String(account.id) === excludeId) continue;

    const type = String(account.type || '').toLowerCase();
    const base = {
      isTransfer: true,
      transferAccountId: account.id,
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

/** All routing options (payments + transfers) for matching and filters. */
export function getAllRoutingPayees(payees) {
  return [...(payees?.paymentPayees || []), ...(payees?.transferPayees || [])];
}

export function mapRoutingPayeeOption(row) {
  return {
    id: row.id || `transfer_${row.transfer_account_id || row.transferAccountId}`,
    name: row.name,
    isTransfer: true,
    transferAccountId: row.transfer_account_id ?? row.transferAccountId,
    accountType: row.account_type ?? row.accountType,
    payeeKind: row.payee_kind ?? row.payeeKind ?? (row.is_payment_payee || row.isPaymentPayee ? 'payment' : 'transfer'),
    isPaymentPayee: Boolean(row.is_payment_payee ?? row.isPaymentPayee),
  };
}

export function mapPayeesFromFormApi(data) {
  return {
    paymentPayees: (data?.paymentPayees || []).map(mapRoutingPayeeOption),
    transferPayees: (data?.transferPayees || []).map(mapRoutingPayeeOption),
    regularPayees: (data?.regularPayees || []).map((p) => ({
      id: p.id,
      name: p.name,
      isTransfer: false,
      transferAccountId: null,
      usageCount: p.usage_count ?? p.usageCount,
    })),
  };
}

export const EMPTY_PAYEES_FORM = {
  paymentPayees: [],
  transferPayees: [],
  regularPayees: [],
};

export function isTransferTransaction(tx) {
  if (!tx) return false;
  if (tx.is_transfer === 1 || tx.is_transfer === true) return true;
  return isAccountRoutingPayeeLabel(tx.payee || tx.description);
}

/**
 * Strip UI-only fields and clear category when payee is a transfer option (register inline edits).
 */
export function normalizeInlineTransactionUpdates(updates) {
  if (!updates || typeof updates !== 'object') return updates;

  const { picked, ...rest } = updates;
  const payee = rest.payee ?? rest.description;

  if (picked?.isTransfer && picked?.transferAccountId) {
    return {
      ...rest,
      payee: picked.name || payee,
      description: picked.name || rest.description || payee,
      destinationAccountId: picked.transferAccountId,
      category_id: null,
      categoryId: null,
      category_name: null,
      mapping_status: 'transfer',
    };
  }

  if (picked && picked.isTransfer === false) {
    return {
      ...rest,
      payee: picked.name || payee,
      description: picked.name || rest.description || payee,
      convertToRegular: true,
    };
  }

  const isRouting = isAccountRoutingPayeeLabel(payee);

  if (!isRouting) return rest;

  return {
    ...rest,
    category_id: null,
    categoryId: null,
    category_name: null,
    mapping_status: 'transfer',
  };
}
