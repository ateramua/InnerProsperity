/**
 * Multinomial Naive Bayes classifier for category recommendations (pure JS, no deps).
 */

const MODEL_VERSION = 1;
const DEFAULT_SMOOTHING = 1.0;

function tokenize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((t) => t.length > 1);
}

/**
 * Build feature tokens for one transaction.
 */
function buildFeatureTokens({
  payee = '',
  description = '',
  amount = 0,
  accountType = '',
  plaidCategoryKey = '',
}) {
  const tokens = [...tokenize(payee), ...tokenize(description)];
  const features = [...new Set(tokens)];

  const n = Number(amount) || 0;
  if (n > 0) features.push('@inflow');
  else if (n < 0) features.push('@outflow');

  const mag = Math.abs(n);
  if (mag < 25) features.push('@amt:tiny');
  else if (mag < 100) features.push('@amt:small');
  else if (mag < 500) features.push('@amt:medium');
  else features.push('@amt:large');

  if (accountType) features.push(`@acct:${String(accountType).toLowerCase()}`);

  if (plaidCategoryKey) {
    const key = String(plaidCategoryKey)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .slice(0, 48);
    if (key) features.push(`@plaid:${key}`);
  }

  return features;
}

function buildVocabulary(documents) {
  const vocab = Object.create(null);
  let idx = 0;
  for (const doc of documents) {
    for (const token of doc) {
      if (vocab[token] === undefined) {
        vocab[token] = idx++;
      }
    }
  }
  return vocab;
}

/**
 * @param {string[][]} documents - array of token arrays
 * @param {string[]} labels - category id per document
 * @param {{ smoothing?: number }} [opts]
 */
function train(documents, labels, opts = {}) {
  const smoothing = opts.smoothing ?? DEFAULT_SMOOTHING;
  if (!documents.length || documents.length !== labels.length) {
    return null;
  }

  const vocab = buildVocabulary(documents);
  const vocabSize = Object.keys(vocab).length;
  if (!vocabSize) return null;

  const categories = [...new Set(labels)];
  const classCounts = Object.create(null);
  const tokenCounts = Object.create(null);
  const classTokenTotals = Object.create(null);

  for (const cat of categories) {
    classCounts[cat] = 0;
    tokenCounts[cat] = Object.create(null);
    classTokenTotals[cat] = 0;
  }

  for (let i = 0; i < documents.length; i++) {
    const cat = labels[i];
    classCounts[cat] += 1;
    for (const token of documents[i]) {
      const ti = vocab[token];
      if (ti === undefined) continue;
      tokenCounts[cat][ti] = (tokenCounts[cat][ti] || 0) + 1;
      classTokenTotals[cat] += 1;
    }
  }

  const totalDocs = documents.length;
  const logPriors = Object.create(null);
  const logLikelihoods = Object.create(null);

  for (const cat of categories) {
    logPriors[cat] = Math.log(classCounts[cat] / totalDocs);
    logLikelihoods[cat] = Object.create(null);
    const denom = classTokenTotals[cat] + smoothing * vocabSize;
    for (let ti = 0; ti < vocabSize; ti++) {
      const count = tokenCounts[cat][ti] || 0;
      logLikelihoods[cat][ti] = Math.log((count + smoothing) / denom);
    }
  }

  return {
    version: MODEL_VERSION,
    vocab,
    categories,
    logPriors,
    logLikelihoods,
    smoothing,
    trainingSamples: totalDocs,
    trainedAt: new Date().toISOString(),
  };
}

function logSumExp(values) {
  const max = Math.max(...values);
  if (!Number.isFinite(max)) return -Infinity;
  const sum = values.reduce((s, v) => s + Math.exp(v - max), 0);
  return max + Math.log(sum);
}

/**
 * @returns {{ categoryId: string, confidence: number, scores: object }|null}
 */
function predict(model, featureTokens, { topK = 3 } = {}) {
  if (!model?.categories?.length || !featureTokens?.length) return null;

  const { vocab, categories, logPriors, logLikelihoods } = model;
  const logScores = Object.create(null);

  for (const cat of categories) {
    let score = logPriors[cat] || -Infinity;
    for (const token of featureTokens) {
      const ti = vocab[token];
      if (ti === undefined) continue;
      score += logLikelihoods[cat][ti] ?? 0;
    }
    logScores[cat] = score;
  }

  const logValues = categories.map((c) => logScores[c]);
  const logNormalizer = logSumExp(logValues);
  const probs = categories.map((cat) => ({
    categoryId: cat,
    confidence: Math.exp(logScores[cat] - logNormalizer),
  }));
  probs.sort((a, b) => b.confidence - a.confidence);

  const best = probs[0];
  if (!best || best.confidence <= 0) return null;

  return {
    categoryId: best.categoryId,
    confidence: best.confidence,
    alternatives: probs.slice(1, topK),
    scores: logScores,
  };
}

function serializeModel(model) {
  return JSON.stringify(model);
}

function deserializeModel(json) {
  if (!json) return null;
  try {
    const model = typeof json === 'string' ? JSON.parse(json) : json;
    if (model?.version !== MODEL_VERSION) return null;
    return model;
  } catch {
    return null;
  }
}

module.exports = {
  MODEL_VERSION,
  tokenize,
  buildFeatureTokens,
  train,
  predict,
  serializeModel,
  deserializeModel,
};
