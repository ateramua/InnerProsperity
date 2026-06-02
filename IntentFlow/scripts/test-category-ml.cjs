#!/usr/bin/env node
const assert = require('assert');
const { buildFeatureTokens, train, predict } = require('../src/services/transactions/categoryMlModel.cjs');

const diningDocs = [
  buildFeatureTokens({ payee: 'STARBUCKS #1234', amount: -5.5, accountType: 'credit' }),
  buildFeatureTokens({ payee: 'Starbucks Store', amount: -4.2, accountType: 'checking' }),
  buildFeatureTokens({ payee: 'STARBUCKS 888', amount: -6.1, accountType: 'credit' }),
  buildFeatureTokens({ payee: 'Peet Coffee', amount: -7, accountType: 'checking' }),
  buildFeatureTokens({ payee: 'Local Cafe', amount: -12, accountType: 'credit' }),
  buildFeatureTokens({ payee: 'Dunkin', amount: -3.5, accountType: 'checking' }),
];

const groceryDocs = [
  buildFeatureTokens({ payee: 'Walmart Supercenter', amount: -85, accountType: 'checking' }),
  buildFeatureTokens({ payee: 'Kroger #445', amount: -62, accountType: 'credit' }),
  buildFeatureTokens({ payee: 'Whole Foods', amount: -44, accountType: 'credit' }),
  buildFeatureTokens({ payee: 'Trader Joes', amount: -38, accountType: 'checking' }),
  buildFeatureTokens({ payee: 'Safeway', amount: -55, accountType: 'checking' }),
  buildFeatureTokens({ payee: 'Costco Wholesale', amount: -120, accountType: 'credit' }),
];

const documents = [...diningDocs, ...groceryDocs];
const labels = [
  ...diningDocs.map(() => 'cat-dining'),
  ...groceryDocs.map(() => 'cat-grocery'),
];

const model = train(documents, labels);
assert(model, 'model should train');

const starbucks = predict(
  model,
  buildFeatureTokens({ payee: 'STARBUCKS NEW', amount: -5, accountType: 'credit' })
);
assert.strictEqual(starbucks.categoryId, 'cat-dining');
assert.ok(starbucks.confidence > 0.35);

const walmart = predict(
  model,
  buildFeatureTokens({ payee: 'Walmart', amount: -90, accountType: 'checking' })
);
assert.strictEqual(walmart.categoryId, 'cat-grocery');

console.log('✅ category ML model tests passed');
