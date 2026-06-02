/**
 * Keep transfer payee labels in sync when account names change (FR-2, optional migration).
 */
const { formatTransferPayeeName } = require('../../shared/transferPayeeUtils.cjs');

async function syncTransferPayeesAfterAccountRename(db, userId, accountId, newAccountName) {
  const payee = formatTransferPayeeName(newAccountName);
  await db.run(
    `UPDATE transactions
     SET payee = ?, updated_at = datetime('now')
     WHERE user_id = ? AND is_transfer = 1 AND counterparty_account_id = ?`,
    [payee, userId, accountId]
  );
}

module.exports = {
  syncTransferPayeesAfterAccountRename,
};
