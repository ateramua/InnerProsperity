/**
 * Payee → category rule learning and suggestions (FR-1–FR-10).
 */

const { v4: uuidv4 } = require('uuid');
const { getDatabase } = require('../../db/database.cjs');
const {
  PAYEE_CATEGORY_MODES,
  getPayeeCategoryMode,
} = require('./payeeCategoryMode.cjs');

const DEFAULT_CONFIRMATION_THRESHOLD = 3;

function sameId(a, b) {
  if (a == null && b == null) return true;
  return String(a) === String(b);
}

async function writeRuleAudit(db, userId, payeeId, previousCategoryId, newCategoryId, source) {
  try {
    await db.run(
      `INSERT INTO payee_category_rule_audit
       (user_id, payee_id, previous_category_id, new_category_id, change_source)
       VALUES (?, ?, ?, ?, ?)`,
      [userId, payeeId, previousCategoryId ?? null, newCategoryId ?? null, source]
    );
  } catch (e) {
    console.warn('payee_category_rule_audit:', e?.message || e);
  }
}

class CategoryRuleService {
  constructor(threshold = DEFAULT_CONFIRMATION_THRESHOLD) {
    this.threshold = threshold;
  }

  async getRuleForPayee(db, userId, payeeId) {
    return db.get(
      `SELECT * FROM category_rules WHERE user_id = ? AND payee_id = ?`,
      [userId, payeeId]
    );
  }

  /**
   * Suggest category from learned payee rule (FR-3, FR-4).
   * Default mode: always suggest (needs review), never silent auto-assign on import.
   */
  async suggestCategory(userId, payeeId, dbOptional = null) {
    if (!userId || !payeeId) return null;
    const db = dbOptional || (await getDatabase());
    const mode = await getPayeeCategoryMode(db, userId);
    const rule = await this.getRuleForPayee(db, userId, payeeId);
    if (!rule?.default_category_id) return null;

    const confidence = Math.min(
      1,
      Number(rule.confidence_score) ||
        Number(rule.confirmation_count || 0) / this.threshold
    );

    if (
      mode === PAYEE_CATEGORY_MODES.ASSIGN &&
      rule.auto_apply === 1
    ) {
      return {
        categoryId: rule.default_category_id,
        source: 'auto_rule',
        confidence: confidence || 1,
        needsReview: false,
      };
    }

    return {
      categoryId: rule.default_category_id,
      source: 'rule',
      confidence,
      needsReview: true,
    };
  }

  /**
   * Record user categorization; most recent category wins (FR-5, FR-6).
   * Promotes to auto_apply after threshold in assign mode (FR-4 Mode B).
   */
  async recordCategorization(userId, payeeId, categoryId, { source = 'user_action', db: dbOptional } = {}) {
    if (!userId || !payeeId || !categoryId) return null;

    const db = dbOptional || (await getDatabase());
    const mode = await getPayeeCategoryMode(db, userId);
    const existing = await this.getRuleForPayee(db, userId, payeeId);

    if (existing && sameId(existing.default_category_id, categoryId)) {
      const nextCount = Number(existing.confirmation_count || 0) + 1;
      const autoApply =
        mode === PAYEE_CATEGORY_MODES.ASSIGN && nextCount >= this.threshold
          ? 1
          : existing.auto_apply;
      const confidence = Math.min(1, nextCount / this.threshold);
      await db.run(
        `UPDATE category_rules
         SET confirmation_count = ?, confidence_score = ?, auto_apply = ?, updated_at = datetime('now')
         WHERE id = ?`,
        [nextCount, confidence, autoApply, existing.id]
      );
      return { ruleId: existing.id, confirmationCount: nextCount, autoApply: autoApply === 1 };
    }

    if (existing && !sameId(existing.default_category_id, categoryId)) {
      await writeRuleAudit(
        db,
        userId,
        payeeId,
        existing.default_category_id,
        categoryId,
        source
      );
      await db.run(
        `UPDATE category_rules
         SET default_category_id = ?, confirmation_count = 1, confidence_score = 0.33,
             auto_apply = 0, updated_at = datetime('now')
         WHERE id = ?`,
        [categoryId, existing.id]
      );
      return { ruleId: existing.id, confirmationCount: 1, autoApply: false, updated: true };
    }

    const id = uuidv4();
    await db.run(
      `INSERT INTO category_rules (
        id, user_id, payee_id, default_category_id, confirmation_count,
        confidence_score, auto_apply, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 1, 0.33, 0, datetime('now'), datetime('now'))`,
      [id, userId, payeeId, categoryId]
    );
    return { ruleId: id, confirmationCount: 1, autoApply: false, created: true };
  }
}

module.exports = {
  CategoryRuleService,
  DEFAULT_CONFIRMATION_THRESHOLD,
  writeRuleAudit,
};
