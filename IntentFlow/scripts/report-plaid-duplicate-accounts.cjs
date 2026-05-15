#!/usr/bin/env node
/**
 * Report potential duplicate accounts (same user, similar mask/institution/type).
 * Usage: node scripts/report-plaid-duplicate-accounts.cjs [--user-id=1]
 */
const path = require('path');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

async function main() {
  const userArg = process.argv.find((a) => a.startsWith('--user-id='));
  const filterUserId = userArg ? userArg.split('=')[1] : null;

  const dbPath = path.join(__dirname, '../src/db/data/app.db');
  const db = await open({ filename: dbPath, driver: sqlite3.Database });

  const users = filterUserId
    ? [{ id: filterUserId }]
    : await db.all(`SELECT DISTINCT user_id AS id FROM accounts`);

  let pairCount = 0;

  for (const { id: userId } of users) {
    const accounts = await db.all(
      `SELECT a.id, a.name, a.type, a.institution, a.external_mask, a.source,
              (SELECT 1 FROM plaid_accounts pa WHERE pa.account_id = a.id LIMIT 1) AS has_plaid
       FROM accounts a
       WHERE a.user_id = ? AND IFNULL(a.is_active, 1) = 1
       ORDER BY a.institution, a.type, a.external_mask`,
      [userId]
    );

    for (let i = 0; i < accounts.length; i++) {
      for (let j = i + 1; j < accounts.length; j++) {
        const a = accounts[i];
        const b = accounts[j];
        if (a.type !== b.type) continue;
        const maskA = a.external_mask || '';
        const maskB = b.external_mask || '';
        const instA = (a.institution || '').toLowerCase();
        const instB = (b.institution || '').toLowerCase();
        const sameMask = maskA && maskB && maskA === maskB;
        const sameInst = instA && instB && instA === instB;
        const nameSimilar =
          a.name &&
          b.name &&
          (a.name.toLowerCase().includes(instA) || b.name.toLowerCase().includes(instB));

        if (sameMask || (sameInst && nameSimilar)) {
          pairCount++;
          console.log(`\nUser ${userId} — possible duplicate #${pairCount}:`);
          console.log(
            `  A: ${a.name} (${a.type}) mask=${maskA || '—'} source=${a.source} plaid=${a.has_plaid ? 'yes' : 'no'} id=${a.id}`
          );
          console.log(
            `  B: ${b.name} (${b.type}) mask=${maskB || '—'} source=${b.source} plaid=${b.has_plaid ? 'yes' : 'no'} id=${b.id}`
          );
          console.log('  → Merge via Linked Banks or deactivate one account.');
        }
      }
    }
  }

  if (pairCount === 0) {
    console.log('No likely duplicate pairs found.');
  } else {
    console.log(`\nTotal pairs reported: ${pairCount}`);
  }

  await db.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
