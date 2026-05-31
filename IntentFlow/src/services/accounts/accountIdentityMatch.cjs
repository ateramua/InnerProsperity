/**
 * Account identity matching — weighted confidence scoring (0–100).
 */
const { mapPlaidTypeToInternal } = require('../plaid/plaidService.cjs');

const WEIGHTS = Object.freeze({
  mask: 40,
  institution: 25,
  type: 15,
  name: 10,
  balance: 10,
});

const THRESHOLD_AUTO = 95;
const THRESHOLD_CONFIRM = 70;

function normalize(str) {
  return String(str ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, ' ');
}

function extractLast4(account) {
  const mask = account?.external_mask || account?.mask || '';
  if (mask && /^\d{4}$/.test(String(mask).trim())) return String(mask).trim();
  const num = account?.account_number || '';
  const digits = String(num).replace(/\D/g, '');
  if (digits.length >= 4) return digits.slice(-4);
  return '';
}

function institutionScore(manualInstitution, plaidInstitution) {
  const a = normalize(manualInstitution);
  const b = normalize(plaidInstitution);
  if (!a || !b) return 0;
  if (a === b) return WEIGHTS.institution;
  if (a.includes(b) || b.includes(a)) return Math.round(WEIGHTS.institution * 0.85);
  return 0;
}

function nameSimilarityScore(manualName, plaidDisplayName) {
  const a = normalize(manualName);
  const b = normalize(plaidDisplayName);
  if (!a || !b) return 0;
  if (a === b) return WEIGHTS.name;
  if (a.includes(b) || b.includes(a)) return Math.round(WEIGHTS.name * 0.8);
  const aTokens = a.split(/\s+/).filter(Boolean);
  const bTokens = b.split(/\s+/).filter(Boolean);
  const overlap = aTokens.filter((t) => bTokens.includes(t)).length;
  if (overlap >= 2) return Math.round(WEIGHTS.name * 0.6);
  return 0;
}

function balanceSimilarityScore(manualBalance, plaidBalance) {
  const a = Math.abs(Number(manualBalance) || 0);
  const b = Math.abs(Number(plaidBalance) || 0);
  if (a === 0 && b === 0) return WEIGHTS.balance;
  const max = Math.max(a, b, 1);
  const diff = Math.abs(a - b);
  const pct = diff / max;
  if (pct <= 0.02 || diff <= 50) return WEIGHTS.balance;
  if (pct <= 0.1 || diff <= 250) return Math.round(WEIGHTS.balance * 0.5);
  return 0;
}

/**
 * @param {object} manualAccount — row from accounts
 * @param {object} plaidContext — { mask, institutionName, internalType, displayName, balance }
 */
function scoreAccountMatch(manualAccount, plaidContext) {
  const manualMask = extractLast4(manualAccount);
  const plaidMask = String(plaidContext.mask || '').trim();
  let score = 0;
  const breakdown = {};

  if (manualMask && plaidMask && manualMask === plaidMask) {
    breakdown.mask = WEIGHTS.mask;
    score += WEIGHTS.mask;
  } else {
    breakdown.mask = 0;
  }

  breakdown.institution = institutionScore(
    manualAccount.institution,
    plaidContext.institutionName
  );
  score += breakdown.institution;

  const manualType = normalize(manualAccount.type);
  const plaidType = normalize(plaidContext.internalType);
  if (manualType && plaidType && manualType === plaidType) {
    breakdown.type = WEIGHTS.type;
    score += WEIGHTS.type;
  } else {
    breakdown.type = 0;
  }

  breakdown.name = nameSimilarityScore(manualAccount.name, plaidContext.displayName);
  score += breakdown.name;

  breakdown.balance = balanceSimilarityScore(manualAccount.balance, plaidContext.balance);
  score += breakdown.balance;

  const confidence = Math.min(100, Math.max(0, Math.round(score)));

  let tier = 'low';
  if (confidence >= THRESHOLD_AUTO) tier = 'high';
  else if (confidence >= THRESHOLD_CONFIRM) tier = 'medium';

  return {
    confidence,
    tier,
    breakdown,
    recommendedAction:
      tier === 'high' ? 'auto_merge' : tier === 'medium' ? 'confirm_merge' : 'create_new',
  };
}

/**
 * Find and score manual account candidates for a Plaid account.
 */
async function findScoredManualCandidates(db, userId, plaidContext) {
  const internalType = plaidContext.internalType || 'other';
  let query = `
    SELECT a.id, a.name, a.type, a.external_mask, a.institution, a.balance, a.source,
           a.account_number, a.account_status
    FROM accounts a
    WHERE a.user_id = ?
      AND a.is_active = 1
      AND IFNULL(a.account_status, 'active') = 'active'
      AND (a.source IS NULL OR a.source = 'manual')
      AND a.type = ?
      AND NOT EXISTS (SELECT 1 FROM plaid_accounts pa WHERE pa.account_id = a.id)
  `;
  const params = [userId, internalType];

  const mask = plaidContext.mask || null;
  const institutionName = plaidContext.institutionName || null;

  if (mask) {
    query += ` AND (
      a.external_mask = ?
      OR (a.account_number IS NOT NULL AND a.account_number LIKE ?)
    )`;
    params.push(mask, `%${mask}`);
  } else if (institutionName) {
    query += ` AND (
      a.institution IS NULL
      OR LOWER(a.institution) LIKE LOWER(?)
    )`;
    params.push(`%${institutionName}%`);
  }

  const rows = await db.all(query, params);
  const scored = rows
    .map((row) => {
      const match = scoreAccountMatch(row, plaidContext);
      return {
        id: row.id,
        name: row.name,
        balance: row.balance,
        institution: row.institution,
        type: row.type,
        external_mask: row.external_mask,
        confidence: match.confidence,
        tier: match.tier,
        recommendedAction: match.recommendedAction,
        breakdown: match.breakdown,
      };
    })
    .filter((c) => c.confidence >= THRESHOLD_CONFIRM)
    .sort((a, b) => b.confidence - a.confidence);

  return scored;
}

function buildPlaidContext(plaidAccount, institutionName, balance) {
  return {
    mask: plaidAccount.mask || null,
    institutionName: institutionName || null,
    internalType: mapPlaidTypeToInternal(plaidAccount),
    displayName: plaidAccount.name || plaidAccount.official_name || '',
    balance,
  };
}

module.exports = {
  WEIGHTS,
  THRESHOLD_AUTO,
  THRESHOLD_CONFIRM,
  scoreAccountMatch,
  findScoredManualCandidates,
  buildPlaidContext,
  extractLast4,
};
