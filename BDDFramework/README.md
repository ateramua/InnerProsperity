# IntentFlow BDD Framework

BDD-style orchestration tests for IntentFlow budget flows. Feature specifications live in:

- `IntentFlow/tests/features/intentflow-ui-e2e.feature`

Executable scenarios are implemented in Playwright specs using `Given` / `When` / `Then` step wrappers (matching the E2E-TestSuite convention).

## Run

```bash
cd BDDFramework
npm install
npm run test:budget-flow
```

## Structure

- `support/budgetFlowHarness.js` — orchestration engine using IntentFlow `underfundedEngine.cjs`
- `step-definitions/budgetFlowSteps.js` — reusable step definitions
- `specs/budget-flow-orchestration.spec.js` — scenario implementations mapped to the feature file
