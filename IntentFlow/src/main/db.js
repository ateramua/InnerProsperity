/**
 * @deprecated Use intentflow-sqlite-owner via database.cjs — kept for backward compatibility.
 */
const { sqliteOwner } = require('../db/database.cjs');

module.exports = {
  getDatabase: () => sqliteOwner.getConnection(),
  closeDatabase: () => sqliteOwner.close(),
};
