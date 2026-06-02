/**
 * Merchant / payee normalization (FR-2).
 */

function titleCaseWord(word) {
  if (!word) return '';
  if (word.length <= 3 && /^[a-z]+$/.test(word)) {
    return word.toUpperCase();
  }
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}

/**
 * Normalize raw merchant text for matching (dedup key).
 */
function normalizeMerchantKey(text) {
  const stripped = stripMerchantNoise(text);
  return String(stripped ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Strip store numbers, location suffixes, hash fragments (FR-2).
 */
function stripMerchantNoise(text) {
  let s = String(text ?? '').trim();
  if (!s) return '';

  s = s.replace(/\s*#\s*\d+/gi, '');
  s = s.replace(/\s+store\s+#?\s*\d+/gi, '');
  s = s.replace(/\s+loc(?:ation)?\s+#?\s*\d+/gi, '');
  s = s.replace(/\s+\d{3,}\s*$/g, '');
  s = s.replace(/\s{2,}/g, ' ').trim();

  return s;
}

/**
 * Human-readable display name from raw import text.
 */
function normalizePayeeDisplayName(raw) {
  const stripped = stripMerchantNoise(raw);
  if (!stripped) return 'Unknown';

  const words = stripped
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => titleCaseWord(w.replace(/[^a-zA-Z0-9&'-]/g, '')))
    .filter(Boolean);

  return words.join(' ') || 'Unknown';
}

module.exports = {
  normalizeMerchantKey,
  normalizePayeeDisplayName,
  stripMerchantNoise,
};
