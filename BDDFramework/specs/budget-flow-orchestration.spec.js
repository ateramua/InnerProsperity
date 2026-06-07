/**
 * Implements scenarios from IntentFlow/tests/features/intentflow-ui-e2e.feature
 * Feature: Full Budget Flow Orchestration
 */
import { test } from '@playwright/test';
import { createBudgetFlowContext } from '../support/budgetFlowContext.js';
import { stepDefinitions } from '../step-definitions/budgetFlowSteps.js';
import { createBudgetState } from '../support/budgetFlowHarness.js';

test.describe('Full Budget Flow Orchestration', () => {
  test.beforeEach(async () => {
    // fresh context per scenario
  });

  test('Smart Assign allocates RTA across smallest target categories', async () => {
    const ctx = createBudgetFlowContext();
    const steps = stepDefinitions(ctx);
    await steps.givenReadyToAssignIs(500);
    await steps.andMultipleCategoriesWithTargets();
    await steps.whenSmartAssignExecuted();
    await steps.thenFundedAscendingTarget();
    await steps.thenNoOverNeeded();
    await steps.thenRtaDecreasesByAssigned();
    await steps.thenBudgetBalanced();
  });

  test('Fund Underfunded resolves overspending before goals', async () => {
    const ctx = createBudgetFlowContext();
    const steps = stepDefinitions(ctx);
    await steps.givenReadyToAssignIs(500);
    await steps.andAtLeastOneOverspent();
    await steps.whenFundUnderfundedExecuted();
    await steps.thenOverspentFundedFirst();
    await steps.thenRemainingToGoals();
    await steps.thenNoNegativeOverspentIfSufficient();
    await steps.thenBudgetBalanced();
  });

  test('Sequential execution of Smart Assign and Fund Underfunded respects shared RTA pool', async () => {
    const ctx = createBudgetFlowContext();
    ctx.state = createBudgetState({ readyToAssign: 1000, accounts: [{ name: 'Checking', balance: 1000 }] });
    const steps = stepDefinitions(ctx);
    await steps.whenSmartAssignFirst();
    await steps.whenFundUnderfundedSecond();
    await steps.thenSecondUsesRemainingRta();
    await steps.thenNeverExceedInitialRta();
    await steps.thenInvariantValid();
  });

  test('Unassign Month releases all assigned funds back to RTA', async () => {
    const ctx = createBudgetFlowContext();
    const steps = stepDefinitions(ctx);
    await steps.givenSelectedMonthAssigned600();
    await steps.whenUnassignMonth();
    await steps.thenAllAssignedZero();
    await steps.thenRtaIncreasesBy600();
    await steps.thenActivityUnchanged();
    await steps.thenBudgetBalanced();
  });

  test('Unassign Month preserves historical activity', async () => {
    const ctx = createBudgetFlowContext();
    ctx.state = createBudgetState({ accounts: [{ name: 'Checking', balance: 1000 }] });
    const steps = stepDefinitions(ctx);
    await steps.givenMonthWithActivity();
    await steps.whenUnassignMonth();
    await steps.thenTransactionsUnchanged();
    await steps.thenOnlyAssignedReset();
    await steps.thenAvailableFromActivity();
  });

  test('Smart Assign stops when RTA reaches zero', async () => {
    const ctx = createBudgetFlowContext();
    const steps = stepDefinitions(ctx);
    await steps.givenReadyToAssignIs(200);
    await steps.andCategoriesRequireTotal(500);
    await steps.whenSmartAssignExecuted();
    await steps.thenStopsAtZeroRta();
    await steps.thenNoPartialOverfund();
    await steps.thenNoNegativeRta();
  });

  test('Fund Underfunded follows urgency order correctly', async () => {
    const ctx = createBudgetFlowContext();
    const steps = stepDefinitions(ctx);
    await steps.givenReadyToAssignIs(800);
    await steps.andUrgencyMix();
    await steps.whenFundUnderfundedExecuted();
    await steps.thenOverspentFundedFirst();
    await steps.thenMonthlyBeforeBalance();
    await steps.thenBalanceLast();
    await steps.thenBudgetBalanced();
  });

  test('Combined Smart Assign, Fund Underfunded, and Unassign Month preserve equation', async () => {
    const ctx = createBudgetFlowContext();
    ctx.state = createBudgetState({
      readyToAssign: 1000,
      accounts: [{ name: 'Checking', balance: 2000 }],
      categories: [
        {
          name: 'Preassigned',
          assigned: 1000,
          available: 1000,
          target_type: 'monthly',
          target_amount: 1000,
        },
      ],
    });
    const steps = stepDefinitions(ctx);
    await steps.whenMixedOperations();
    await steps.andFundUnderfundedMixed();
    await steps.andUnassignAnotherMonth();
    await steps.thenAccountsEqualRtaPlusBalances();
    await steps.thenNoMoneyCreatedOrLost();
  });

  test('Operations in one month do not affect other months assignments', async () => {
    const ctx = createBudgetFlowContext();
    const steps = stepDefinitions(ctx);
    await steps.givenJuneAndJulyAssigned();
    await steps.whenSmartAssignInJune();
    await steps.thenJulyUnchanged();
    await steps.thenOnlyJuneModified();
  });

  test('RTA remains consistent after full budget reallocation cycle', async () => {
    const ctx = createBudgetFlowContext();
    ctx.state = createBudgetState({ readyToAssign: 500, accounts: [{ name: 'Checking', balance: 1000 }] });
    const steps = stepDefinitions(ctx);
    await steps.whenUnassignMonthWith300();
    await steps.whenSmartAssignAfterward();
    await steps.thenRtaCycleReflects();
    await steps.thenBudgetBalanced();
  });

  test('Categories receive partial funding when RTA is insufficient', async () => {
    const ctx = createBudgetFlowContext();
    const steps = stepDefinitions(ctx);
    await steps.givenReadyToAssignIs(150);
    await steps.andTwoCategoriesRequire200();
    await steps.whenSmartAssignExecuted();
    await steps.thenPartialFirstCategory();
    await steps.thenOthersUnfunded();
    await steps.thenNoNegativeRta();
  });

  test('Re-running Unassign Month produces no additional changes', async () => {
    const ctx = createBudgetFlowContext();
    const steps = stepDefinitions(ctx);
    await steps.givenAllUnassigned();
    await steps.whenUnassignMonth();
    await steps.thenNoChangesOnRepeat();
    await steps.thenRtaUnchanged();
  });

  test('System prevents assigning more than available RTA', async () => {
    const ctx = createBudgetFlowContext();
    const steps = stepDefinitions(ctx);
    await steps.givenReadyToAssignIs(300);
    await steps.whenSmartAssignAttempts500();
    await steps.thenCapAt300();
    await steps.thenNoNegativeRta();
  });

  test('UI actions reflect backend budget engine correctly', async () => {
    const ctx = createBudgetFlowContext();
    ctx.state = createBudgetState({ readyToAssign: 600, accounts: [{ name: 'Checking', balance: 600 }] });
    const steps = stepDefinitions(ctx);
    await steps.givenSmartAssignViaUi();
    await steps.whenBackendCompletes();
    await steps.thenUiMatchesBackend();
    await steps.thenNoDesync();
  });

  test('Global budget mathematical invariant always holds', async () => {
    const ctx = createBudgetFlowContext();
    const steps = stepDefinitions(ctx);
    await steps.givenAnyCombination();
    await steps.thenGlobalInvariant();
    await steps.thenNeverViolateRule();
  });
});
