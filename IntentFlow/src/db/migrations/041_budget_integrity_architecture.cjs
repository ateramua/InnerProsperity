/**
 * Migration 041 — Budget integrity architecture fix:
 *  - Envelope carryover bridge repair
 *  - Complete imported cash onboarding for pending accounts
 *  - RTA ledger authority (derived pool)
 */

module.exports = async function migration041(db) {
  console.log('   Budget integrity architecture fix (041)…');

  const poolCols = await db.all('PRAGMA table_info(user_budget_pool)');
  if (!poolCols.some((c) => c.name === 'rta_ledger_authority')) {
    await db.exec(
      `ALTER TABLE user_budget_pool ADD COLUMN rta_ledger_authority INTEGER NOT NULL DEFAULT 0`
    );
  }

  const envelopeCarryoverBridge = require('../../services/budget/envelopeCarryoverBridge.cjs');
  const importedCashReconciliationService = require('../../services/budget/importedCashReconciliationService.cjs');
  const rtaLedgerService = require('../../services/budget/rtaLedgerService.cjs');
  const monthlyBudgetService = require('../../services/budget/monthlyBudgetService.cjs');

  const users = await db.all('SELECT id FROM users');
  for (const user of users || []) {
    const userId = user.id;
    console.log(`     User ${userId}: repairing carryover gaps…`);
    const bridgeResult = await envelopeCarryoverBridge.repairCarryoverGapsForUser(db, userId);
    if (bridgeResult.bridgeRowsCreated > 0) {
      console.log(`       Bridge rows created: ${bridgeResult.bridgeRowsCreated}`);
      const firstMonth = await db.get(
        `SELECT MIN(month) AS month FROM monthly_budgets mb
         INNER JOIN categories c ON CAST(c.id AS TEXT) = CAST(mb.category_id AS TEXT)
         WHERE c.user_id = ?`,
        [userId]
      );
      if (firstMonth?.month) {
        await monthlyBudgetService.refreshBudgetMonthsForward(db, userId, firstMonth.month, 48, {
          strictConservation: false,
        });
      }
    }

    console.log(`     User ${userId}: normalizing legacy starting balance RTA credits…`);
    await db.run(
      `UPDATE transactions
       SET affects_rta = 1,
           transaction_type = CASE
             WHEN transaction_type IS NULL OR transaction_type = '' THEN 'OPENING_BALANCE'
             ELSE transaction_type
           END,
           updated_at = datetime('now')
       WHERE user_id = ?
         AND IFNULL(is_deleted, 0) = 0
         AND (
           transaction_type = 'OPENING_BALANCE'
           OR (
             IFNULL(is_system, 0) = 1
             AND (
               LOWER(IFNULL(payee, '')) = 'starting balance'
               OR LOWER(IFNULL(description, '')) = 'starting balance'
             )
           )
         )
         AND account_id IN (
           SELECT id FROM accounts
           WHERE user_id = ?
             AND LOWER(IFNULL(type, '')) IN ('checking', 'savings')
             AND IFNULL(on_budget, 1) = 1
         )`,
      [userId, userId]
    );

    console.log(`     User ${userId}: completing imported cash onboarding…`);
    const onboarding = await importedCashReconciliationService.computeOnboardingGap(db, userId);
    for (const proposal of onboarding.proposals || []) {
      const result = await importedCashReconciliationService.createOpeningBalanceInflow(
        db,
        userId,
        proposal.accountId,
        proposal.proposedOpeningBalance,
        {
          memo: 'Migration 041 — imported cash onboarding',
          reconciliationGenerated: true,
        }
      );
      if (!result.skipped) {
        console.log(
          `       Opening balance $${result.amount} for account ${proposal.accountId}`
        );
      }
    }

    console.log(`     User ${userId}: enabling RTA ledger authority…`);
    await rtaLedgerService.syncPoolFromLedger(db, userId, { source: 'migration_041' });

    await db.run(
      `UPDATE accounts
       SET onboarding_complete = 1, updated_at = datetime('now')
       WHERE user_id = ?
         AND LOWER(IFNULL(type, '')) IN ('checking', 'savings')
         AND IFNULL(on_budget, 1) = 1
         AND id IN (
           SELECT account_id FROM transactions
           WHERE user_id = ?
             AND IFNULL(is_deleted, 0) = 0
             AND (
               transaction_type = 'OPENING_BALANCE'
               OR IFNULL(affects_rta, 0) = 1
             )
         )`,
      [userId, userId]
    );
  }

  console.log('   Budget integrity architecture fix (041) complete.');
};
