@intentflow @budget @orchestration
Feature: Full Budget Flow Orchestration
  Ensures Smart Assign, Fund Underfunded, and Unassign Month
  maintain strict budget invariants across all months, categories, and RTA.

  Background:
    Given the budget orchestration harness is initialized

  @smart-assign @rta
  Scenario: Smart Assign allocates RTA across smallest target categories
    Given Ready To Assign is 500
    And multiple categories with valid goal targets exist
    When Smart Assign is executed for the selected month
    Then categories should be funded in ascending order of target amount
    And no category should receive more than its needed amount
    And Ready To Assign should decrease by total assigned amount
    And budget equation must remain balanced

  @fund-underfunded @overspent
  Scenario: Fund Underfunded resolves overspending before goals
    Given Ready To Assign is 500
    And at least one category is overspent
    When Fund Underfunded is executed
    Then overspent categories should be funded first
    And remaining RTA should be allocated to goal-based categories
    And no overspent category should remain negative if RTA is sufficient

  @sequential @rta
  Scenario: Sequential execution of Smart Assign and Fund Underfunded respects shared RTA pool
    Given Ready To Assign is 1000
    When Smart Assign is executed first
    And Fund Underfunded is executed second
    Then second operation should only use remaining RTA
    And total assigned amount should never exceed initial RTA
    And budget invariant must remain valid

  @unassign @rta
  Scenario: Unassign Month releases all assigned funds back to RTA
    Given a selected month with multiple assigned categories totaling 600
    When Unassign Month is executed
    Then all category assigned values should be set to 0
    And Ready To Assign should increase by 600
    And category activity should remain unchanged
    And budget equation must remain balanced

  @unassign @activity
  Scenario: Unassign Month preserves historical activity
    Given a month with category spending activity recorded
    When Unassign Month is executed
    Then all transactions should remain unchanged
    And only Assigned values should be reset
    And Available should be recalculated from activity

  @smart-assign @partial
  Scenario: Smart Assign stops when RTA reaches zero
    Given Ready To Assign is 200
    And categories require 500 total funding
    When Smart Assign is executed
    Then allocation should stop once RTA reaches 0
    And remaining categories should not be partially overfunded

  @fund-underfunded @urgency
  Scenario: Fund Underfunded follows urgency order correctly
    Given Ready To Assign is 800
    And categories include overspent, monthly goals, and target balance goals
    When Fund Underfunded is executed
    Then overspent categories should be funded first
    And monthly goals should be funded second
    And target balance goals should be funded last

  @mixed @invariant
  Scenario: Combined Smart Assign, Fund Underfunded, and Unassign Month preserve equation
    Given Ready To Assign is 1000
    When Smart Assign is executed
    And Fund Underfunded is executed
    And Unassign Month is executed for another month
    Then total on-budget accounts should always equal RTA plus category balances
    And no money should be created or lost

  @cross-month
  Scenario: Operations in one month do not affect other months' assignments
    Given June and July both have assigned budgets
    When Smart Assign is executed in June
    Then July assignments should remain unchanged
    And only June RTA and categories should be modified

  @unassign @smart-assign @cycle
  Scenario: RTA remains consistent after full budget reallocation cycle
    Given Ready To Assign is 500
    When Unassign Month is executed on a month with 300 assigned
    And Smart Assign is executed afterward
    Then RTA should reflect +300 then −new allocations
    And final equation must remain balanced

  @partial @smart-assign
  Scenario: Categories receive partial funding when RTA is insufficient
    Given Ready To Assign is 150
    And two categories require 200 and 200 respectively
    When Smart Assign is executed
    Then first category should receive partial funding based on order
    And remaining categories should remain unfunded
    And no negative RTA should occur

  @unassign @idempotent
  Scenario: Re-running Unassign Month produces no additional changes
    Given a month where all categories are already unassigned
    When Unassign Month is executed again
    Then no category values should change
    And Ready To Assign should remain unchanged

  @guard @smart-assign
  Scenario: System prevents assigning more than available RTA
    Given Ready To Assign is 300
    When Smart Assign attempts to assign 500 total
    Then system should cap assignments at 300
    And no negative RTA should occur

  @ui @consistency
  Scenario: UI actions reflect backend budget engine correctly
    Given Smart Assign is executed via UI
    When backend processing completes
    Then UI values for RTA, Assigned, and Available should match backend state
    And no desynchronization should occur

  @invariant @global
  Scenario: Global budget mathematical invariant always holds
    Given any combination of Smart Assign, Fund Underfunded, or Unassign Month actions
    Then total on-budget account balances must equal Ready To Assign plus all category balances
    And no operation should violate this rule under any condition
