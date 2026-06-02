/**
 * Transaction categorization & budget mapping engine (FR-1–FR-13).
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../../db/database.cjs');
const {
  normalizeMerchantKey,
  normalizePayeeDisplayName,
} = require('./payeeNormalization.cjs');
const { CategoryRuleService } = require('./categoryRuleService.cjs');
const { categoryMlService } = require('./categoryMlService.cjs');
const { computeReserveDelta, getCategoryMonthEnvelope } = require('./creditCardReserveUtils.cjs');
const {
  isReadyToAssignSentinel,
  isIncomeTransaction,
  validateReadyToAssignSelection,
  learnRuleCategoryId,
} = require('../../shared/readyToAssignCategory.cjs');

const ruleService = new CategoryRuleService();
const { PAYEE_CATEGORY_MODES, getPayeeCategoryMode } = require('./payeeCategoryMode.cjs');

const CHANGE_SOURCES = Object.freeze({
  USER: 'user_action',
  AUTO_RULE: 'auto_rule',
  ML: 'ml_recommendation',
  IMPORT: 'import_process',
  BULK: 'user_action',
});

function emptyToNull(id) {
  if (id === '' || isReadyToAssignSentinel(id)) return null;
  return id ?? null;
}

function mappingStatusFor(tx) {
  if (tx.is_transfer === 1) return 'transfer';
  if (tx.category_id) return 'categorized';
  if (tx.suggested_category_id) return 'needs_review';
  return 'uncategorized';
}

class TransactionCategorizationService {
  /**
   * Resolve or create payee from raw merchant text (FR-2).
   */
  async resolvePayee(db, userId, rawMerchant, { importSource } = {}) {
    const raw = String(rawMerchant || '').trim();
    const displayName = normalizePayeeDisplayName(raw || 'Unknown');
    const normKey = normalizeMerchantKey(displayName);

    let existing = await db.get(
      `SELECT id, name FROM payees
       WHERE user_id = ? AND is_transfer_payee = 0 AND normalized_name = ?`,
      [userId, normKey]
    );

    if (!existing && raw) {
      existing = await db.get(
        `SELECT id, name FROM payees
         WHERE user_id = ? AND is_transfer_payee = 0 AND name = ?`,
        [userId, displayName]
      );
    }

    if (existing) {
      await db.run(
        `UPDATE payees SET usage_count = usage_count + 1, last_used_date = unixepoch(),
         normalized_name = COALESCE(normalized_name, ?)
         WHERE id = ?`,
        [normKey, existing.id]
      );
      return { payeeId: existing.id, displayName: existing.name || displayName, normKey };
    }

    const payeeId = uuidv4();
    await db.run(
      `INSERT INTO payees (id, name, normalized_name, user_id, is_transfer_payee, usage_count, last_used_date, created_at)
       VALUES (?, ?, ?, ?, 0, 1, unixepoch(), unixepoch())`,
      [payeeId, displayName, normKey, userId]
    );
    return { payeeId, displayName, normKey };
  }

  /**
   * Resolve category from rules then ML (FR-3).
   * @returns {{ categoryId: string|null, suggestedCategoryId: string|null, suggestedSource: string|null, suggestedConfidence: number|null, changeSource: string|null, mappingStatus: string }}
   */
  async resolveCategorySuggestions(db, userId, {
    payeeId,
    payeeDisplayName,
    plaidCategoryId = null,
    transactionRow = null,
  }) {
    let categoryId = emptyToNull(plaidCategoryId);
    let suggestedCategoryId = null;
    let suggestedSource = null;
    let suggestedConfidence = null;
    let mappingStatus = categoryId ? 'categorized' : 'uncategorized';
    let changeSource = null;

    if (!categoryId && payeeId) {
      const mode = await getPayeeCategoryMode(db, userId);
      const ruleSuggestion = await ruleService.suggestCategory(userId, payeeId, db);
      if (
        mode === PAYEE_CATEGORY_MODES.ASSIGN &&
        ruleSuggestion?.source === 'auto_rule'
      ) {
        categoryId = ruleSuggestion.categoryId;
        mappingStatus = 'categorized';
        changeSource = CHANGE_SOURCES.AUTO_RULE;
      } else if (ruleSuggestion?.categoryId) {
        suggestedCategoryId = ruleSuggestion.categoryId;
        suggestedSource = 'rule';
        suggestedConfidence = ruleSuggestion.confidence ?? null;
        mappingStatus = 'needs_review';
      }
    }

    if (!categoryId && !suggestedCategoryId && transactionRow) {
      const mlSuggestion = await categoryMlService.suggest(db, userId, {
        payee: payeeDisplayName || transactionRow.payee,
        description: transactionRow.description || transactionRow.raw_description,
        amount: transactionRow.amount,
        accountType: transactionRow.account_type,
        plaidCategoryKey: transactionRow.plaid_category_key,
      });
      if (mlSuggestion?.categoryId) {
        if (mlSuggestion.autoApply) {
          categoryId = mlSuggestion.categoryId;
          mappingStatus = 'categorized';
          changeSource = CHANGE_SOURCES.ML;
        } else {
          suggestedCategoryId = mlSuggestion.categoryId;
          suggestedSource = 'ml';
          suggestedConfidence = mlSuggestion.confidence;
          mappingStatus = 'needs_review';
        }
      }
    }

    return {
      categoryId,
      suggestedCategoryId,
      suggestedSource,
      suggestedConfidence,
      changeSource,
      mappingStatus,
    };
  }

  async writeAudit(db, { userId, transactionId, previousCategoryId, newCategoryId, source }) {
    await db.run(
      `INSERT INTO transaction_category_audit
       (user_id, transaction_id, previous_category_id, new_category_id, change_source)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, transactionId, previousCategoryId ?? null, newCategoryId ?? null, source]
    );
  }

  /**
   * Pipeline after import: normalize payee, suggest/auto category (FR-3, FR-10).
   */
  async processImportedTransaction(db, userId, transactionId, {
    merchantName,
    description,
    importSource = 'import',
    plaidCategoryId = null,
    isTransfer = false,
  }) {
    if (isTransfer) {
      await db.run(
        `UPDATE transactions SET mapping_status = 'transfer', import_source = ?
         WHERE id = ? AND user_id = ?`,
        [importSource, transactionId, userId]
      );
      return { categoryId: null, mappingStatus: 'transfer' };
    }

    const raw = merchantName || description || '';
    const { payeeId, displayName } = await this.resolvePayee(db, userId, raw, { importSource });

    const transactionRow = await db.get(
      `SELECT t.amount, t.description, t.raw_description, t.plaid_category_key, a.type AS account_type
       FROM transactions t
       JOIN accounts a ON CAST(a.id AS TEXT) = CAST(t.account_id AS TEXT)
       WHERE t.id = ? AND t.user_id = ?`,
      [transactionId, userId]
    );

    const resolved = await this.resolveCategorySuggestions(db, userId, {
      payeeId,
      payeeDisplayName: displayName,
      plaidCategoryId,
      transactionRow,
    });

    let { categoryId, suggestedCategoryId, mappingStatus, changeSource } = resolved;
    const { suggestedSource, suggestedConfidence } = resolved;
    const auditSource = changeSource;

    if (!changeSource) {
      changeSource = CHANGE_SOURCES.IMPORT;
      auditSource = categoryId ? CHANGE_SOURCES.IMPORT : null;
    }

    await db.run(
      `UPDATE transactions SET
        payee_id = ?, payee = ?, raw_description = COALESCE(raw_description, description),
        import_source = ?, suggested_category_id = ?,
        suggested_category_source = ?, suggested_category_confidence = ?,
        mapping_status = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [
        payeeId,
        displayName,
        importSource,
        suggestedCategoryId,
        suggestedCategoryId ? suggestedSource : null,
        suggestedConfidence,
        mappingStatus,
        transactionId,
        userId,
      ]
    );

    let creditReserveDelta = 0;
    if (categoryId) {
      const assignSource =
        importSource === 'manual'
          ? CHANGE_SOURCES.USER
          : changeSource || CHANGE_SOURCES.IMPORT;
      const learnRule =
        importSource === 'manual' ||
        changeSource === CHANGE_SOURCES.AUTO_RULE ||
        changeSource === CHANGE_SOURCES.ML;
      const assignResult = await this.assignCategory(db, userId, transactionId, categoryId, {
        source: assignSource,
        learnRule,
        applyCreditReserve: true,
      });
      creditReserveDelta = assignResult.creditReserveDelta || 0;
    }

    return {
      payeeId,
      categoryId,
      suggestedCategoryId,
      suggestedSource,
      suggestedConfidence,
      mappingStatus,
      creditReserveDelta,
    };
  }

  /**
   * Assign or change category with audit, learning, CC reserve (FR-4–FR-6, FR-12).
   * @returns {{ creditReserveDelta: number, dates: string[], accountId: string }}
   */
  async assignCategory(db, userId, transactionId, categoryId, {
    source = CHANGE_SOURCES.USER,
    learnRule = true,
    applyCreditReserve,
  } = {}) {
    const tx = await db.get(
      `SELECT t.*, a.type AS account_type
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE t.id = ? AND t.user_id = ?`,
      [transactionId, userId]
    );
    if (!tx) throw new Error('Transaction not found');
    if (tx.is_transfer === 1) {
      throw new Error('Transfers cannot be categorized');
    }

    if (isReadyToAssignSentinel(categoryId)) {
      const check = validateReadyToAssignSelection(categoryId, {
        isIncome: isIncomeTransaction(tx),
        isTransfer: tx.is_transfer === 1,
      });
      if (!check.ok) throw new Error(check.message);
    }

    const newCategoryId = emptyToNull(categoryId);
    const oldCategoryId = tx.category_id ?? null;

    if (String(oldCategoryId) === String(newCategoryId)) {
      return { creditReserveDelta: 0, dates: [tx.date], accountId: tx.account_id, changed: false };
    }

    let creditReserveDelta = 0;
    let nextReserved = 0;

    if (applyCreditReserve && tx.account_type === 'credit') {
      const prevReserved = Number(tx.cc_payment_reserved) || 0;
      if (newCategoryId && Number(tx.amount) < 0) {
        const spend = Math.abs(Number(tx.amount));
        const env = await getCategoryMonthEnvelope(db, userId, newCategoryId, tx.date);
        nextReserved = Math.min(spend, Math.max(0, env.available));
      } else if (newCategoryId && Number(tx.amount) > 0) {
        nextReserved = 0;
        creditReserveDelta = computeReserveDelta({
          accountType: tx.account_type,
          amount: Number(tx.amount),
          categoryId: newCategoryId,
          envelopeAvailable: 0,
          previousReserved: prevReserved,
        });
      }
      if (Number(tx.amount) < 0 || !newCategoryId) {
        creditReserveDelta = nextReserved - prevReserved;
        if (!newCategoryId) {
          nextReserved = 0;
          creditReserveDelta = -prevReserved;
        }
      }
    }

    const mappingStatus = newCategoryId ? 'categorized' : 'uncategorized';

    await db.run(
      `UPDATE transactions SET
        category_id = ?, suggested_category_id = NULL,
        suggested_category_source = NULL, suggested_category_confidence = NULL,
        mapping_status = ?, cc_payment_reserved = ?, updated_at = datetime('now')
       WHERE id = ? AND user_id = ?`,
      [newCategoryId, mappingStatus, nextReserved, transactionId, userId]
    );

    await this.writeAudit(db, {
      userId,
      transactionId,
      previousCategoryId: oldCategoryId,
      newCategoryId,
      source,
    });

    const ruleSource =
      source === CHANGE_SOURCES.BULK ? 'bulk_action' : 'user_action';
    const learnCategoryId = learnRuleCategoryId(newCategoryId, tx, categoryId);
    if (learnRule && learnCategoryId && tx.payee_id) {
      await ruleService.recordCategorization(userId, tx.payee_id, learnCategoryId, {
        source: ruleSource,
        db,
      });
    } else if (learnRule && learnCategoryId && tx.payee) {
      const { payeeId } = await this.resolvePayee(db, userId, tx.payee);
      await db.run(`UPDATE transactions SET payee_id = ? WHERE id = ?`, [payeeId, transactionId]);
      await ruleService.recordCategorization(userId, payeeId, learnCategoryId, {
        source: ruleSource,
        db,
      });
    }

    if (learnRule && newCategoryId) {
      try {
        await categoryMlService.onUserCategorized(db, userId);
      } catch (mlErr) {
        console.warn('ML model refresh after categorization:', mlErr?.message || mlErr);
      }
    }

    return {
      creditReserveDelta,
      dates: [tx.date],
      accountId: tx.account_id,
      changed: true,
      oldCategoryId,
      newCategoryId,
    };
  }

  /**
   * Split transaction across categories (FR-8).
   */
  async setTransactionSplits(db, userId, transactionId, splits, { source = CHANGE_SOURCES.USER } = {}) {
    const tx = await db.get(
      `SELECT * FROM transactions WHERE id = ? AND user_id = ?`,
      [transactionId, userId]
    );
    if (!tx || tx.is_transfer === 1) throw new Error('Invalid transaction for split');

    const totalAmount = Math.abs(Number(tx.amount));
    const splitSum = splits.reduce((s, line) => s + Math.abs(Number(line.amount) || 0), 0);
    if (Math.abs(splitSum - totalAmount) > 0.01) {
      throw new Error('Split amounts must equal transaction amount');
    }

    await db.run(`DELETE FROM transaction_splits WHERE transaction_id = ?`, [transactionId]);

    let order = 0;
    for (const line of splits) {
      await db.run(
        `INSERT INTO transaction_splits (id, transaction_id, user_id, category_id, amount, sort_order)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [uuidv4(), transactionId, userId, line.categoryId, Math.abs(Number(line.amount)), order++]
      );
    }

    await db.run(
      `UPDATE transactions SET is_split_parent = 1, category_id = NULL, mapping_status = 'categorized',
       suggested_category_id = NULL, updated_at = datetime('now')
       WHERE id = ?`,
      [transactionId]
    );

    await this.writeAudit(db, {
      userId,
      transactionId,
      previousCategoryId: tx.category_id,
      newCategoryId: null,
      source: `${source}:split`,
    });

    return { transactionId, splitCount: splits.length };
  }

  async getTransactionSplits(db, userId, transactionId) {
    const tx = await db.get(
      `SELECT id, amount, is_split_parent FROM transactions WHERE id = ? AND user_id = ?`,
      [transactionId, userId]
    );
    if (!tx) return { transaction: null, splits: [] };

    const splits = await db.all(
      `SELECT id, category_id, amount, sort_order
       FROM transaction_splits
       WHERE transaction_id = ? AND user_id = ?
       ORDER BY sort_order ASC, created_at ASC`,
      [transactionId, userId]
    );
    return { transaction: tx, splits: splits || [] };
  }

  /**
   * Remove splits and restore single-category mode.
   */
  async clearTransactionSplits(db, userId, transactionId, { categoryId = null } = {}) {
    const tx = await db.get(
      `SELECT * FROM transactions WHERE id = ? AND user_id = ?`,
      [transactionId, userId]
    );
    if (!tx) throw new Error('Transaction not found');

    await db.run(`DELETE FROM transaction_splits WHERE transaction_id = ?`, [transactionId]);
    await db.run(
      `UPDATE transactions SET is_split_parent = 0, category_id = ?, mapping_status = ?,
       updated_at = datetime('now')
       WHERE id = ?`,
      [
        categoryId,
        categoryId ? 'categorized' : 'uncategorized',
        transactionId,
      ]
    );
    return { transactionId, cleared: true };
  }

  /**
   * On-demand ML suggestion for a single transaction (UI / preview).
   */
  async getMlSuggestionForTransaction(db, userId, transactionId) {
    const tx = await db.get(
      `SELECT t.*, a.type AS account_type
       FROM transactions t
       JOIN accounts a ON CAST(a.id AS TEXT) = CAST(t.account_id AS TEXT)
       WHERE t.id = ? AND t.user_id = ?`,
      [transactionId, userId]
    );
    if (!tx || tx.is_transfer === 1) return null;

    const status = await categoryMlService.getModelStatus(db, userId);
    const suggestion = await categoryMlService.suggest(db, userId, {
      payee: tx.payee || tx.description,
      description: tx.description || tx.raw_description,
      amount: tx.amount,
      accountType: tx.account_type,
      plaidCategoryKey: tx.plaid_category_key,
    });

    return { status, suggestion };
  }

  async retrainMlModel(db, userId) {
    categoryMlService.invalidateCache(userId);
    return categoryMlService.trainModel(db, userId);
  }

  /**
   * Uncategorized dashboard stats (FR-11).
   */
  async getUncategorizedSummary(userId) {
    const db = await getDatabase();
    const row = await db.get(
      `SELECT
         COUNT(*) AS count,
         COALESCE(SUM(ABS(amount)), 0) AS total_amount
       FROM transactions t
       JOIN accounts a ON t.account_id = a.id
       WHERE t.user_id = ?
         AND (t.is_deleted IS NULL OR t.is_deleted = 0)
         AND (t.is_transfer IS NULL OR t.is_transfer = 0)
         AND (t.category_id IS NULL OR t.category_id = '')
         AND (t.is_split_parent IS NULL OR t.is_split_parent = 0)
         AND (a.is_active IS NULL OR a.is_active != 0)`,
      [userId]
    );

    const needsReview = await db.get(
      `SELECT COUNT(*) AS count FROM transactions
       WHERE user_id = ? AND mapping_status = 'needs_review'
         AND (is_deleted IS NULL OR is_deleted = 0)`,
      [userId]
    );

    return {
      uncategorizedCount: Number(row?.count) || 0,
      uncategorizedTotalAmount: Number(row?.total_amount) || 0,
      needsReviewCount: Number(needsReview?.count) || 0,
    };
  }

  /**
   * Bulk categorize (FR-9).
   */
  async bulkAssignCategory(db, userId, transactionIds, categoryId, options = {}) {
    const results = [];
    let creditReserveTotal = 0;
    const dates = new Set();
    const accountIds = new Set();

    for (const id of transactionIds) {
      try {
        const r = await this.assignCategory(db, userId, id, categoryId, {
          source: CHANGE_SOURCES.BULK,
          ...options,
        });
        results.push({ id, success: true, ...r });
        creditReserveTotal += r.creditReserveDelta || 0;
        if (r.date) dates.add(r.date);
        if (r.dates) r.dates.forEach((d) => dates.add(d));
        if (r.accountId) accountIds.add(r.accountId);
      } catch (e) {
        results.push({ id, success: false, error: e.message });
      }
    }

    return {
      results,
      creditReserveTotal,
      dates: [...dates],
      accountIds: [...accountIds],
    };
  }
}

const singleton = new TransactionCategorizationService();

module.exports = {
  TransactionCategorizationService,
  transactionCategorizationService: singleton,
  CHANGE_SOURCES,
  mappingStatusFor,
  categoryMlService,
  PAYEE_CATEGORY_MODES,
  getPayeeCategoryMode,
};
