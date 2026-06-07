export { step } from './executionSteps.js';

export function createBudgetFlowContext() {
  return {
    state: null,
    initialRta: 0,
    julyLedgerBefore: null,
    operationResults: [],
  };
}
