/**
 * Migration 042 — Assignment audit provenance columns (write-model metadata).
 */

module.exports = async function migration042(db) {
  console.log('   Assignment audit provenance columns…');

  const columns = [
    ['operation_type', 'TEXT'],
    ['created_by_user_id', 'TEXT'],
    ['created_by_operation', 'TEXT'],
    ['created_by_migration', 'TEXT'],
    ['created_by_system', 'INTEGER NOT NULL DEFAULT 0'],
  ];

  const cols = await db.all('PRAGMA table_info(budget_assignment_audit)');
  const existing = new Set(cols.map((c) => c.name));

  for (const [name, def] of columns) {
    if (!existing.has(name)) {
      await db.exec(`ALTER TABLE budget_assignment_audit ADD COLUMN ${name} ${def}`);
    }
  }

  console.log('   Assignment audit provenance columns complete.');
};
