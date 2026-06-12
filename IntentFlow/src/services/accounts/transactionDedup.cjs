/**
 * Transaction deduplication for account merges.
 */
function normalizeMerchant(text) {
  return String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function transactionFingerprint(tx, accountId) {
  const amount = Math.round((Number(tx.amount) || 0) * 100) / 100;
  const date = String(tx.date || '').slice(0, 10);
  const direction = amount < 0 ? 'out' : amount > 0 ? 'in' : 'zero';
  const merchant = normalizeMerchant(tx.payee || tx.description || '');
  return `${accountId}|${date}|${amount}|${direction}|${merchant}`;
}

function merchantSimilarity(a, b) {
  const na = normalizeMerchant(a);
  const nb = normalizeMerchant(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.85;
  const ta = na.split(' ');
  const tb = nb.split(' ');
  const shared = ta.filter((t) => tb.includes(t) && t.length > 2).length;
  return shared >= 2 ? 0.75 : shared >= 1 ? 0.5 : 0;
}

function daysBetween(d1, d2) {
  const a = new Date(d1);
  const b = new Date(d2);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return 999;
  return Math.abs(Math.round((a - b) / (24 * 60 * 60 * 1000)));
}

const DATE_TOLERANCE_DAYS = 3;
const MERCHANT_SIMILARITY_THRESHOLD = 0.75;

/** Signed ledger impact for dedup (supports direction+magnitude and legacy signed amount). */
function signedLedgerAmount(tx) {
  const mag = Math.abs(Number(tx?.amount) || 0);
  if (tx?.direction === 'outflow') return -mag;
  if (tx?.direction === 'inflow') return mag;
  return Math.round((Number(tx?.amount) || 0) * 100) / 100;
}

/**
 * Classify duplicate relationship between manual and incoming tx.
 * @returns {'exact'|'probable'|'unique'}
 */
function classifyTransactionPair(manualTx, incomingTx) {
  const mAmt = signedLedgerAmount(manualTx);
  const iAmt = signedLedgerAmount(incomingTx);
  if (mAmt !== iAmt) return 'unique';

  const mDate = String(manualTx.date || '').slice(0, 10);
  const iDate = String(incomingTx.date || '').slice(0, 10);
  const mMerchant = manualTx.payee || manualTx.description || '';
  const iMerchant = incomingTx.payee || incomingTx.description || '';

  if (mDate === iDate && merchantSimilarity(mMerchant, iMerchant) >= 0.99) {
    return 'exact';
  }

  if (
    daysBetween(mDate, iDate) <= DATE_TOLERANCE_DAYS &&
    merchantSimilarity(mMerchant, iMerchant) >= MERCHANT_SIMILARITY_THRESHOLD
  ) {
    return 'probable';
  }

  return 'unique';
}

/**
 * Analyze txs on source vs survivor for merge preview.
 */
function analyzeMergeDuplicates(sourceTransactions, survivorTransactions) {
  const exact = [];
  const probable = [];
  const unique = [];

  for (const incoming of sourceTransactions) {
    let best = 'unique';
    let matchedId = null;
    for (const manual of survivorTransactions) {
      const kind = classifyTransactionPair(manual, incoming);
      if (kind === 'exact') {
        best = 'exact';
        matchedId = manual.id;
        break;
      }
      if (kind === 'probable' && best !== 'exact') {
        best = 'probable';
        matchedId = manual.id;
      }
    }
    if (best === 'exact') exact.push({ incomingId: incoming.id, matchedId });
    else if (best === 'probable') probable.push({ incomingId: incoming.id, matchedId });
    else unique.push({ incomingId: incoming.id });
  }

  return {
    exactDuplicateCount: exact.length,
    probableDuplicateCount: probable.length,
    uniqueIncomingCount: unique.length,
    exact,
    probable,
    unique,
  };
}

/**
 * During merge: soft-delete exact duplicates on source; keep user metadata on survivor.
 */
async function dedupeTransactionsOnMerge(db, sourceAccountId, survivorAccountId, userId) {
  const sourceTxs = await db.all(
    `SELECT * FROM transactions
     WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT) AND user_id = ?
       AND IFNULL(is_deleted, 0) = 0`,
    [sourceAccountId, userId]
  );
  const survivorTxs = await db.all(
    `SELECT * FROM transactions
     WHERE CAST(account_id AS TEXT) = CAST(? AS TEXT) AND user_id = ?
       AND IFNULL(is_deleted, 0) = 0`,
    [survivorAccountId, userId]
  );

  const analysis = analyzeMergeDuplicates(sourceTxs, survivorTxs);
  let removed = 0;

  for (const { incomingId } of analysis.exact) {
    await db.run(
      `UPDATE transactions SET is_deleted = 1, updated_at = datetime('now') WHERE id = ?`,
      [incomingId]
    );
    removed += 1;
  }

  return { ...analysis, exactDuplicatesRemoved: removed };
}

module.exports = {
  transactionFingerprint,
  classifyTransactionPair,
  analyzeMergeDuplicates,
  dedupeTransactionsOnMerge,
  normalizeMerchant,
};
