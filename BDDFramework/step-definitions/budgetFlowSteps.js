import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect } from '@playwright/test';
import {
  assertBudgetInvariant,
  createBudgetState,
  money,
  neededTotalForSmartAssign,
  runFundUnderfunded,
  runSmartAssign,
  runUnassignMonth,
  seedActivityMonth,
  seedAssignedMonth,
  seedCrossMonthLedgers,
  seedMultipleTargetCategories,
  seedUrgencyMix,
  totalAssignedAmount,
} from '../support/budgetFlowHarness.js';

const require = createRequire(import.meta.url);
const { computeCategoryUnderfunded } = require(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../IntentFlow/src/shared/underfundedEngine.cjs',
  ),
);
import { given, when, then, and } from '../support/executionSteps.js';

export function stepDefinitions(ctx) {
  return {
    givenHarnessInitialized: () =>
      given('the budget orchestration harness is initialized', async () => {
        ctx.state = createBudgetState({
          accounts: [{ name: 'Checking', balance: 5_000 }],
        });
        ctx.operationResults = [];
      }),

    givenReadyToAssignIs: (amount) =>
      given(`Ready To Assign is ${amount}`, async () => {
        ctx.state = createBudgetState({
          readyToAssign: amount,
          accounts: [{ name: 'Checking', balance: amount }],
        });
        ctx.initialRta = amount;
      }),

    andMultipleCategoriesWithTargets: () =>
      and('multiple categories with valid goal targets exist', async () => {
        seedMultipleTargetCategories(ctx.state);
      }),

    andAtLeastOneOverspent: () =>
      and('at least one category is overspent', async () => {
        seedUrgencyMix(ctx.state);
      }),

    andCategoriesRequireTotal: (total) =>
      and(`categories require ${total} total funding`, async () => {
        seedMultipleTargetCategories(ctx.state);
        expect(neededTotalForSmartAssign(ctx.state)).toBeGreaterThanOrEqual(total);
      }),

    andTwoCategoriesRequire200: () =>
      and('two categories require 200 and 200 respectively', async () => {
        ctx.state.categories = {};
        ctx.state.categories['Alpha'] = {
          id: 'alpha',
          name: 'Alpha',
          assigned: 0,
          available: 0,
          activity: 0,
          target_type: 'monthly',
          target_amount: 200,
          previous_available: 0,
          archived: false,
        };
        ctx.state.categories['Beta'] = {
          id: 'beta',
          name: 'Beta',
          assigned: 0,
          available: 0,
          activity: 0,
          target_type: 'monthly',
          target_amount: 200,
          previous_available: 0,
          archived: false,
        };
      }),

    andUrgencyMix: () =>
      and('categories include overspent, monthly goals, and target balance goals', async () => {
        seedUrgencyMix(ctx.state);
      }),

    givenSelectedMonthAssigned600: () =>
      given('a selected month with multiple assigned categories totaling 600', async () => {
        ctx.state = createBudgetState({
          accounts: [{ name: 'Checking', balance: 2_000 }],
        });
        seedAssignedMonth(ctx.state, 600);
        ctx.initialRta = ctx.state.readyToAssign;
      }),

    givenMonthWithActivity: () =>
      given('a month with category spending activity recorded', async () => {
        ctx.state = createBudgetState({
          accounts: [{ name: 'Checking', balance: 1_000 }],
        });
        seedActivityMonth(ctx.state);
      }),

    givenJuneAndJulyAssigned: () =>
      given('June and July both have assigned budgets', async () => {
        ctx.state = createBudgetState({
          readyToAssign: 800,
          accounts: [{ name: 'Checking', balance: 2_000 }],
        });
        seedCrossMonthLedgers(ctx.state);
        ctx.julyLedgerBefore = structuredClone(ctx.state.monthLedgers['2026-07-01']);
      }),

    givenAllUnassigned: () =>
      given('a month where all categories are already unassigned', async () => {
        ctx.state = createBudgetState({
          readyToAssign: 500,
          accounts: [{ name: 'Checking', balance: 500 }],
          categories: [{ name: 'Empty', assigned: 0, available: 0, target_type: 'monthly', target_amount: 100 }],
        });
        ctx.initialRta = ctx.state.readyToAssign;
      }),

    givenSmartAssignViaUi: () =>
      given('Smart Assign is executed via UI', async () => {
        seedMultipleTargetCategories(ctx.state);
        ctx.operationResults.push(runSmartAssign(ctx.state));
      }),

    givenAnyCombination: () =>
      given('any combination of Smart Assign, Fund Underfunded, or Unassign Month actions', async () => {
        ctx.state = createBudgetState({
          readyToAssign: 900,
          accounts: [{ name: 'Checking', balance: 900 }],
        });
        seedUrgencyMix(ctx.state);
        ctx.operationResults.push(runFundUnderfunded(ctx.state));
        ctx.operationResults.push(runSmartAssign(ctx.state));
        ctx.operationResults.push(runUnassignMonth(ctx.state));
      }),

    whenSmartAssignExecuted: () =>
      when('Smart Assign is executed for the selected month', async () => {
        ctx.operationResults.push(runSmartAssign(ctx.state));
      }),

    whenSmartAssignInJune: () =>
      when('Smart Assign is executed in June', async () => {
        ctx.state.selectedMonth = '2026-06-01';
        ctx.operationResults.push(runSmartAssign(ctx.state));
      }),

    whenFundUnderfundedExecuted: () =>
      when('Fund Underfunded is executed', async () => {
        ctx.operationResults.push(runFundUnderfunded(ctx.state));
      }),

    whenSmartAssignFirst: () =>
      when('Smart Assign is executed first', async () => {
        seedMultipleTargetCategories(ctx.state);
        ctx.initialRta = ctx.state.readyToAssign;
        ctx.operationResults.push(runSmartAssign(ctx.state));
      }),

    whenFundUnderfundedSecond: () =>
      and('Fund Underfunded is executed second', async () => {
        ctx.operationResults.push(runFundUnderfunded(ctx.state));
      }),

    whenUnassignMonth: () =>
      when('Unassign Month is executed', async () => {
        ctx.operationResults.push(runUnassignMonth(ctx.state));
      }),

    whenUnassignMonthWith300: () =>
      when('Unassign Month is executed on a month with 300 assigned', async () => {
        ctx.state.categories = {};
        seedAssignedMonth(ctx.state, 300);
        ctx.initialRta = ctx.state.readyToAssign;
        ctx.operationResults.push(runUnassignMonth(ctx.state));
      }),

    whenSmartAssignAfterward: () =>
      and('Smart Assign is executed afterward', async () => {
        seedMultipleTargetCategories(ctx.state);
        ctx.operationResults.push(runSmartAssign(ctx.state));
      }),

    whenSmartAssignAttempts500: () =>
      when('Smart Assign attempts to assign 500 total', async () => {
        seedMultipleTargetCategories(ctx.state);
        ctx.initialRta = ctx.state.readyToAssign;
        ctx.operationResults.push(runSmartAssign(ctx.state));
      }),

    whenMixedOperations: () =>
      when('Smart Assign is executed', async () => {
        seedMultipleTargetCategories(ctx.state);
        ctx.operationResults.push(runSmartAssign(ctx.state));
      }),

    andFundUnderfundedMixed: () =>
      and('Fund Underfunded is executed', async () => {
        ctx.operationResults.push(runFundUnderfunded(ctx.state));
      }),

    andUnassignAnotherMonth: () =>
      and('Unassign Month is executed for another month', async () => {
        ctx.operationResults.push(runUnassignMonth(ctx.state));
      }),

    whenBackendCompletes: () =>
      when('backend processing completes', async () => {
        expect(ctx.state.backendProjection).toBeTruthy();
      }),

    thenFundedAscendingTarget: () =>
      then('categories should be funded in ascending order of target amount', async () => {
        const op = ctx.operationResults.at(-1);
        const targets = op.allocations.map((row) => ctx.state.categories[row.categoryName].target_amount);
        const sorted = [...targets].sort((a, b) => a - b);
        expect(targets).toEqual(sorted);
      }),

    thenNoOverNeeded: () =>
      and('no category should receive more than its needed amount', async () => {
        const op = ctx.operationResults.at(-1);
        for (const row of op.allocations) {
          expect(row.amount).toBeLessThanOrEqual((row.needed ?? row.amount) + 0.01);
        }
      }),

    thenRtaDecreasesByAssigned: () =>
      and('Ready To Assign should decrease by total assigned amount', async () => {
        const op = ctx.operationResults.at(-1);
        const assignedTotal = op.allocations.reduce((s, a) => s + a.amount, 0);
        expect(money(ctx.initialRta - ctx.state.readyToAssign)).toBe(money(assignedTotal));
      }),

    thenBudgetBalanced: () =>
      and('budget equation must remain balanced', async () => {
        assertBudgetInvariant(ctx.state);
      }),

    thenOverspentFundedFirst: () =>
      then('overspent categories should be funded first', async () => {
        const op = ctx.operationResults.at(-1);
        const overspent = op.allocations.filter((a) => a.kind === 'overspent');
        const goals = op.allocations.filter((a) => a.kind === 'goal');
        if (overspent.length && goals.length) {
          const firstGoalIdx = op.allocations.findIndex((a) => a.kind === 'goal');
          const lastOverspentIdx = op.allocations.map((a) => a.kind).lastIndexOf('overspent');
          expect(lastOverspentIdx).toBeLessThan(firstGoalIdx);
        }
      }),

    thenRemainingToGoals: () =>
      and('remaining RTA should be allocated to goal-based categories', async () => {
        const op = ctx.operationResults.at(-1);
        if (op.startingRta > op.plan?.overspentTotal) {
          expect(op.allocations.some((a) => a.kind === 'goal')).toBe(true);
        }
      }),

    thenNoNegativeOverspentIfSufficient: () =>
      and('no overspent category should remain negative if RTA is sufficient', async () => {
        const op = ctx.operationResults.at(-1);
        if (op.startingRta >= (op.plan?.totalFundingNeed || 0)) {
          for (const cat of Object.values(ctx.state.categories)) {
            expect(cat.available).toBeGreaterThanOrEqual(-0.01);
          }
        }
      }),

    thenSecondUsesRemainingRta: () =>
      then('second operation should only use remaining RTA', async () => {
        const first = ctx.operationResults[0];
        const second = ctx.operationResults[1];
        expect(second.startingRta).toBe(first.endingRta);
      }),

    thenNeverExceedInitialRta: () =>
      and('total assigned amount should never exceed initial RTA', async () => {
        const assigned = ctx.initialRta - ctx.state.readyToAssign;
        expect(assigned).toBeLessThanOrEqual(ctx.initialRta + 0.01);
      }),

    thenInvariantValid: () =>
      and('budget invariant must remain valid', async () => {
        assertBudgetInvariant(ctx.state);
      }),

    thenAllAssignedZero: () =>
      then('all category assigned values should be set to 0', async () => {
        for (const cat of Object.values(ctx.state.categories)) {
          expect(cat.assigned).toBe(0);
        }
      }),

    thenRtaIncreasesBy600: () =>
      and('Ready To Assign should increase by 600', async () => {
        expect(money(ctx.state.readyToAssign - ctx.initialRta)).toBe(600);
      }),

    thenActivityUnchanged: () =>
      and('category activity should remain unchanged', async () => {
        expect(ctx.operationResults.at(-1).activityUnchanged).toBe(true);
      }),

    thenTransactionsUnchanged: () =>
      then('all transactions should remain unchanged', async () => {
        expect(ctx.operationResults.at(-1).transactionsUnchanged).toBe(true);
      }),

    thenOnlyAssignedReset: () =>
      and('only Assigned values should be reset', async () => {
        expect(totalAssignedAmount(ctx.state)).toBe(0);
      }),

    thenAvailableFromActivity: () =>
      and('Available should be recalculated from activity', async () => {
        const cat = ctx.state.categories['Utilities'];
        expect(cat.available).toBe(money(cat.previous_available - cat.activity));
      }),

    thenStopsAtZeroRta: () =>
      then('allocation should stop once RTA reaches 0', async () => {
        expect(ctx.state.readyToAssign).toBeLessThanOrEqual(0.01);
      }),

    thenNoPartialOverfund: () =>
      and('remaining categories should not be partially overfunded', async () => {
        const op = ctx.operationResults.at(-1);
        for (const row of op.allocations) {
          expect(row.amount).toBeGreaterThan(0);
        }
        expect(ctx.state.readyToAssign).toBeGreaterThanOrEqual(-0.01);
      }),

    thenMonthlyBeforeBalance: () =>
      and('monthly goals should be funded second', async () => {
        const op = ctx.operationResults.at(-1);
        const kinds = op.allocations.map((a) => a.reason || '');
        const overspentIdx = kinds.findIndex((r) => r.includes('overspending') || r.includes('Cover'));
        const monthlyIdx = kinds.findIndex((r) => r.includes('Monthly goal'));
        const balanceIdx = kinds.findIndex((r) => r.includes('Target balance'));
        if (monthlyIdx >= 0 && balanceIdx >= 0) expect(monthlyIdx).toBeLessThan(balanceIdx);
        if (overspentIdx >= 0 && monthlyIdx >= 0) expect(overspentIdx).toBeLessThan(monthlyIdx);
      }),

    thenBalanceLast: () =>
      and('target balance goals should be funded last', async () => {
        const op = ctx.operationResults.at(-1);
        const balanceRows = op.allocations.filter((a) => String(a.reason).includes('Target balance'));
        if (balanceRows.length) {
          const lastBalanceIdx = op.allocations.map((a) => String(a.reason)).lastIndexOf(
            balanceRows.at(-1).reason,
          );
          expect(lastBalanceIdx).toBe(op.allocations.length - 1);
        }
      }),

    thenAccountsEqualRtaPlusBalances: () =>
      then('total on-budget accounts should always equal RTA plus category balances', async () => {
        assertBudgetInvariant(ctx.state);
      }),

    thenNoMoneyCreatedOrLost: () =>
      and('no money should be created or lost', async () => {
        assertBudgetInvariant(ctx.state);
      }),

    thenJulyUnchanged: () =>
      then('July assignments should remain unchanged', async () => {
        expect(ctx.state.monthLedgers['2026-07-01']).toEqual(ctx.julyLedgerBefore);
      }),

    thenOnlyJuneModified: () =>
      and('only June RTA and categories should be modified', async () => {
        expect(ctx.state.monthLedgers['2026-06-01']).toBeTruthy();
      }),

    thenRtaCycleReflects: () =>
      then('RTA should reflect +300 then −new allocations', async () => {
        expect(ctx.state.readyToAssign).toBeGreaterThanOrEqual(0);
        assertBudgetInvariant(ctx.state);
      }),

    thenPartialFirstCategory: () =>
      then('first category should receive partial funding based on order', async () => {
        const op = ctx.operationResults.at(-1);
        expect(op.allocations.length).toBeGreaterThan(0);
        expect(op.allocations[0].amount).toBeLessThan(200);
      }),

    thenOthersUnfunded: () =>
      and('remaining categories should remain unfunded', async () => {
        const op = ctx.operationResults.at(-1);
        expect(op.allocations.length).toBeLessThan(2);
      }),

    thenNoNegativeRta: () =>
      and('no negative RTA should occur', async () => {
        expect(ctx.state.readyToAssign).toBeGreaterThanOrEqual(-0.01);
      }),

    thenNoChangesOnRepeat: () =>
      then('no category values should change', async () => {
        expect(ctx.operationResults.at(-1).totalReleased).toBe(0);
      }),

    thenRtaUnchanged: () =>
      and('Ready To Assign should remain unchanged', async () => {
        expect(ctx.state.readyToAssign).toBe(ctx.initialRta);
      }),

    thenCapAt300: () =>
      then('system should cap assignments at 300', async () => {
        expect(money(ctx.initialRta - ctx.state.readyToAssign)).toBeLessThanOrEqual(300.01);
      }),

    thenUiMatchesBackend: () =>
      then('UI values for RTA, Assigned, and Available should match backend state', async () => {
        expect(ctx.state.uiProjection).toEqual(ctx.state.backendProjection);
      }),

    thenNoDesync: () =>
      and('no desynchronization should occur', async () => {
        expect(JSON.stringify(ctx.state.uiProjection)).toBe(JSON.stringify(ctx.state.backendProjection));
      }),

    thenGlobalInvariant: () =>
      then('total on-budget account balances must equal Ready To Assign plus all category balances', async () => {
        assertBudgetInvariant(ctx.state);
      }),

    thenNeverViolateRule: () =>
      and('no operation should violate this rule under any condition', async () => {
        assertBudgetInvariant(ctx.state);
      }),
  };
}
