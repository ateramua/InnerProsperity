#!/usr/bin/env node
/**
 * Sidebar nav policy tests — credit cards must not appear as sidebar account rows.
 * Run: npm run test:sidebar
 */
const assert = require('assert');
const {
  shouldShowAccountInSidebar,
  filterAccountsForSidebarEntries,
  isCreditAccountType,
} = require('../src/utils/sidebarAccountUtils.cjs');

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}: ${e.message}`);
    process.exitCode = 1;
  }
}

console.log('Sidebar account policy tests\n');

test('manual credit card excluded from sidebar', () => {
  assert.strictEqual(
    shouldShowAccountInSidebar({ id: '1', type: 'credit', name: 'Chase' }),
    false
  );
});

test('Plaid credit card excluded from sidebar', () => {
  assert.strictEqual(
    shouldShowAccountInSidebar({
      id: '2',
      type: 'credit',
      source: 'plaid',
      plaid_account_type: 'credit',
      plaid_account_subtype: 'credit card',
      name: 'Amex',
    }),
    false
  );
});

test('Plaid mis-typed as other but credit subtype still excluded', () => {
  assert.strictEqual(
    shouldShowAccountInSidebar({
      id: '3',
      type: 'other',
      plaid_account_subtype: 'credit card',
    }),
    false
  );
});

test('checking account excluded from sidebar rows (cash uses dedicated views)', () => {
  assert.strictEqual(
    shouldShowAccountInSidebar({ id: '4', type: 'checking', source: 'plaid' }),
    false
  );
});

test('filterAccountsForSidebarEntries removes all credit cards from nav list', () => {
  const list = [
    { id: 'a', type: 'checking' },
    { id: 'b', type: 'credit', source: 'plaid' },
    { id: 'c', type: 'credit' },
  ];
  assert.deepStrictEqual(filterAccountsForSidebarEntries(list), []);
});

test('isCreditAccountType matches CreditCardManager expectations', () => {
  assert.strictEqual(isCreditAccountType({ type: 'credit' }), true);
  assert.strictEqual(isCreditAccountType({ type: 'checking' }), false);
});

console.log(process.exitCode === 1 ? '\nFailed' : '\nAll passed');
