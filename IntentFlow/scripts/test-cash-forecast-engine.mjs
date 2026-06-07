#!/usr/bin/env node
'use strict';

import {
  runCashForecast,
  resolveHorizonDays,
  buildWaterfallForPeriod,
  computeForecastAccuracy,
  detectRecurringTransactions,
  mapDbScheduledEvents,
} from '../src/shared/cashForecastEngine.mjs';

const input = {
  accounts: [{ id: '1', name: 'Checking', type: 'checking', balance: 10000, on_budget: 1 }],
  transactions: [
    { date: '2026-01-15', amount: 5000, payee: 'Employer Inc', category_id: 'c1' },
    { date: '2026-02-15', amount: 5000, payee: 'Employer Inc', category_id: 'c1' },
    { date: '2026-03-15', amount: 5000, payee: 'Employer Inc', category_id: 'c1' },
    { date: '2026-01-01', amount: -1500, payee: 'Rent', category_id: 'c2', direction: 'outflow' },
    { date: '2026-02-01', amount: -1500, payee: 'Rent', category_id: 'c2', direction: 'outflow' },
  ],
  categories: [
    { id: 'c1', name: 'Income', assigned: 0, available: 0, activity: 0 },
    { id: 'c2', name: 'Rent', assigned: 1500, available: 500, activity: 1000, target_amount: 0 },
  ],
  horizonDays: 90,
};

const result = runCashForecast(input);
if (result.monthly.length < 2) throw new Error('expected multiple monthly rows');
if (result.forecast.startingCash !== 10000) throw new Error('starting cash mismatch');
if (!result.waterfallPeriods?.quarterly?.length) throw new Error('quarterly waterfall missing');

const customDays = resolveHorizonDays('custom', { start: '2026-06-01', end: '2026-09-01' });
if (customDays < 90 || customDays > 95) throw new Error(`custom horizon unexpected: ${customDays}`);

const recurring = detectRecurringTransactions(input.transactions);
if (recurring.length < 1) throw new Error('expected recurring detection');

const accuracy = computeForecastAccuracy(
  [{ recordedAt: '2026-05-01', targetDate: '2026-05-08', projectedBalance: 9500, actualBalance: 9400 }],
  9400,
);
if (accuracy.overall == null || accuracy.overall < 80) throw new Error('accuracy calc failed');

const dbEvents = mapDbScheduledEvents(
  [{ id: 's1', date: '2026-06-15', payee: 'Rent', amount: 1500, transaction_type: 'outflow', status: 'pending' }],
  90,
);
if (dbEvents.length !== 1) throw new Error('db scheduled events failed');

console.log('✅ test-cash-forecast-engine passed');
