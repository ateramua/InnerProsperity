/**
 * Migration 036 — Credit card ledger direction alignment
 * Opening debt: inflow (positive magnitude). Spending: outflow. Payments: inflow.
 */

module.exports = async function migration036(db) {
  console.log('   Credit card ledger direction backfill…');

  // Credit card opening balance rows: show in Inflow column, negative balance impact.
  await db.exec(`
    UPDATE transactions
    SET amount = ABS(amount),
        direction = 'inflow'
    WHERE IFNULL(is_system, 0) = 1
      AND (LOWER(payee) = 'starting balance' OR LOWER(description) = 'starting balance')
      AND account_id IN (
        SELECT id FROM accounts
        WHERE lower(type) IN ('credit', 'credit_card', 'charge card', 'loan')
      )
      AND (direction IS NULL OR direction != 'inflow' OR amount < 0);
  `);

  // Credit card spending (non-transfer outflows): positive magnitude + outflow direction.
  await db.exec(`
    UPDATE transactions
    SET amount = ABS(amount),
        direction = 'outflow'
    WHERE account_id IN (
        SELECT id FROM accounts
        WHERE lower(type) IN ('credit', 'credit_card', 'charge card')
      )
      AND IFNULL(is_transfer, 0) = 0
      AND IFNULL(is_system, 0) = 0
      AND amount < 0
      AND (direction IS NULL OR direction = 'inflow');
  `);

  // Credit card payments (transfers in): positive magnitude + inflow direction.
  await db.exec(`
    UPDATE transactions
    SET amount = ABS(amount),
        direction = 'inflow'
    WHERE account_id IN (
        SELECT id FROM accounts
        WHERE lower(type) IN ('credit', 'credit_card', 'charge card')
      )
      AND IFNULL(is_transfer, 0) = 1
      AND amount > 0
      AND (direction IS NULL OR direction = 'outflow');
  `);

  console.log('   Credit card ledger direction backfill complete.');
};
