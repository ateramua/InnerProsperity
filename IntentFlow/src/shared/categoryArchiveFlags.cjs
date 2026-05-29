/**
 * Normalize SQLite/archived column values (0, 1, '0', '1', true, null, etc.).
 * @param {unknown} value
 * @returns {boolean}
 */
function isCategoryArchivedFlag(value) {
  if (value === null || value === undefined || value === false) return false;
  if (value === 0 || value === '0' || value === 'false' || value === '') return false;
  return value === 1 || value === true || value === '1' || value === 'true';
}

/** SQL fragment: row is active (not archived). */
function sqlCategoryNotArchived(alias = 'c') {
  const a = alias;
  return `(${a}.archived IS NULL OR ${a}.archived = 0 OR ${a}.archived = '0' OR ${a}.archived = 'false')`;
}

/** SQL fragment: row is archived. */
function sqlCategoryIsArchived(alias = 'c') {
  const a = alias;
  return `(${a}.archived = 1 OR ${a}.archived = '1' OR ${a}.archived = 'true')`;
}

module.exports = {
  isCategoryArchivedFlag,
  sqlCategoryNotArchived,
  sqlCategoryIsArchived,
};
