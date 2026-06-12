#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { VALID_ACTIONS } = require('../src/services/accounts/accountDuplicateResolutionService.cjs');

assert.ok(VALID_ACTIONS.has('merge'));
assert.ok(VALID_ACTIONS.has('replace'));
assert.ok(VALID_ACTIONS.has('keep_both'));
assert.ok(VALID_ACTIONS.has('ignore'));
assert.ok(VALID_ACTIONS.has('ignore_temporarily'));
assert.ok(VALID_ACTIONS.has('keep_off_budget'));
assert.strictEqual(VALID_ACTIONS.size, 6);

console.log('✅ test-account-duplicate-resolution passed');
