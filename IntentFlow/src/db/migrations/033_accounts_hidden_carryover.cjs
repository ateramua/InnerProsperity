'use strict';

/**
 * accounts.is_hidden — hide from lists while still counting toward budget cash totals.
 * categories.carryover_mode — 'carry' (default) | 'reset' on month rollover.
 */
module.exports = async function migrate033(db) {
  const hasCol = async (table, col) => {
    const rows = await db.all(`PRAGMA table_info(${table})`);
    return rows.some((r) => r.name === col);
  };

  if (!(await hasCol('accounts', 'is_hidden'))) {
    await db.exec('ALTER TABLE accounts ADD COLUMN is_hidden INTEGER DEFAULT 0');
  }

  if (!(await hasCol('categories', 'carryover_mode'))) {
    await db.exec("ALTER TABLE categories ADD COLUMN carryover_mode TEXT DEFAULT 'carry'");
  }
};
