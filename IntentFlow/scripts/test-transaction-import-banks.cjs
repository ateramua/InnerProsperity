/**
 * Regression tests for supported bank CSV import profiles.
 * Run: node scripts/test-transaction-import-banks.cjs
 */
const assert = require('assert');
const svc = require('../src/services/transactions/transactionImportService.cjs');
const { SUPPORTED_BANKS } = require('../src/services/transactions/bankImportProfiles.cjs');

const account = { id: 'acct-1', type: 'checking' };
const categories = [{ id: 'cat-1', name: 'Groceries' }];

const FIXTURES = [
  {
    bank: 'wells_fargo',
    fileName: 'wells-checking.csv',
    csv: `Date,Amount,Description
01/15/2026,-45.67,STARBUCKS
01/16/2026,1200.00,PAYROLL DEPOSIT`,
    expect: { count: 2, net: -45.67 + 1200 },
  },
  {
    bank: 'pnc',
    fileName: 'pnc-export.csv',
    csv: `Transaction Date,Transaction Description,Amount,Balance
01/10/2026,GROCERY STORE,-32.10,500.00
01/11/2026,DIRECT DEPOSIT,800.00,1300.00`,
    expect: { count: 2, net: -32.1 + 800 },
  },
  {
    bank: 'capital_one',
    fileName: 'capital-one.csv',
    csv: `Transaction Date,Posted Date,Description,Debit,Credit,Balance
01/05/2026,01/06/2026,AMAZON,25.00,,100.00
01/07/2026,01/08/2026,PAYMENT,,100.00,200.00`,
    expect: { count: 2, net: -25 + 100 },
  },
  {
    bank: 'navy_federal',
    fileName: 'NavyCheck.csv',
    csv: `Date,Description,Amount,Credit Debit Indicator
01/01/2026,POS PURCHASE,12.34,Debit
01/02/2026,DEPOSIT,500.00,Credit`,
    expect: { count: 2, net: -12.34 + 500 },
  },
  {
    bank: 'american_express',
    fileName: 'amex-activity.csv',
    csv: `Date,Description,Amount,Category
01/03/2026,RESTAURANT,-55.00,Restaurant
01/04/2026,PAYMENT,55.00,Payment`,
    expect: { count: 2, net: 0 },
  },
  {
    bank: 'bank_of_america',
    fileName: 'bofa-checking.csv',
    csv: `Posted Date,Reference Number,Payee,Address,Amount
01/08/2026,123,GROCERY,, -40.00
01/09/2026,456,PAYROLL,, 900.00`,
    expect: { count: 2, net: 860 },
  },
];

let passed = 0;
let failed = 0;

for (const fx of FIXTURES) {
  try {
    const preview = svc.previewImport(fx.csv, account, categories, null, null, fx.fileName);
    assert.strictEqual(
      preview.validCount,
      fx.expect.count,
      `${fx.bank}: expected ${fx.expect.count} rows, got ${preview.validCount}`
    );
    assert.ok(
      Math.abs(preview.balancePreview - fx.expect.net) < 0.01,
      `${fx.bank}: net ${preview.balancePreview} != ${fx.expect.net}`
    );
    assert.ok(
      preview.previewTransactions.length === fx.expect.count,
      `${fx.bank}: previewTransactions length`
    );
    assert.ok(
      preview.previewTransactions[0].amount !== undefined,
      `${fx.bank}: preview transaction shape`
    );
    if (fx.bank === 'navy_federal') {
      const debits = preview.normalized.filter((r) => r.amount < 0);
      const credits = preview.normalized.filter((r) => r.amount > 0);
      assert.strictEqual(debits.length, 1, 'navy debit count');
      assert.strictEqual(credits.length, 1, 'navy credit count');
    }
    if (fx.bank === 'capital_one') {
      assert.ok(preview.detectedProfile?.id === 'capital_one' || preview.suggestedMapping.outflow, 'capital one mapping');
    }
    console.log(`✅ ${fx.bank} (${preview.detectedProfile?.name || 'generic'})`);
    passed++;
  } catch (err) {
    console.error(`❌ ${fx.bank}:`, err.message);
    failed++;
  }
}

assert.strictEqual(SUPPORTED_BANKS.length, 6, 'six supported banks configured');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
