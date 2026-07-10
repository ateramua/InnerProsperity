/**
 * Migration 043 — One-time assignment ledger reconstruction.
 * Creates synthetic audit events for monthly_budgets rows missing ledger coverage,
 * then syncs RTA from the ledger (fixes over-assigned identity drift).
 */

module.exports = async function migration043(db) {
  console.log('   Assignment ledger reconstruction (043)…');

  const assignmentLedgerService = require('../../services/budget/assignmentLedgerService.cjs');
  const users = await db.all('SELECT id FROM users');

  for (const user of users || []) {
    const userId = user.id;
    console.log(`     User ${userId}: reconstructing missing assignment ledger events…`);

    const result = await assignmentLedgerService.reconstructMissingLedgerEvents(db, userId, {
      migrationId: '043_assignment_ledger_reconstruction',
      source: assignmentLedgerService.LEGACY_BACKFILL_SOURCE,
      createdByOperation: 'migration043_assignment_ledger_reconstruction',
    });

    console.log(
      `       Applied ${result.applied.length}, skipped ${result.skipped.length}, ` +
        `RTA ${result.readyToAssign}, identity delta ${result.identityAfter?.budgetInvariantDelta}`
    );
  }

  console.log('   Assignment ledger reconstruction complete.');
};
