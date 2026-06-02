/**
 * Payee → category learning mode (FR-4).
 * - suggest (default): pre-select category; user confirms or overrides
 * - assign: auto-apply after confirmation threshold
 */

const PAYEE_CATEGORY_MODES = Object.freeze({
  SUGGEST: 'suggest',
  ASSIGN: 'assign',
});

const DEFAULT_PAYEE_CATEGORY_MODE = PAYEE_CATEGORY_MODES.SUGGEST;
const SETTINGS_KEY = 'payee_category_mode';

async function getPayeeCategoryMode(db, userId) {
  if (!db || userId == null) return DEFAULT_PAYEE_CATEGORY_MODE;
  try {
    const row = await db.get(
      `SELECT value FROM user_settings WHERE user_id = ? AND key = ?`,
      [userId, SETTINGS_KEY]
    );
    if (row?.value === PAYEE_CATEGORY_MODES.ASSIGN) {
      return PAYEE_CATEGORY_MODES.ASSIGN;
    }
  } catch {
    /* user_settings may not exist on old DBs */
  }
  return DEFAULT_PAYEE_CATEGORY_MODE;
}

async function setPayeeCategoryMode(db, userId, mode) {
  const value =
    mode === PAYEE_CATEGORY_MODES.ASSIGN
      ? PAYEE_CATEGORY_MODES.ASSIGN
      : PAYEE_CATEGORY_MODES.SUGGEST;
  await db.run(
    `INSERT INTO user_settings (user_id, key, value, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, key) DO UPDATE SET
       value = excluded.value,
       updated_at = datetime('now')`,
    [userId, SETTINGS_KEY, value]
  );
  return value;
}

module.exports = {
  PAYEE_CATEGORY_MODES,
  DEFAULT_PAYEE_CATEGORY_MODE,
  SETTINGS_KEY,
  getPayeeCategoryMode,
  setPayeeCategoryMode,
};
