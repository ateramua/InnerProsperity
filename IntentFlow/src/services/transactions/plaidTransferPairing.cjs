/**
 * Detect and link opposite-amount transactions across accounts (FR-7).
 * Runs after Plaid sync for transactions not already marked as transfers.
 */

const { v4: uuidv4 } = require('uuid');

const DATE_TOLERANCE_DAYS = 3;
const AMOUNT_TOLERANCE = 0.01;

function roundMoney(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function daysBetween(d1, d2) {
  const a = new Date(`${String(d1).slice(0, 10)}T12:00:00`);
  const b = new Date(`${String(d2).slice(0, 10)}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 999;
  return Math.abs(Math.round((a - b) / (24 * 60 * 60 * 1000)));
}

function cutoffDateIso(lookbackDays) {
  const d = new Date();
  d.setDate(d.getDate() - lookbackDays);
  return d.toISOString().slice(0, 10);
}

function transferLikelihood(a, b) {
  let score = 0;
  if (Math.abs(roundMoney(a.amount) + roundMoney(b.amount)) <= AMOUNT_TOLERANCE) score += 3;
  if (daysBetween(a.date, b.date) <= 1) score += 2;
  else if (daysBetween(a.date, b.date) <= DATE_TOLERANCE_DAYS) score += 1;

  const payeeA = String(a.payee || a.description || '').toLowerCase();
  const payeeB = String(b.payee || b.description || '').toLowerCase();
  if (payeeA.includes('transfer') || payeeB.includes('transfer')) score += 2;
  if (a.plaid_transaction_id && b.plaid_transaction_id) score += 1;

  const types = [a.account_type, b.account_type];
  if (types.includes('credit') && types.includes('checking')) score += 2;
  if (types.includes('credit') && types.includes('savings')) score += 1;

  return score;
}

async function linkTransferPair(db, userId, txA, txB) {
  const outTx = Number(txA.amount) < 0 ? txA : txB;
  const inTx = Number(txA.amount) > 0 ? txA : txB;
  if (Number(outTx.amount) >= 0 || Number(inTx.amount) <= 0) return false;

  const outAccount = await db.get('SELECT id, name FROM accounts WHERE id = ? AND user_id = ?', [
    outTx.account_id,
    userId,
  ]);
  const inAccount = await db.get('SELECT id, name FROM accounts WHERE id = ? AND user_id = ?', [
    inTx.account_id,
    userId,
  ]);
  if (!outAccount || !inAccount) return false;

  const transferGroupId = uuidv4();
  const { formatTransferPayeeName } = require('../../shared/transferPayeeUtils.cjs');
  const outflowPayee = formatTransferPayeeName(inAccount.name);
  const inflowPayee = formatTransferPayeeName(outAccount.name);

  await db.run(
    `UPDATE transactions SET
      is_transfer = 1, category_id = NULL, suggested_category_id = NULL,
      mapping_status = 'transfer', transfer_group_id = ?,
      linked_transaction_id = ?, counterparty_account_id = ?,
      payee = COALESCE(NULLIF(TRIM(payee), ''), ?),
      updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [transferGroupId, inTx.id, inTx.account_id, outflowPayee, outTx.id, userId]
  );

  await db.run(
    `UPDATE transactions SET
      is_transfer = 1, category_id = NULL, suggested_category_id = NULL,
      mapping_status = 'transfer', transfer_group_id = ?,
      linked_transaction_id = ?, counterparty_account_id = ?,
      payee = COALESCE(NULLIF(payee, ''), ?),
      memo = COALESCE(memo, ?),
      updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [
      transferGroupId,
      outTx.id,
      outTx.account_id,
      inflowPayee,
      `Transfer from ${outAccount.name}`,
      inTx.id,
      userId,
    ]
  );

  return true;
}

/**
 * @param {import('sqlite').Database} db
 * @param {number|string} userId
 * @param {{ lookbackDays?: number, minScore?: number }} [options]
 */
async function pairTransfersForUser(db, userId, options = {}) {
  const lookbackDays = options.lookbackDays ?? 45;
  const minScore = options.minScore ?? 4;
  const cutoff = cutoffDateIso(lookbackDays);

  const candidates = await db.all(
    `
    SELECT
      t.id, t.account_id, t.amount, t.date, t.payee, t.description,
      t.plaid_transaction_id, t.is_transfer, t.linked_transaction_id,
      a.type AS account_type, a.name AS account_name
    FROM transactions t
    INNER JOIN accounts a ON CAST(a.id AS TEXT) = CAST(t.account_id AS TEXT)
    WHERE t.user_id = ?
      AND (t.is_deleted IS NULL OR t.is_deleted = 0)
      AND IFNULL(t.is_transfer, 0) = 0
      AND (t.linked_transaction_id IS NULL OR t.linked_transaction_id = '')
      AND IFNULL(t.is_split_parent, 0) = 0
      AND t.date >= ?
    ORDER BY t.date DESC, t.created_at DESC
  `,
    [userId, cutoff]
  );

  const paired = new Set();
  let pairsLinked = 0;
  const accountIds = new Set();

  for (let i = 0; i < candidates.length; i++) {
    const a = candidates[i];
    if (paired.has(a.id)) continue;

    let best = null;
    let bestScore = minScore - 1;

    for (let j = i + 1; j < candidates.length; j++) {
      const b = candidates[j];
      if (paired.has(b.id)) continue;
      if (String(a.account_id) === String(b.account_id)) continue;
      if (Math.abs(roundMoney(a.amount) + roundMoney(b.amount)) > AMOUNT_TOLERANCE) continue;
      if (daysBetween(a.date, b.date) > DATE_TOLERANCE_DAYS) continue;

      const score = transferLikelihood(a, b);
      if (score > bestScore) {
        bestScore = score;
        best = b;
      }
    }

    if (best) {
      const linked = await linkTransferPair(db, userId, a, best);
      if (linked) {
        paired.add(a.id);
        paired.add(best.id);
        accountIds.add(a.account_id);
        accountIds.add(best.account_id);
        pairsLinked += 1;
      }
    }
  }

  return {
    pairsLinked,
    accountIds: [...accountIds],
  };
}

module.exports = {
  pairTransfersForUser,
  linkTransferPair,
  DATE_TOLERANCE_DAYS,
};
