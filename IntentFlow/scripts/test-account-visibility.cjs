#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  isAccountListedInUi,
  isAccountArchived,
  filterListedAccounts,
} = require('../src/shared/accountVisibilityUtils.cjs');

const active = { id: '1', is_active: 1, account_status: 'active' };
const inactive = { id: '2', is_active: 0, account_status: 'active' };
const archived = { id: '3', is_active: 0, account_status: 'archived' };

assert.strictEqual(isAccountListedInUi(active), true);
assert.strictEqual(isAccountListedInUi(inactive), true, 'inactive but not archived is listed');
assert.strictEqual(isAccountListedInUi(archived), false);
assert.strictEqual(isAccountArchived(archived), true);
assert.deepStrictEqual(filterListedAccounts([active, inactive, archived]).map((a) => a.id), ['1', '2']);

console.log('account visibility utils: all assertions passed');
