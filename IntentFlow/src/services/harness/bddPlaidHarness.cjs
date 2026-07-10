/**
 * BDD harness for imported-cash / Plaid sandbox UI-E2E scenarios.
 * Only for non-packaged automation — never available in production builds.
 */

const { v4: uuidv4 } = require('uuid');
const { roundMoney } = require('../../shared/readyToAssignEngine.cjs');
const { isOnBudgetCashAccount } = require('../../utils/cashAccountUtils.cjs');
const importedCashReconciliationService = require('../budget/importedCashReconciliationService.cjs');
const readyToAssignPoolService = require('../budget/readyToAssignPoolService.cjs');
const budgetIntegrityService = require('../budget/budgetIntegrityService.cjs');
const accountDuplicateResolutionService = require('../accounts/accountDuplicateResolutionService.cjs');

const PREFIX = 'BDD-IC';
const INSTITUTION = 'BDD Sandbox Bank';

const ACCOUNT_NAMES = Object.freeze({
  plaidChecking: `${PREFIX} Plaid Checking`,
  plaidSavings: `${PREFIX} Plaid Savings`,
  manualChecking: `${PREFIX} Manual Checking`,
  plaidCreditCard: `${PREFIX} Plaid Credit Card`,
  plaidInvestment: `${PREFIX} Plaid Investment`,
  plaidEurSavings: `${PREFIX} Plaid EUR Savings`,
});

function assertHarnessAllowed(isPackaged) {
  if (isPackaged) {
    throw new Error('Imported-cash harness is not available in packaged production builds');
  }
}

function normalizeType(type) {
  const t = String(type || 'checking').toLowerCase();
  if (t === 'credit' || t === 'credit card') return 'credit';
  if (t === 'savings') return 'savings';
  if (t === 'investment' || t === 'tracking') return 'investment';
  return 'checking';
}

function accountCategory(type) {
  const t = normalizeType(type);
  if (t === 'credit') return 'credit';
  if (t === 'investment') return 'tracking';
  return 'budget';
}

function isOnBudgetType(type) {
  return accountCategory(type) === 'budget';
}

async function listHarnessAccounts(db, userId) {
  return db.all(
    `SELECT id, name FROM accounts WHERE user_id = ? AND name LIKE ?`,
    [userId, `${PREFIX}%`]
  );
}

async function cleanupHarness(db, userId) {
  const accounts = await listHarnessAccounts(db, userId);
  const ids = accounts.map((a) => a.id).filter(Boolean);
  if (!ids.length) {
    await db.run(`DELETE FROM plaid_items WHERE user_id = ? AND institution_name = ?`, [
      userId,
      INSTITUTION,
    ]);
    return { deletedAccounts: 0 };
  }

  const placeholders = ids.map(() => '?').join(',');
  await db.run(
    `DELETE FROM transaction_splits WHERE transaction_id IN (
       SELECT id FROM transactions WHERE account_id IN (${placeholders})
     )`,
    ids
  );
  await db.run(`DELETE FROM transactions WHERE account_id IN (${placeholders})`, ids);
  await db.run(`DELETE FROM transactions WHERE user_id = ? AND account_id IN (${placeholders})`, [
    userId,
    ...ids,
  ]);
  await db.run(
    `DELETE FROM plaid_accounts WHERE account_id IN (${placeholders}) OR item_id IN (
       SELECT id FROM plaid_items WHERE user_id = ? AND institution_name = ?
     )`,
    [...ids, userId, INSTITUTION]
  );
  await db.run(`DELETE FROM plaid_items WHERE user_id = ? AND institution_name = ?`, [
    userId,
    INSTITUTION,
  ]);
  await db.run(
    `DELETE FROM monthly_budgets WHERE category_id IN (
      SELECT id FROM categories WHERE user_id = ? AND name LIKE ?
    )`,
    [userId, `${PREFIX}%`]
  );
  await db.run(`DELETE FROM categories WHERE user_id = ? AND name LIKE ?`, [
    userId,
    `${PREFIX}%`,
  ]);
  await db.run(`DELETE FROM accounts WHERE id IN (${placeholders})`, ids);
  return { deletedAccounts: ids.length };
}

async function ensureCategory(db, userId, name, monthKey) {
  let row = await db.get(`SELECT id FROM categories WHERE user_id = ? AND name = ?`, [
    userId,
    name,
  ]);
  if (row?.id) return row.id;
  const id = uuidv4();
  let group = await db.get(`SELECT id FROM category_groups WHERE user_id = ? LIMIT 1`, [userId]);
  if (!group?.id) {
    const groupId = uuidv4();
    await db.run(
      `INSERT INTO category_groups (id, user_id, name, sort_order) VALUES (?, ?, 'BDD', 999)`,
      [groupId, userId]
    );
    group = { id: groupId };
  }
  await db.run(
    `INSERT INTO categories (id, user_id, name, group_id, assigned, available, activity, archived)
     VALUES (?, ?, ?, ?, 0, 0, 0, 0)`,
    [id, userId, name, group.id]
  );
  await db.run(
    `INSERT OR IGNORE INTO monthly_budgets (id, category_id, month, budgeted_amount, activity_amount, available_amount)
     VALUES (?, ?, ?, 0, 0, 0)`,
    [uuidv4(), id, monthKey]
  );
  return id;
}

async function assignCategoryAvailable(db, userId, categoryName, available, monthKey) {
  const categoryId = await ensureCategory(db, userId, categoryName, monthKey);
  const monthlyBudgetService = require('../budget/monthlyBudgetService.cjs');
  const assigned = roundMoney(Number(available) || 0);
  await monthlyBudgetService.applyMonthBudgetBulkAndRefresh(
    db,
    userId,
    monthKey,
    [{ categoryId, assigned }],
    { mode: 'absolute', auditSource: 'harness', skipPostMutationInvariant: true }
  );
  return categoryId;
}

async function distributeCategoryTotal(db, userId, totalAvailable, monthKey) {
  const target = roundMoney(Number(totalAvailable) || 0);
  if (target <= 0) return;
  await assignCategoryAvailable(db, userId, `${PREFIX} Groceries`, target, monthKey);
}

async function setAccountBalances(db, accountId, balance) {
  const bal = roundMoney(Number(balance) || 0);
  await db.run(
    `UPDATE accounts
     SET balance = ?, cleared_balance = ?, working_balance = ?, updated_at = datetime('now')
     WHERE id = ?`,
    [bal, bal, bal, accountId]
  );
}

async function createManualAccount(db, userId, { name, type = 'checking', balance = 0 }) {
  const id = uuidv4();
  const t = normalizeType(type);
  const cat = accountCategory(t);
  const onBudget = isOnBudgetType(t) ? 1 : 0;
  const bal = roundMoney(Number(balance) || 0);
  await db.run(
    `INSERT INTO accounts (
      id, user_id, name, type, account_type_category, balance, cleared_balance, working_balance,
      source, on_budget, budget_inclusion_status, is_active, account_status, onboarding_complete,
      currency, institution, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?, ?, 1, 'active', 0, 'USD', NULL,
      datetime('now'), datetime('now'))`,
    [
      id,
      userId,
      name,
      t,
      cat,
      bal,
      bal,
      bal,
      onBudget,
      onBudget ? 'on_budget' : 'off_budget',
    ]
  );
  return { accountId: id, name };
}

async function createPlaidItem(db, userId) {
  const existing = await db.get(
    `SELECT id FROM plaid_items WHERE user_id = ? AND institution_name = ? LIMIT 1`,
    [userId, INSTITUTION]
  );
  if (existing?.id) return existing.id;
  const itemId = uuidv4();
  await db.run(
    `INSERT INTO plaid_items (id, user_id, access_token, institution_id, institution_name, status)
     VALUES (?, ?, 'access-sandbox-bdd', 'ins_bdd', ?, 'active')`,
    [itemId, userId, INSTITUTION]
  );
  return itemId;
}

async function createPlaidLinkedAccount(
  db,
  userId,
  {
    name,
    type = 'checking',
    balance = 0,
    accountStatus = 'active',
    pendingMerge = false,
    currency = 'USD',
    skipOnboarding = true,
  } = {}
) {
  const itemId = await createPlaidItem(db, userId);
  const accountId = uuidv4();
  const plaidAccountId = `plaid_${uuidv4()}`;
  const t = normalizeType(type);
  const cat = accountCategory(t);
  const onBudget = isOnBudgetType(t) ? 1 : 0;
  const bal = roundMoney(Number(balance) || 0);
  const status = pendingMerge ? 'pending_merge' : accountStatus;
  const isActive = pendingMerge ? 0 : 1;

  await db.run(
    `INSERT INTO accounts (
      id, user_id, name, type, account_type_category, balance, cleared_balance, working_balance,
      source, on_budget, budget_inclusion_status, is_active, account_status, onboarding_complete,
      currency, institution, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'plaid', ?, ?, ?, ?, 0, ?, ?,
      datetime('now'), datetime('now'))`,
    [
      accountId,
      userId,
      name,
      t,
      cat,
      bal,
      bal,
      bal,
      onBudget,
      onBudget ? 'on_budget' : 'off_budget',
      isActive,
      status,
      currency,
      INSTITUTION,
    ]
  );

  await db.run(
    `INSERT INTO plaid_accounts (
      plaid_account_id, item_id, account_id, mask, name, official_name, type, subtype, fingerprint
    ) VALUES (?, ?, ?, '0000', ?, ?, ?, ?, ?)`,
    [
      plaidAccountId,
      itemId,
      accountId,
      name,
      name,
      t,
      t === 'credit' ? 'credit card' : t,
      `bdd-${plaidAccountId.slice(0, 8)}`,
    ]
  );

  return { accountId, plaidAccountId, itemId, name, balance: bal, skipOnboarding };
}

async function runOnboardingForAccount(db, userId, accountId, { priorBalance = 0, importedBalance } = {}) {
  const account = await db.get('SELECT * FROM accounts WHERE id = ? AND user_id = ?', [
    accountId,
    userId,
  ]);
  if (!account) throw new Error(`Account not found: ${accountId}`);
  const bal =
    importedBalance != null
      ? roundMoney(Number(importedBalance) || 0)
      : roundMoney(Math.max(0, Number(account.working_balance ?? account.balance) || 0));
  return importedCashReconciliationService.processImportedCashOnboarding(
    db,
    userId,
    [{ accountId, priorBalance: roundMoney(Number(priorBalance) || 0), importedBalance: bal }],
    { itemId: null, monthKey: undefined }
  );
}

async function linkSandboxAccount(db, userId, opts = {}) {
  const {
    role = 'plaidChecking',
    balance = 0,
    type,
    runOnboarding = true,
    pendingMerge = false,
    priorBalance = 0,
  } = opts;

  const name = ACCOUNT_NAMES[role] || `${PREFIX} ${role}`;
  const inferredType =
    type ||
    (role.includes('Savings') || role === 'plaidSavings' || role === 'plaidEurSavings'
      ? 'savings'
      : role.includes('Credit')
        ? 'credit'
        : role.includes('Investment')
          ? 'investment'
          : 'checking');

  const link = await createPlaidLinkedAccount(db, userId, {
    name,
    type: inferredType,
    balance,
    pendingMerge,
    currency: role === 'plaidEurSavings' ? 'EUR' : 'USD',
  });

  let onboarding = null;
  if (runOnboarding && !pendingMerge && isOnBudgetType(inferredType)) {
    onboarding = await runOnboardingForAccount(db, userId, link.accountId, {
      priorBalance,
      importedBalance: balance,
    });
  }

  return { ...link, onboarding };
}

async function seedScenarioState(db, userId, scenarioId, params = {}) {
  const monthKey = params.monthKey || new Date().toISOString().slice(0, 7) + '-01';
  await cleanupHarness(db, userId);
  await readyToAssignPoolService.setPoolBalance(db, userId, 0);

  const snap = { scenarioId, accounts: {}, monthKey };

  switch (scenarioId) {
    case 'ic-52':
    case 'ic-53':
      await readyToAssignPoolService.setPoolBalance(db, userId, params.rta ?? 0);
      snap.pendingLink = {
        role: scenarioId === 'ic-53' ? 'plaidSavings' : 'plaidChecking',
        balance: params.balance,
      };
      break;

    case 'ic-54':
      await readyToAssignPoolService.setPoolBalance(db, userId, params.rta ?? 0);
      snap.pendingLinks = [
        { role: 'plaidChecking', balance: params.checking },
        { role: 'plaidSavings', balance: params.savings },
      ];
      break;

    case 'ic-55':
    case 'ic-56': {
      const manual = await createManualAccount(db, userId, {
        name: ACCOUNT_NAMES.manualChecking,
        balance: params.manualBalance,
      });
      await runOnboardingForAccount(db, userId, manual.accountId, {
        priorBalance: 0,
        importedBalance: params.manualBalance,
      });
      await readyToAssignPoolService.setPoolBalance(db, userId, params.rta ?? params.manualBalance);
      snap.accounts.manualChecking = manual.accountId;
      const linked = await linkSandboxAccount(db, userId, {
        role: 'plaidChecking',
        balance: params.plaidBalance ?? params.manualBalance,
        pendingMerge: true,
        runOnboarding: false,
      });
      snap.accounts.plaidChecking = linked.accountId;
      snap.lastLink = linked;
      break;
    }

    case 'ic-57': {
      const linked = await linkSandboxAccount(db, userId, {
        role: 'plaidChecking',
        balance: params.balance,
        runOnboarding: true,
        priorBalance: 0,
      });
      await distributeCategoryTotal(db, userId, params.categoryAvailable ?? 0, monthKey);
      await readyToAssignPoolService.setPoolBalance(db, userId, params.rta ?? 0);
      snap.accounts.plaidChecking = linked.accountId;
      break;
    }

    case 'ic-58': {
      const linked = await linkSandboxAccount(db, userId, {
        role: 'plaidChecking',
        balance: params.balance,
        runOnboarding: true,
      });
      await readyToAssignPoolService.setPoolBalance(db, userId, params.rta ?? 0);
      await distributeCategoryTotal(db, userId, params.categoryAssigned ?? 0, monthKey);
      snap.accounts.plaidChecking = linked.accountId;
      break;
    }

    case 'ic-59': {
      const checking = await createManualAccount(db, userId, {
        name: ACCOUNT_NAMES.manualChecking,
        balance: params.onBudgetCash,
      });
      await setAccountBalances(db, checking.accountId, params.onBudgetCash);
      await distributeCategoryTotal(db, userId, params.assignedCategories ?? 0, monthKey);
      await readyToAssignPoolService.setPoolBalance(db, userId, params.rta ?? 0);
      snap.accounts.manualChecking = checking.accountId;
      snap.pendingLink = {
        role: 'plaidSavings',
        balance: params.externalSavings,
        runOnboarding: false,
      };
      break;
    }

    case 'ic-60':
      await seedOrphanMigrationState(db, userId, params, monthKey);
      break;

    case 'ic-61':
      await linkSandboxAccount(db, userId, {
        role: 'plaidChecking',
        balance: params.checkingBalance,
        runOnboarding: true,
      });
      await readyToAssignPoolService.setPoolBalance(db, userId, params.rta ?? params.checkingBalance);
      snap.pendingLink = { role: 'plaidCreditCard', balance: params.creditBalance, runOnboarding: false };
      break;

    case 'ic-62':
      await readyToAssignPoolService.setPoolBalance(db, userId, params.rta ?? 0);
      snap.pendingLink = {
        role: 'plaidInvestment',
        balance: params.investmentBalance,
        runOnboarding: false,
      };
      break;

    case 'ic-63': {
      const linked = await linkSandboxAccount(db, userId, {
        role: 'plaidChecking',
        balance: params.balance,
        runOnboarding: true,
      });
      await readyToAssignPoolService.setPoolBalance(db, userId, params.rta ?? params.balance);
      snap.accounts.plaidChecking = linked.accountId;
      break;
    }

    case 'ic-64': {
      const manual = await createManualAccount(db, userId, {
        name: ACCOUNT_NAMES.manualChecking,
        balance: params.manualBalance,
      });
      await runOnboardingForAccount(db, userId, manual.accountId, {
        priorBalance: 0,
        importedBalance: params.manualBalance,
      });
      await readyToAssignPoolService.setPoolBalance(db, userId, params.rta ?? params.manualBalance);
      snap.accounts.manualChecking = manual.accountId;
      snap.pendingLink = {
        role: 'plaidChecking',
        balance: params.plaidBalance,
        pendingMerge: true,
        runOnboarding: false,
      };
      break;
    }

    case 'ic-65': {
      const cross = await seedCrossMonthState(db, userId, params);
      if (cross.accounts?.plaidChecking) {
        snap.accounts.plaidChecking = cross.accounts.plaidChecking;
      }
      break;
    }

    case 'ic-66':
      snap.pendingLink = { role: 'plaidChecking', balance: params.balance, runOnboarding: false };
      break;

    case 'ic-67': {
      const userBId = `${PREFIX}-user-b`;
      await db.run(`INSERT OR IGNORE INTO users (id) VALUES (?)`, [userBId]);
      await cleanupHarness(db, userBId);

      const orphan = await seedOrphanMigrationState(
        db,
        userId,
        {
          onBudgetCash: params.userACash ?? 25000,
          assignedCategories: 0,
          rta: 0,
        },
        monthKey
      );
      if (orphan?.accountId) snap.accounts.manualChecking = orphan.accountId;

      await linkSandboxAccount(db, userBId, {
        role: 'plaidChecking',
        balance: params.userBCash ?? 40000,
        runOnboarding: true,
      });

      snap.userB = { userId: userBId };
      snap.userBMetrics = await getHarnessMetrics(db, userBId, monthKey);
      break;
    }

    case 'ic-68':
      await readyToAssignPoolService.setPoolBalance(db, userId, params.rta ?? 0);
      snap.pendingLink = {
        role: 'plaidEurSavings',
        balance: params.usdEquivalent ?? 22000,
        runOnboarding: false,
      };
      break;

    case 'ic-69':
      await seedOrphanMigrationState(db, userId, {
        onBudgetCash: params.onBudgetCash,
        assignedCategories: params.assignedCategories,
        rta: roundMoney(params.onBudgetCash - params.assignedCategories),
      }, monthKey);
      break;

    case 'ic-70':
      await seedHistoricalIncomeState(db, userId, params, monthKey);
      break;

    case 'ic-71':
      await seedSmallOrphanDelta(db, userId, params, monthKey);
      break;

    default:
      throw new Error(`Unknown imported-cash harness scenario: ${scenarioId}`);
  }

  return snap;
}

async function seedOrphanMigrationState(db, userId, params, monthKey) {
  const cash = roundMoney(params.onBudgetCash ?? 0);
  const assigned = roundMoney(params.assignedCategories ?? 0);
  const rta = roundMoney(params.rta ?? cash - assigned);

  const acct = await createManualAccount(db, userId, {
    name: ACCOUNT_NAMES.manualChecking,
    balance: cash,
  });
  await setAccountBalances(db, acct.accountId, cash);
  await distributeCategoryTotal(db, userId, assigned, monthKey);
  await readyToAssignPoolService.setPoolBalance(db, userId, rta);
  return { accountId: acct.accountId };
}

async function seedSmallOrphanDelta(db, userId, params, monthKey) {
  const orphan = roundMoney(params.orphanDelta ?? 13);
  const assigned = 0;
  const rta = 0;
  const cash = roundMoney(orphan + rta + assigned);
  await seedOrphanMigrationState(
    db,
    userId,
    { onBudgetCash: cash, assignedCategories: assigned, rta },
    monthKey
  );
}

async function seedHistoricalIncomeState(db, userId, params, monthKey) {
  const total = roundMoney(params.incomeTotal ?? params.balance ?? 0);
  const acct = await createManualAccount(db, userId, {
    name: ACCOUNT_NAMES.plaidChecking,
    balance: total,
  });
  await db.run(
    `UPDATE accounts SET source = 'plaid', onboarding_complete = 0 WHERE id = ?`,
    [acct.accountId]
  );
  const itemId = await createPlaidItem(db, userId);
  const plaidAccountId = `plaid_${uuidv4()}`;
  await db.run(
    `INSERT INTO plaid_accounts (plaid_account_id, item_id, account_id, name, type, subtype, fingerprint)
     VALUES (?, ?, ?, ?, 'checking', 'checking', ?)`,
    [plaidAccountId, itemId, acct.accountId, ACCOUNT_NAMES.plaidChecking, uuidv4()]
  );
  await db.run(
    `INSERT INTO transactions (
      account_id, user_id, date, description, amount, direction, payee, memo,
      is_cleared, affects_rta, transaction_type, created_at, updated_at
    ) VALUES (?, ?, date('now'), 'Historical Income', ?, 'inflow', 'Employer', 'BDD historical',
      1, 1, 'income', datetime('now'), datetime('now'))`,
    [acct.accountId, userId, total]
  );
  await readyToAssignPoolService.setPoolBalance(db, userId, total);
  return { accountId: acct.accountId, plaidAccountId };
}

async function seedCrossMonthState(db, userId, params) {
  const julyKey = params.julyMonthKey || '2026-07-01';
  const externalCash = roundMoney(params.externalChecking ?? 12000);
  const juneRta = roundMoney(params.juneRta ?? -2000);

  const acct = await createManualAccount(db, userId, {
    name: ACCOUNT_NAMES.plaidChecking,
    balance: externalCash,
  });
  await setAccountBalances(db, acct.accountId, externalCash);
  await readyToAssignPoolService.setPoolBalance(db, userId, juneRta);
  await assignCategoryAvailable(
    db,
    userId,
    `${PREFIX} July Rent`,
    params.julyAssignments ?? 4000,
    julyKey
  );

  return {
    accounts: { plaidChecking: acct.accountId },
  };
}

async function getHarnessMetrics(db, userId, monthKey) {
  const identity = await budgetIntegrityService.evaluateBudgetIdentity(db, userId, { monthKey });
  const status = await importedCashReconciliationService.getIdentityStatus(db, userId, {
    monthKey,
  });
  const openingRows = await db.all(
    `SELECT t.account_id, t.amount, a.name
     FROM transactions t
     JOIN accounts a ON a.id = t.account_id
     WHERE t.user_id = ?
       AND IFNULL(t.is_deleted, 0) = 0
       AND t.transaction_type = 'OPENING_BALANCE'`,
    [userId]
  );
  const openingTotal = roundMoney(
    openingRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0)
  );
  return {
    ...identity,
    unallocatedImportedCash: status.unallocatedImportedCash,
    healthStatus: status.healthStatus,
    openingBalanceRows: openingRows,
    openingBalanceTotal: openingTotal,
  };
}

async function simulateBalanceRefresh(db, userId, accountName, newBalance) {
  const account = await db.get(
    `SELECT id FROM accounts WHERE user_id = ? AND name = ? LIMIT 1`,
    [userId, accountName]
  );
  if (!account?.id) throw new Error(`Account not found: ${accountName}`);
  const before = await getHarnessMetrics(db, userId);
  await setAccountBalances(db, account.id, newBalance);
  const after = await getHarnessMetrics(db, userId);
  const newOpenings = after.openingBalanceTotal - before.openingBalanceTotal;
  return { accountId: account.id, newBalance: roundMoney(newBalance), newOpenings };
}

async function simulateFailedOnboarding(db, userId, pending = {}) {
  const link = await linkSandboxAccount(db, userId, {
    ...pending,
    runOnboarding: false,
  });

  await db.run('BEGIN IMMEDIATE');
  try {
    await runOnboardingForAccount(db, userId, link.accountId, {
      priorBalance: 0,
      importedBalance: pending.balance ?? 0,
    });
    throw new Error('BDD simulated onboarding failure before commit');
  } catch (_err) {
    await db.run('ROLLBACK');
  }

  await db.run(
    `DELETE FROM transactions
     WHERE user_id = ? AND account_id = ? AND transaction_type = 'OPENING_BALANCE'`,
    [userId, link.accountId]
  );

  const metrics = await getHarnessMetrics(db, userId);
  return { ...link, rolledBack: true, openingBalanceTotal: metrics.openingBalanceTotal };
}

async function handleHarnessAction(db, userId, action, payload = {}, { isPackaged = false } = {}) {
  assertHarnessAllowed(isPackaged);
  const monthKey = payload.monthKey || new Date().toISOString().slice(0, 7) + '-01';

  switch (action) {
    case 'cleanup':
      return cleanupHarness(db, userId);
    case 'seed':
      return seedScenarioState(db, userId, payload.scenarioId, payload);
    case 'linkPending': {
      const pending = payload.pendingLink || payload;
      return linkSandboxAccount(db, userId, pending);
    }
    case 'linkMultiple': {
      const results = [];
      for (const spec of payload.accounts || []) {
        results.push(await linkSandboxAccount(db, userId, spec));
      }
      return { accounts: results };
    }
    case 'refreshBalance':
      return simulateBalanceRefresh(db, userId, payload.accountName, payload.newBalance);
    case 'reconcile':
      return importedCashReconciliationService.applyImportedCashReconciliation(db, userId, {
        monthKey,
        approvedByUser: true,
        ...payload,
      });
    case 'resolveDuplicate':
      return accountDuplicateResolutionService.resolveAccountDuplicate(
        db,
        userId,
        payload,
        { processImportedCashOnboarding: importedCashReconciliationService.processImportedCashOnboarding }
      );
    case 'completeOnboarding': {
      const account = await db.get(
        `SELECT id, working_balance, balance FROM accounts WHERE user_id = ? AND name = ?`,
        [userId, payload.accountName || ACCOUNT_NAMES.plaidChecking]
      );
      if (!account?.id) throw new Error('Account not found for onboarding completion');
      return runOnboardingForAccount(db, userId, account.id, {
        priorBalance: payload.priorBalance ?? 0,
        importedBalance: payload.importedBalance,
      });
    }
    case 'failOnboarding': {
      const pending = payload.pendingLink || payload;
      return simulateFailedOnboarding(db, userId, pending);
    }
    case 'metrics': {
      const targetUserId = payload.userId || userId;
      return getHarnessMetrics(db, targetUserId, monthKey);
    }
    case 'openingBalanceForAccount': {
      const account = await db.get(
        `SELECT id FROM accounts WHERE user_id = ? AND name = ?`,
        [userId, payload.accountName]
      );
      if (!account?.id) return { total: 0, count: 0 };
      const rows = await db.all(
        `SELECT amount FROM transactions
         WHERE user_id = ? AND account_id = ?
           AND transaction_type = 'OPENING_BALANCE'
           AND IFNULL(is_deleted, 0) = 0`,
        [userId, account.id]
      );
      return {
        total: roundMoney(rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)),
        count: rows.length,
      };
    }
    default:
      throw new Error(`Unknown harness action: ${action}`);
  }
}

module.exports = {
  ACCOUNT_NAMES,
  PREFIX,
  assertHarnessAllowed,
  cleanupHarness,
  seedScenarioState,
  linkSandboxAccount,
  getHarnessMetrics,
  handleHarnessAction,
};
