/** Payee label used for account-to-account transfers in dropdowns and stored rows. */
export const TRANSFER_PAYEE_PREFIX = 'Transfer:';

export function isTransferPayeeLabel(payee) {
  const name = (payee || '').trim();
  return name.length > TRANSFER_PAYEE_PREFIX.length + 1 && name.startsWith(`${TRANSFER_PAYEE_PREFIX} `);
}

export function formatTransferPayeeName(accountName) {
  return `${TRANSFER_PAYEE_PREFIX} ${String(accountName || '').trim()}`;
}

export function parseTransferDestinationName(payee) {
  if (!isTransferPayeeLabel(payee)) return null;
  return payee.slice(TRANSFER_PAYEE_PREFIX.length + 1).trim();
}

export function isTransferTransaction(tx) {
  if (!tx) return false;
  if (tx.is_transfer === 1 || tx.is_transfer === true) return true;
  return isTransferPayeeLabel(tx.payee || tx.description);
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

  const isTransfer = isTransferPayeeLabel(payee);

  if (!isTransfer) return rest;

  return {
    ...rest,
    category_id: null,
    categoryId: null,
    category_name: null,
    mapping_status: 'transfer',
  };
}
