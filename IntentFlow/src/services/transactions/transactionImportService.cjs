/**
 * Parse and import bank CSV exports into account transactions.
 */
const fs = require('fs');
const path = require('path');
const TransactionService = require('./transactionService.cjs');
const { runPostTransactionEffects } = require('./transactionLifecycle.cjs');
const readyToAssignPoolService = require('../budget/readyToAssignPoolService.cjs');
const {
  transactionCategorizationService,
} = require('./transactionCategorizationService.cjs');
const { applyCreditCardPaymentReserveDelta } = require('./creditCardReserveUtils.cjs');
const { pairTransfersForUser } = require('./plaidTransferPairing.cjs');
const { classifyTransactionPair } = require('../accounts/transactionDedup.cjs');
const bankProfiles = require('./bankImportProfiles.cjs');

const TX_HEADER_ALIASES = {
  date: [
    'date',
    'posting date',
    'transaction date',
    'posted date',
    'post date',
  ],
  payee: [
    'payee',
    'description',
    'name',
    'merchant',
    'original description',
    'transaction description',
    'title',
  ],
  amount: ['amount', 'transaction amount', 'value', 'usd'],
  /** Debit/Credit column when Amount is always positive (e.g. Navy Federal exports). */
  direction: [
    'credit debit indicator',
    'debit credit indicator',
    'credit/debit',
    'dr cr',
    'dr/cr',
    'type indicator',
  ],
  outflow: ['outflow', 'debit amount', 'withdrawal', 'payment amount'],
  inflow: ['inflow', 'credit amount', 'deposit amount'],
  memo: ['memo', 'notes', 'note', 'transaction type'],
  category: [
    'category',
    'budget category',
    'ynab category',
    'type group',
    'transaction category',
    'spending category',
    'merchant category',
    'personal finance category',
  ],
};

function normKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function parseCsvLine(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function resolveHeaderMap(headers, detectedProfile = null) {
  const aliasMap = detectedProfile
    ? bankProfiles.mergeHeaderAliases(TX_HEADER_ALIASES, detectedProfile.headerAliases)
    : TX_HEADER_ALIASES;
  return bankProfiles.resolveHeaderMapWithAliases(headers, aliasMap);
}

function parseCsvContent(content, fileName = '') {
  const text = String(content || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], headerMap: {}, rows: [], detectedProfile: null };
  }
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const { profile: detectedProfile } = bankProfiles.detectBankImportProfile(headers, fileName);
  const headerMap = resolveHeaderMap(headers, detectedProfile);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const raw = {};
    headers.forEach((header, idx) => {
      raw[header] = String(cells[idx] ?? '').trim();
    });
    rows.push({ raw, lineNumber: i + 1 });
  }
  return { headers, headerMap, rows, detectedProfile };
}

function readImportFile(filePath) {
  try {
    const ext = path.extname(filePath || '').toLowerCase();
    if (ext !== '.csv' && ext !== '.txt') {
      return {
        ok: false,
        error: 'Only CSV files are supported for transaction import right now.',
      };
    }
    const content = fs.readFileSync(filePath, 'utf8');
    return { ok: true, content, format: 'csv', fileName: path.basename(filePath) };
  } catch (error) {
    return {
      ok: false,
      error: error?.message || 'Could not read import file',
    };
  }
}

function parseDate(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mdy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (mdy) {
    let y = parseInt(mdy[3], 10);
    if (y < 100) y += 2000;
    const mm = String(mdy[1]).padStart(2, '0');
    const dd = String(mdy[2]).padStart(2, '0');
    return `${y}-${mm}-${dd}`;
  }
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function parseMoney(value) {
  if (value === undefined || value === null || value === '') return NaN;
  const cleaned = String(value).replace(/[$,\s]/g, '').replace(/[()]/g, (m) => (m === '(' ? '-' : ''));
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function isReadyToAssignCategory(key) {
  return (
    key === 'ready to assign' ||
    key.includes('inflow ready to assign') ||
    key === 'inflow: ready to assign'
  );
}

function resolveCategoryId(categoryName, categoriesByName, categoryMappings = null) {
  const key = normKey(categoryName);
  if (!key) return null;
  if (isReadyToAssignCategory(key)) return null;

  if (categoryMappings && Object.prototype.hasOwnProperty.call(categoryMappings, key)) {
    const mapped = categoryMappings[key];
    const { isReadyToAssignSentinel } = require('../../shared/readyToAssignCategory.cjs');
    if (mapped == null || mapped === '' || isReadyToAssignSentinel(mapped)) return null;
    return mapped;
  }

  return categoriesByName.get(key) ?? null;
}

function collectBankCategories(rawRows, headers, headerMap, customMap) {
  const counts = new Map();
  for (const row of rawRows) {
    const catVal = String(cellFromRow(row.raw, headers, headerMap, customMap, 'category') || '').trim();
    if (!catVal) continue;
    counts.set(catVal, (counts.get(catVal) || 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, count]) => ({ name, key: normKey(name), count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function buildSuggestedCategoryMappings(bankCategories, categoriesByName, savedMappings = {}) {
  const suggested = {};
  for (const item of bankCategories || []) {
    const { key } = item;
    if (!key) continue;
    if (savedMappings[key]) {
      suggested[key] = savedMappings[key];
    } else if (categoriesByName.has(key)) {
      suggested[key] = categoriesByName.get(key);
    }
  }
  return suggested;
}

function categoryNameForId(categoryId, categories) {
  if (!categoryId) return null;
  const cat = (categories || []).find((c) => String(c.id) === String(categoryId));
  return cat?.name ?? null;
}

/**
 * @returns {'debit'|'credit'|null}
 */
function parseDebitCreditDirection(value) {
  const k = normKey(value);
  if (!k) return null;
  if (
    k === 'debit' ||
    k === 'dr' ||
    k === 'withdrawal' ||
    k === 'withdrawal/debit' ||
    k.startsWith('debit ') ||
    k.includes(' ach debit') ||
    k === 'ach debit'
  ) {
    return 'debit';
  }
  if (
    k === 'credit' ||
    k === 'cr' ||
    k === 'deposit' ||
    k.startsWith('credit ') ||
    k.includes(' ach credit') ||
    k === 'ach credit'
  ) {
    return 'credit';
  }
  return null;
}

function signedAmountForAccount(rawAmount, accountType) {
  const isCreditOrLoan = accountType === 'credit' || accountType === 'loan';
  const amt = Math.abs(rawAmount);
  if (isCreditOrLoan) {
    return rawAmount < 0 ? -amt : amt;
  }
  return rawAmount < 0 ? -amt : amt;
}

function amountFromRow(raw, headers, headerMap, customMap) {
  const pick = (field) => cellFromRow(raw, headers, headerMap, customMap, field);

  const out = parseMoney(pick('outflow'));
  const inf = parseMoney(pick('inflow'));
  if (Number.isFinite(out) && out !== 0) return -Math.abs(out);
  if (Number.isFinite(inf) && inf !== 0) return Math.abs(inf);

  const amountMag = parseMoney(pick('amount'));
  if (!Number.isFinite(amountMag) || amountMag === 0) return NaN;

  const direction = parseDebitCreditDirection(pick('direction'));
  if (direction === 'debit') return -Math.abs(amountMag);
  if (direction === 'credit') return Math.abs(amountMag);

  // Amount column already signed (e.g. -45.67 outflow)
  return amountMag;
}

function cellFromRow(raw, headers, headerMap, customMap, field) {
  if (customMap?.[field]) return raw[customMap[field]] ?? '';
  const idx = headerMap[field];
  if (idx === undefined) return '';
  const headerName = headers[idx];
  return headerName ? raw[headerName] ?? '' : '';
}

/**
 * @param {object[]} rawRows from parseCsvContent
 * @param {string[]} headers
 * @param {object} headerMap
 * @param {object} customMap column name per field
 * @param {object} account { id, type }
 * @param {Map<string,string>} categoriesByName norm name -> id
 * @param {object|null} categoryMappings norm bank category -> IntentFlow category id
 */
function normalizeImportRows(
  rawRows,
  headers,
  headerMap,
  customMap,
  account,
  categoriesByName,
  categoryMappings = null
) {
  const normalized = [];
  const errors = [];

  for (const row of rawRows) {
    const { raw, lineNumber } = row;
    const date = parseDate(cellFromRow(raw, headers, headerMap, customMap, 'date'));
    const payeeRaw = cellFromRow(raw, headers, headerMap, customMap, 'payee');
    const payee = String(payeeRaw || 'Imported transaction').trim().slice(0, 500);
    const amountRaw = amountFromRow(raw, headers, headerMap, customMap);
    if (!date) {
      errors.push({ lineNumber, message: 'Missing or invalid date' });
      continue;
    }
    if (!Number.isFinite(amountRaw) || amountRaw === 0) {
      errors.push({ lineNumber, message: 'Missing or invalid amount' });
      continue;
    }
    const amount = signedAmountForAccount(amountRaw, account.type);
    let categoryId = null;
    const catVal = cellFromRow(raw, headers, headerMap, customMap, 'category');
    if (catVal) categoryId = resolveCategoryId(catVal, categoriesByName, categoryMappings);
    const memoVal = cellFromRow(raw, headers, headerMap, customMap, 'memo');
    const memo = memoVal ? String(memoVal).slice(0, 500) : 'Imported from file';

    normalized.push({
      lineNumber,
      date,
      payee,
      description: payee,
      amount,
      categoryId,
      bankCategory: catVal ? String(catVal).trim() : null,
      memo,
      cleared: 1,
    });
  }

  return { rows: normalized, errors };
}

function buildCategoryNameMap(categories) {
  const map = new Map();
  for (const c of categories || []) {
    if (!c?.id || !c?.name) continue;
    map.set(normKey(c.name), c.id);
  }
  return map;
}

function dedupeKey(date, amount, payee) {
  return `${date}|${amount}|${normKey(payee)}`;
}

function findUnclearedImportMatch(unclearedRows, row) {
  let probableMatch = null;
  for (const pending of unclearedRows) {
    const kind = classifyTransactionPair(pending, {
      date: row.date,
      amount: row.amount,
      payee: row.payee,
      description: row.description,
    });
    if (kind === 'exact') return pending;
    if (kind === 'probable') probableMatch = pending;
  }
  return probableMatch;
}

async function importTransactionsForAccount(db, dbPath, userId, accountId, normalizedRows, options = {}) {
  const account = await db.get(
    `SELECT id, type, user_id FROM accounts WHERE id = ? AND user_id = ?`,
    [accountId, userId]
  );
  if (!account) {
    return { success: false, error: 'Account not found' };
  }

  const categories = await db.all(
    `SELECT id, name FROM categories WHERE user_id = ?`,
    [userId]
  );
  const categoriesByName = buildCategoryNameMap(categories);

  const existing = await db.all(
    `SELECT date, amount, payee FROM transactions
     WHERE account_id = ? AND user_id = ?
       AND (is_deleted IS NULL OR is_deleted = 0)`,
    [accountId, userId]
  );
  const seen = new Set(
    (existing || []).map((t) => dedupeKey(t.date, Number(t.amount), t.payee || ''))
  );

  const unclearedPending = await db.all(
    `SELECT * FROM transactions
     WHERE account_id = ? AND user_id = ?
       AND IFNULL(is_deleted, 0) = 0
       AND IFNULL(is_cleared, 0) = 0`,
    [accountId, userId]
  );
  const matchedPendingIds = new Set();

  const txSvc = new TransactionService(dbPath);
  let imported = 0;
  let matched = 0;
  let skipped = 0;
  let failed = 0;
  const dates = [];
  const failures = [];

  for (const row of normalizedRows) {
    const key = dedupeKey(row.date, row.amount, row.payee);
    if (seen.has(key)) {
      skipped++;
      continue;
    }

    const pendingCandidates = unclearedPending.filter((t) => !matchedPendingIds.has(t.id));
    const pendingMatch = findUnclearedImportMatch(pendingCandidates, row);
    if (pendingMatch) {
      try {
        await db.run(
          `UPDATE transactions
           SET is_cleared = 1,
               payee = COALESCE(?, payee),
               memo = COALESCE(?, memo),
               updated_at = datetime('now')
           WHERE id = ? AND user_id = ?`,
          [row.payee || null, row.memo || null, pendingMatch.id, userId]
        );
        matchedPendingIds.add(pendingMatch.id);
        seen.add(key);
        matched++;
        dates.push(row.date);
        continue;
      } catch (err) {
        failed++;
        failures.push({
          lineNumber: row.lineNumber,
          message: err?.message || 'Match update failed',
        });
        continue;
      }
    }

    try {
      await txSvc.createTransaction({
        accountId,
        userId,
        date: row.date,
        description: row.description,
        amount: row.amount,
        categoryId: row.categoryId,
        payee: row.payee,
        memo: row.memo,
        isCleared: row.cleared ? 1 : 0,
      });
      const inserted = await db.get(
        `SELECT id FROM transactions
         WHERE account_id = ? AND user_id = ? AND date = ? AND amount = ? AND payee = ?
         ORDER BY created_at DESC LIMIT 1`,
        [accountId, userId, row.date, row.amount, row.payee]
      );
      if (inserted?.id) {
        const processed = await transactionCategorizationService.processImportedTransaction(
          db,
          userId,
          inserted.id,
          {
            merchantName: row.payee,
            description: row.description,
            importSource: 'csv',
            plaidCategoryId: row.categoryId,
            isTransfer: false,
          }
        );
        if (processed.creditReserveDelta) {
          await applyCreditCardPaymentReserveDelta(db, {
            userId,
            accountId,
            date: row.date,
            delta: processed.creditReserveDelta,
            userIntentAssignment: true,
          });
        }
        const poolTx = await db.get(
          'SELECT * FROM transactions WHERE id = ? AND user_id = ?',
          [inserted.id, userId]
        );
        if (poolTx) {
          await readyToAssignPoolService.syncPoolForTransaction(db, userId, poolTx, 'apply');
        }
      }
      seen.add(key);
      imported++;
      dates.push(row.date);
    } catch (err) {
      failed++;
      failures.push({
        lineNumber: row.lineNumber,
        message: err?.message || 'Insert failed',
      });
    }
  }

  if (imported > 0 || matched > 0) {
    try {
      await pairTransfersForUser(db, userId, { lookbackDays: 90 });
    } catch (e) {
      console.warn('import transfer pairing:', e?.message || e);
    }
    try {
      await runPostTransactionEffects(userId, {
        accountIds: [accountId],
        dates,
        skipLedgerSync: options.skipLedgerSync !== false,
      });
    } catch (e) {
      console.warn('import post-transaction effects:', e?.message || e);
    }
  }

  return {
    success: true,
    imported,
    matched,
    skipped,
    failed,
    failures,
    accountId,
  };
}

function previewImport(content, account, categories, customMap = null, categoryMappings = null, fileName = '') {
  const parsed = parseCsvContent(content, fileName);
  const categoriesByName = buildCategoryNameMap(categories);
  const { rows: normalized, errors: normErrors } = normalizeImportRows(
    parsed.rows,
    parsed.headers,
    parsed.headerMap,
    customMap,
    account,
    categoriesByName,
    categoryMappings
  );
  const bankCategories = collectBankCategories(
    parsed.rows,
    parsed.headers,
    parsed.headerMap,
    customMap
  );
  const autoSuggested = bankProfiles.buildSuggestedMappingFromHeaders(
    parsed.headers,
    parsed.headerMap,
    parsed.detectedProfile
  );
  const previewTransactions = bankProfiles.formatPreviewTransactions(normalized, categories);
  const previewWithCategories = previewTransactions.slice(0, 50);
  return {
    headers: parsed.headers,
    headerMap: parsed.headerMap,
    detectedProfile: parsed.detectedProfile
      ? {
          id: parsed.detectedProfile.id,
          name: parsed.detectedProfile.name,
          notes: parsed.detectedProfile.notes,
        }
      : null,
    suggestedMapping: autoSuggested,
    preview: previewWithCategories,
    previewTransactions,
    bankCategories,
    totalRows: parsed.rows.length,
    validCount: normalized.length,
    parseErrors: normErrors.slice(0, 20),
    normalized,
    balancePreview: normalized.reduce((sum, row) => sum + (Number(row.amount) || 0), 0),
    categories: (categories || []).map((c) => ({ id: c.id, name: c.name })),
  };
}

module.exports = {
  readImportFile,
  parseCsvContent,
  previewImport,
  normalizeImportRows,
  importTransactionsForAccount,
  buildCategoryNameMap,
  collectBankCategories,
  buildSuggestedCategoryMappings,
  resolveCategoryId,
  normKey,
  bankProfiles,
};
