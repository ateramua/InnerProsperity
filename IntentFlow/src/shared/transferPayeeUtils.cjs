/** Transfer payee helpers (main process). */

const TRANSFER_PAYEE_PREFIX = 'Transfer:';

function isTransferPayeeLabel(payee) {
  const name = String(payee || '').trim();
  return name.length > TRANSFER_PAYEE_PREFIX.length + 1 && name.startsWith(`${TRANSFER_PAYEE_PREFIX} `);
}

function formatTransferPayeeName(accountName) {
  return `${TRANSFER_PAYEE_PREFIX} ${String(accountName || '').trim()}`;
}

function parseTransferDestinationName(payee) {
  if (!isTransferPayeeLabel(payee)) return null;
  return payee.slice(TRANSFER_PAYEE_PREFIX.length + 1).trim();
}

module.exports = {
  TRANSFER_PAYEE_PREFIX,
  isTransferPayeeLabel,
  formatTransferPayeeName,
  parseTransferDestinationName,
};
