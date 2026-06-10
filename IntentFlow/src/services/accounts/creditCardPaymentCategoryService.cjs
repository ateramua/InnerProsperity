/**
 * System-managed "Credit Card Payments" budget categories (one per active credit account).
 */

const { v4: uuidv4 } = require('uuid');

const CREDIT_CARD_PAYMENTS_GROUP_NAME = 'Credit Card Payments';
const LEGACY_PAYMENT_SUFFIX = ' payment';

function normalizeNameKey(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

/** Display name for payment category (matches account name per product spec). */
function buildCreditCardPaymentCategoryName(accountName) {
  const safe = String(accountName || 'Credit Card').trim() || 'Credit Card';
  return safe;
}

/** True when stored category name matches account (current or legacy "… Payment" naming). */
function categoryNameMatchesAccount(categoryName, accountName) {
  const catKey = normalizeNameKey(categoryName);
  const accKey = normalizeNameKey(accountName);
  if (!catKey || !accKey) return false;
  if (catKey === accKey) return true;
  if (catKey === `${accKey}${LEGACY_PAYMENT_SUFFIX}`) return true;
  if (catKey.endsWith(LEGACY_PAYMENT_SUFFIX) && catKey.slice(0, -LEGACY_PAYMENT_SUFFIX.length) === accKey) {
    return true;
  }
  return false;
}

/**
 * Eligible budget credit card: type credit, participates in budget (not tracking/loan role),
 * active, not merged away.
 */
function isEligibleBudgetCreditCardAccount(account) {
  if (!account) return false;
  const type = String(account.type || '').toLowerCase().replace(/_/g, ' ');
  if (type !== 'credit' && type !== 'credit card' && type !== 'charge card') {
    return false;
  }
  const category = String(account.account_type_category || 'credit').toLowerCase();
  if (category === 'tracking' || category === 'loan') return false;
  if (account.is_active === 0 || account.is_active === false) return false;
  const status = String(account.account_status || 'active').toLowerCase();
  if (status !== 'active') return false;
  if (account.merged_into_account_id) return false;
  return true;
}

function logRepair(reason, detail) {
  console.info('[cc-payment-category]', reason, detail);
}

async function getOrCreateCreditCardPaymentsGroup(db, userId) {
  if (!userId) return null;
  const existing = await db.get(
    `SELECT * FROM category_groups
     WHERE user_id = ? AND lower(name) = lower(?)
     LIMIT 1`,
    [userId, CREDIT_CARD_PAYMENTS_GROUP_NAME]
  );
  if (existing) {
    if (!existing.system_managed) {
      await db.run(
        `UPDATE category_groups
         SET system_managed = 1, updated_at = datetime('now')
         WHERE id = ?`,
        [existing.id]
      );
      return { ...existing, system_managed: 1 };
    }
    return existing;
  }

  const maxSort = await db.get(
    `SELECT COALESCE(MAX(sort_order), -1) AS max_sort
     FROM category_groups
     WHERE user_id = ?`,
    [userId]
  );
  const nextSort = (Number(maxSort?.max_sort) || -1) + 1;
  const id = uuidv4();
  await db.run(
    `INSERT INTO category_groups (id, user_id, name, sort_order, system_managed, created_at, updated_at)
     VALUES (?, ?, ?, ?, 1, datetime('now'), datetime('now'))`,
    [id, userId, CREDIT_CARD_PAYMENTS_GROUP_NAME, nextSort]
  );
  return db.get('SELECT * FROM category_groups WHERE id = ?', [id]);
}

async function listPaymentCategoriesForAccount(db, userId, accountId, accountName) {
  const byLink = await db.all(
    `SELECT * FROM categories
     WHERE user_id = ?
       AND is_credit_card_payment_category = 1
       AND CAST(linked_account_id AS TEXT) = CAST(? AS TEXT)`,
    [userId, accountId]
  );
  if (byLink.length > 0) return byLink;

  if (!accountName) return [];
  const all = await db.all(
    `SELECT * FROM categories
     WHERE user_id = ? AND is_credit_card_payment_category = 1`,
    [userId]
  );
  return all.filter((c) => categoryNameMatchesAccount(c.name, accountName));
}

/**
 * Archive the payment category for an account (deactivate / merge / hide from budget).
 */
async function archiveCreditCardPaymentCategoryForAccount(db, accountRow, { reason = 'account_inactive' } = {}) {
  if (!accountRow?.id || !accountRow?.user_id) return { archived: false };

  const ownerId = accountRow.user_id;
  const categories = await listPaymentCategoriesForAccount(
    db,
    ownerId,
    accountRow.id,
    accountRow.name
  );
  if (accountRow.paired_category_id) {
    const paired = await db.get(
      'SELECT * FROM categories WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?',
      [accountRow.paired_category_id, ownerId]
    );
    if (paired && !categories.some((c) => String(c.id) === String(paired.id))) {
      categories.push(paired);
    }
  }

  let archivedCount = 0;
  for (const cat of categories) {
    if (cat.archived === 1) continue;
    await db.run(
      `UPDATE categories
       SET archived = 1, archived_at = datetime('now'), updated_at = datetime('now')
       WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
      [cat.id, ownerId]
    );
    archivedCount += 1;
    logRepair('archived_payment_category', {
      reason,
      accountId: accountRow.id,
      categoryId: cat.id,
      categoryName: cat.name,
    });
  }

  if (archivedCount > 0) {
    await db.run(
      `UPDATE accounts SET paired_category_id = NULL, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [accountRow.id, ownerId]
    );
  }

  return { archived: archivedCount > 0, archivedCount };
}

/**
 * Keep a single canonical payment category; archive duplicate rows.
 */
async function dedupePaymentCategoriesForAccount(db, userId, accountRow, canonicalCategoryId) {
  const categories = await listPaymentCategoriesForAccount(
    db,
    userId,
    accountRow.id,
    accountRow.name
  );
  if (categories.length <= 1) return { deduped: 0 };

  const canonical =
    categories.find((c) => String(c.id) === String(canonicalCategoryId)) || categories[0];
  let deduped = 0;

  for (const cat of categories) {
    if (String(cat.id) === String(canonical.id)) continue;
    if (cat.archived === 1) continue;
    await db.run(
      `UPDATE categories
       SET archived = 1, archived_at = datetime('now'), updated_at = datetime('now')
       WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?`,
      [cat.id, userId]
    );
    deduped += 1;
    logRepair('deduped_duplicate_payment_category', {
      accountId: accountRow.id,
      removedCategoryId: cat.id,
      keptCategoryId: canonical.id,
    });
  }

  return { deduped, canonicalCategoryId: canonical.id };
}

/**
 * Ensure a payment category exists for one eligible credit account.
 */
async function ensureCreditCardPaymentCategoryForAccount(db, accountRow, options = {}) {
  if (!isEligibleBudgetCreditCardAccount(accountRow)) {
    return null;
  }
  const ownerId = accountRow.user_id;
  if (!ownerId) return null;

  const paymentGroup = await getOrCreateCreditCardPaymentsGroup(db, ownerId);
  if (!paymentGroup) return null;

  let paymentCategory = null;
  if (accountRow.paired_category_id) {
    paymentCategory = await db.get(
      'SELECT * FROM categories WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?',
      [accountRow.paired_category_id, ownerId]
    );
  }
  if (!paymentCategory) {
    const linked = await listPaymentCategoriesForAccount(db, ownerId, accountRow.id, accountRow.name);
    paymentCategory = linked.find((c) => c.archived !== 1) || linked[0] || null;
  }

  const desiredName = buildCreditCardPaymentCategoryName(accountRow.name);
  const wasMissing = !paymentCategory;

  if (!paymentCategory) {
    const categoryId = `cat_ccpay_${Date.now()}_${Math.floor(Math.random() * 1000000)}`;
    await db.run(
      `INSERT INTO categories (
        id, user_id, name, group_id, assigned, target_type, target_amount, target_date,
        is_credit_card_payment_category, linked_account_id, priority, archived, created_at, updated_at
       ) VALUES (?, ?, ?, ?, 0, 'monthly', 0, NULL, 1, ?, 2, 0, datetime('now'), datetime('now'))`,
      [categoryId, ownerId, desiredName, paymentGroup.id, accountRow.id]
    );
    paymentCategory = await db.get(
      'SELECT * FROM categories WHERE id = ? AND user_id = ?',
      [categoryId, ownerId]
    );
    if (wasMissing && options.reason) {
      logRepair('created_payment_category', {
        reason: options.reason,
        accountId: accountRow.id,
        categoryId: paymentCategory.id,
        categoryName: desiredName,
      });
    }
  } else {
    await db.run(
      `UPDATE categories
       SET name = ?, group_id = ?, is_credit_card_payment_category = 1,
           linked_account_id = ?, archived = 0, archived_at = NULL, updated_at = datetime('now')
       WHERE CAST(id AS TEXT) = CAST(? AS TEXT)`,
      [desiredName, paymentGroup.id, accountRow.id, paymentCategory.id]
    );
    paymentCategory = await db.get(
      'SELECT * FROM categories WHERE CAST(id AS TEXT) = CAST(? AS TEXT)',
      [paymentCategory.id]
    );
  }

  await dedupePaymentCategoriesForAccount(db, ownerId, accountRow, paymentCategory.id);

  await db.run(
    `UPDATE accounts
     SET paired_category_id = ?, updated_at = datetime('now')
     WHERE id = ? AND user_id = ?`,
    [paymentCategory.id, accountRow.id, ownerId]
  );
  return paymentCategory;
}

/**
 * Full sync: ensure active cards, archive inactive/merged, repair orphans, dedupe.
 */
async function syncCreditCardPaymentCategoriesForUser(db, userId, options = {}) {
  const reason = options.reason || 'sync';
  const repairs = [];

  const allCreditAccounts = await db.all(
    `SELECT * FROM accounts WHERE user_id = ? AND lower(type) = 'credit'`,
    [userId]
  );

  let ensured = 0;
  let archived = 0;

  for (const account of allCreditAccounts) {
    if (isEligibleBudgetCreditCardAccount(account)) {
      const before = await listPaymentCategoriesForAccount(db, userId, account.id, account.name);
      const category = await ensureCreditCardPaymentCategoryForAccount(db, account, { reason });
      if (category) {
        ensured += 1;
        if (before.length === 0) {
          repairs.push({ action: 'created', accountId: account.id, categoryId: category.id });
        } else if (before.some((c) => c.archived === 1)) {
          repairs.push({ action: 'restored', accountId: account.id, categoryId: category.id });
        }
      }
    } else {
      const result = await archiveCreditCardPaymentCategoryForAccount(db, account, {
        reason: `${reason}:account_ineligible`,
      });
      if (result.archived) {
        archived += 1;
        repairs.push({ action: 'archived', accountId: account.id, count: result.archivedCount });
      }
    }
  }

  const orphanCategories = await db.all(
    `SELECT c.* FROM categories c
     WHERE c.user_id = ?
       AND c.is_credit_card_payment_category = 1
       AND (c.archived IS NULL OR c.archived = 0)`,
    [userId]
  );

  for (const cat of orphanCategories) {
    if (!cat.linked_account_id) {
      await db.run(
        `UPDATE categories SET archived = 1, archived_at = datetime('now'), updated_at = datetime('now')
         WHERE CAST(id AS TEXT) = CAST(? AS TEXT)`,
        [cat.id]
      );
      repairs.push({ action: 'archived_orphan', categoryId: cat.id });
      archived += 1;
      continue;
    }
    const account = await db.get(
      'SELECT * FROM accounts WHERE CAST(id AS TEXT) = CAST(? AS TEXT) AND user_id = ?',
      [cat.linked_account_id, userId]
    );
    if (!account || !isEligibleBudgetCreditCardAccount(account)) {
      await db.run(
        `UPDATE categories SET archived = 1, archived_at = datetime('now'), updated_at = datetime('now')
         WHERE CAST(id AS TEXT) = CAST(? AS TEXT)`,
        [cat.id]
      );
      repairs.push({
        action: 'archived_orphan',
        categoryId: cat.id,
        linkedAccountId: cat.linked_account_id,
      });
      archived += 1;
    }
  }

  if (repairs.length > 0) {
    logRepair('sync_complete', { userId, reason, repairs });
  }

  return {
    userId,
    reason,
    accountsProcessed: allCreditAccounts.length,
    categoriesEnsured: ensured,
    categoriesArchived: archived,
    repairs,
  };
}

/** @deprecated Use syncCreditCardPaymentCategoriesForUser — kept for callers. */
async function ensureAllCreditCardPaymentCategoriesForUser(db, userId, options = {}) {
  return syncCreditCardPaymentCategoriesForUser(db, userId, {
    ...options,
    reason: options.reason || 'ensure_all',
  });
}

/**
 * Resolve payment category row for UI / transfers (by account id or name; supports legacy names).
 */
function resolvePaymentCategoryFromList(categories, { accountId, accountName, paymentGroupId } = {}) {
  const pool = (categories || []).filter(
    (cat) =>
      cat.is_credit_card_payment_category === 1 ||
      cat.is_credit_card_payment_category === true
  );
  const inGroup = paymentGroupId
    ? pool.filter((cat) => String(cat.group_id ?? cat.groupId) === String(paymentGroupId))
    : pool;

  if (accountId) {
    const byId = inGroup.find(
      (cat) => String(cat.linked_account_id ?? cat.linkedAccountId) === String(accountId)
    );
    if (byId) return byId;
  }

  const name = String(accountName || '').trim();
  if (!name) return null;

  const byName = inGroup.find((cat) => categoryNameMatchesAccount(cat.name, name));
  if (byName) return byName;

  return inGroup.find((cat) => normalizeNameKey(cat.name) === normalizeNameKey(name)) || null;
}

module.exports = {
  CREDIT_CARD_PAYMENTS_GROUP_NAME,
  LEGACY_PAYMENT_SUFFIX,
  buildCreditCardPaymentCategoryName,
  categoryNameMatchesAccount,
  isEligibleBudgetCreditCardAccount,
  getOrCreateCreditCardPaymentsGroup,
  listPaymentCategoriesForAccount,
  archiveCreditCardPaymentCategoryForAccount,
  dedupePaymentCategoriesForAccount,
  ensureCreditCardPaymentCategoryForAccount,
  syncCreditCardPaymentCategoriesForUser,
  ensureAllCreditCardPaymentCategoriesForUser,
  resolvePaymentCategoryFromList,
};
