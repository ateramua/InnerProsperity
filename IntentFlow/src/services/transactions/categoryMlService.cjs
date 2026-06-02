/**
 * ML category recommendations — trains on user history, suggests for new transactions.
 */

const { getDatabase } = require('../../db/database.cjs');
const {
  buildFeatureTokens,
  train,
  predict,
  serializeModel,
  deserializeModel,
} = require('./categoryMlModel.cjs');

const MIN_TRAINING_SAMPLES = 12;
const MIN_SUGGESTION_CONFIDENCE = 0.38;
const MIN_AUTO_APPLY_CONFIDENCE = 0.9;
const RETRAIN_MIN_NEW_SAMPLES = 5;

/** @type {Map<string, { model: object, loadedAt: number }>} */
const memoryCache = new Map();

/** @type {Map<string, ReturnType<typeof setTimeout>>} */
const retrainTimers = new Map();

function cacheKey(userId) {
  return String(userId);
}

class CategoryMlService {
  constructor(opts = {}) {
    this.minTrainingSamples = opts.minTrainingSamples ?? MIN_TRAINING_SAMPLES;
    this.minSuggestionConfidence = opts.minSuggestionConfidence ?? MIN_SUGGESTION_CONFIDENCE;
    this.minAutoApplyConfidence = opts.minAutoApplyConfidence ?? MIN_AUTO_APPLY_CONFIDENCE;
    this.retrainMinNewSamples = opts.retrainMinNewSamples ?? RETRAIN_MIN_NEW_SAMPLES;
  }

  async loadTrainingRows(db, userId) {
    return db.all(
      `
      SELECT
        t.payee, t.description, t.amount, t.plaid_category_key,
        t.category_id, a.type AS account_type
      FROM transactions t
      INNER JOIN accounts a ON CAST(a.id AS TEXT) = CAST(t.account_id AS TEXT)
      WHERE t.user_id = ?
        AND t.category_id IS NOT NULL AND t.category_id != ''
        AND IFNULL(t.is_transfer, 0) = 0
        AND IFNULL(t.is_split_parent, 0) = 0
        AND (t.is_deleted IS NULL OR t.is_deleted = 0)
      ORDER BY t.date DESC
      LIMIT 8000
    `,
      [userId]
    );
  }

  buildDocuments(rows) {
    const documents = [];
    const labels = [];
    for (const row of rows) {
      const categoryId = row.category_id;
      if (!categoryId) continue;
      const features = buildFeatureTokens({
        payee: row.payee || row.description,
        description: row.description,
        amount: row.amount,
        accountType: row.account_type,
        plaidCategoryKey: row.plaid_category_key,
      });
      if (!features.length) continue;
      documents.push(features);
      labels.push(String(categoryId));
    }
    return { documents, labels };
  }

  async trainModel(db, userId) {
    const rows = await this.loadTrainingRows(db, userId);
    const { documents, labels } = this.buildDocuments(rows);

    if (documents.length < this.minTrainingSamples) {
      return { trained: false, reason: 'insufficient_samples', sampleCount: documents.length };
    }

    const model = train(documents, labels);
    if (!model) {
      return { trained: false, reason: 'train_failed', sampleCount: documents.length };
    }

    const json = serializeModel(model);
    await db.run(
      `INSERT INTO category_ml_models (user_id, model_json, training_samples, trained_at, updated_at)
       VALUES (?, ?, ?, datetime('now'), datetime('now'))
       ON CONFLICT(user_id) DO UPDATE SET
         model_json = excluded.model_json,
         training_samples = excluded.training_samples,
         trained_at = datetime('now'),
         updated_at = datetime('now')`,
      [userId, json, model.trainingSamples]
    );

    memoryCache.set(cacheKey(userId), { model, loadedAt: Date.now() });

    return {
      trained: true,
      sampleCount: model.trainingSamples,
      categoryCount: model.categories.length,
    };
  }

  async getStoredModel(db, userId) {
    const cached = memoryCache.get(cacheKey(userId));
    if (cached?.model) return cached.model;

    const row = await db.get(
      `SELECT model_json, training_samples FROM category_ml_models WHERE user_id = ?`,
      [userId]
    );
    if (!row?.model_json) return null;

    const model = deserializeModel(row.model_json);
    if (model) {
      memoryCache.set(cacheKey(userId), { model, loadedAt: Date.now() });
    }
    return model;
  }

  async ensureModel(db, userId, { forceRetrain = false } = {}) {
    const row = await db.get(
      `SELECT training_samples, trained_at FROM category_ml_models WHERE user_id = ?`,
      [userId]
    );

    const currentRows = await db.get(
      `
      SELECT COUNT(*) AS cnt FROM transactions
      WHERE user_id = ? AND category_id IS NOT NULL AND category_id != ''
        AND IFNULL(is_transfer, 0) = 0
        AND (is_deleted IS NULL OR is_deleted = 0)
    `,
      [userId]
    );
    const histCount = Number(currentRows?.cnt) || 0;

    if (!row || forceRetrain || histCount - Number(row.training_samples || 0) >= this.retrainMinNewSamples) {
      const result = await this.trainModel(db, userId);
      if (!result.trained) return null;
    }

    return this.getStoredModel(db, userId);
  }

  /**
   * Predict category for transaction features.
   * @returns {{ categoryId: string, confidence: number, source: 'ml_recommendation', autoApply: boolean, alternatives?: object[] }|null}
   */
  async suggest(db, userId, features, opts = {}) {
    const model = opts.model ?? (await this.ensureModel(db, userId, opts));
    if (!model) return null;

    const tokens = buildFeatureTokens(features);
    if (!tokens.length) return null;

    const result = predict(model, tokens, { topK: opts.topK ?? 3 });
    if (!result || result.confidence < this.minSuggestionConfidence) return null;

    const autoApply =
      opts.allowAutoApply !== false && result.confidence >= this.minAutoApplyConfidence;

    return {
      categoryId: result.categoryId,
      confidence: result.confidence,
      source: 'ml_recommendation',
      autoApply,
      needsReview: !autoApply,
      alternatives: result.alternatives,
    };
  }

  async getModelStatus(db, userId) {
    const row = await db.get(
      `SELECT training_samples, trained_at, updated_at FROM category_ml_models WHERE user_id = ?`,
      [userId]
    );
    const hist = await db.get(
      `
      SELECT COUNT(*) AS cnt FROM transactions
      WHERE user_id = ? AND category_id IS NOT NULL AND category_id != ''
        AND IFNULL(is_transfer, 0) = 0 AND (is_deleted IS NULL OR is_deleted = 0)
    `,
      [userId]
    );
    return {
      trained: !!row,
      trainingSamples: Number(row?.training_samples) || 0,
      categorizedTransactions: Number(hist?.cnt) || 0,
      trainedAt: row?.trained_at || null,
      minSamplesRequired: this.minTrainingSamples,
      ready: Number(hist?.cnt) >= this.minTrainingSamples,
    };
  }

  invalidateCache(userId) {
    memoryCache.delete(cacheKey(userId));
  }

  /** Debounced retrain after user assigns categories (avoids N retrains on bulk edit). */
  onUserCategorized(db, userId, { debounceMs = 2500 } = {}) {
    this.invalidateCache(userId);
    const key = cacheKey(userId);
    if (retrainTimers.has(key)) clearTimeout(retrainTimers.get(key));
    return new Promise((resolve) => {
      const timer = setTimeout(async () => {
        retrainTimers.delete(key);
        try {
          const result = await this.ensureModel(db, userId);
          resolve(result);
        } catch (e) {
          resolve(null);
        }
      }, debounceMs);
      retrainTimers.set(key, timer);
    });
  }
}

const singleton = new CategoryMlService();

module.exports = {
  CategoryMlService,
  categoryMlService: singleton,
  MIN_TRAINING_SAMPLES,
  MIN_SUGGESTION_CONFIDENCE,
};
