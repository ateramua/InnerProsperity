/**
 * Migration 037 — Enforce exclusive inflow/outflow register columns.
 * Direction-based rows must store positive magnitude only.
 */

module.exports = async function migration037(db) {
  console.log('   Exclusive ledger column repair…');

  await db.exec(`
    UPDATE transactions
    SET amount = ABS(amount)
    WHERE direction IN ('inflow', 'outflow')
      AND amount < 0
      AND (is_deleted IS NULL OR is_deleted = 0);
  `);

  console.log('   Exclusive ledger column repair complete.');
};
