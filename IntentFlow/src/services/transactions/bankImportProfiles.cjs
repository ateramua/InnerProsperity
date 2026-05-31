/**
 * CSV import profiles for supported financial institutions.
 * Detection is header-driven; existing generic parsing remains the fallback.
 */

function normKey(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ');
}

const SUPPORTED_BANKS = [
  {
    id: 'wells_fargo',
    name: 'Wells Fargo',
    fileNameHints: ['wells', 'wf'],
    headerSignals: [
      'date',
      'amount',
      'description',
      'wells fargo',
    ],
    headerAliases: {
      date: ['date', 'transaction date', 'posting date'],
      payee: ['description', 'transaction description', 'payee', 'merchant'],
      amount: ['amount', 'transaction amount'],
      memo: ['memo', 'notes', 'check number'],
    },
    notes:
      'Wells Fargo exports usually include Date, Amount, and Description. Amount is signed (negative = outflow).',
  },
  {
    id: 'pnc',
    name: 'PNC Bank',
    fileNameHints: ['pnc'],
    headerSignals: [
      'transaction date',
      'transaction description',
      'amount',
      'balance',
    ],
    headerAliases: {
      date: ['transaction date', 'date', 'posting date'],
      payee: ['transaction description', 'description', 'payee'],
      amount: ['amount', 'transaction amount'],
      memo: ['memo', 'reference number', 'check number'],
    },
    notes: 'PNC exports typically use Transaction Date, Transaction Description, and Amount.',
  },
  {
    id: 'capital_one',
    name: 'Capital One',
    fileNameHints: ['capital', 'capone'],
    headerSignals: ['transaction date', 'posted date', 'description', 'debit', 'credit'],
    headerAliases: {
      date: ['transaction date', 'posted date', 'date'],
      payee: ['description', 'transaction description', 'merchant'],
      outflow: ['debit', 'debit amount', 'withdrawal'],
      inflow: ['credit', 'credit amount', 'deposit'],
      amount: ['amount'],
      category: ['category', 'transaction category', 'type'],
      memo: ['memo', 'notes'],
    },
    notes:
      'Capital One often provides separate Debit and Credit columns instead of a single signed Amount.',
  },
  {
    id: 'navy_federal',
    name: 'Navy Federal Credit Union',
    fileNameHints: ['navy', 'navycheck', 'nfcu'],
    headerSignals: [
      'credit debit indicator',
      'description',
      'amount',
      'date',
    ],
    headerAliases: {
      date: ['date', 'posting date', 'transaction date'],
      payee: ['description', 'payee', 'original description'],
      amount: ['amount', 'transaction amount'],
      direction: ['credit debit indicator', 'debit credit indicator'],
      memo: ['type', 'memo', 'transaction type', 'check number'],
    },
    notes:
      'Navy Federal Amount is usually positive — map Credit Debit Indicator so debits import as outflows.',
  },
  {
    id: 'american_express',
    name: 'American Express',
    fileNameHints: ['amex', 'american express', 'americanexpress'],
    headerSignals: ['date', 'description', 'amount', 'category', 'card member'],
    headerAliases: {
      date: ['date', 'transaction date', 'post date', 'posted date'],
      payee: ['description', 'payee', 'merchant', 'extended details'],
      amount: ['amount', 'transaction amount'],
      category: ['category', 'merchant category'],
      memo: ['reference', 'receipt', 'memo', 'appears on your statement as'],
    },
    notes:
      'American Express card CSVs use signed Amount (negative charges). Category column can be mapped for budget assignment.',
  },
  {
    id: 'bank_of_america',
    name: 'Bank of America',
    fileNameHints: ['bofa', 'bank of america', 'bankofamerica'],
    headerSignals: ['posted date', 'payee', 'amount', 'reference number', 'running bal'],
    headerAliases: {
      date: ['posted date', 'date', 'transaction date', 'posting date'],
      payee: ['payee', 'description', 'transaction description', 'title'],
      amount: ['amount', 'transaction amount'],
      memo: ['reference number', 'address', 'memo', 'check number'],
    },
    notes:
      'Bank of America checking exports use Posted Date, Payee, and a signed Amount column.',
  },
];

function mergeHeaderAliases(baseAliases, profileAliases) {
  const merged = {};
  for (const field of new Set([
    ...Object.keys(baseAliases || {}),
    ...Object.keys(profileAliases || {}),
  ])) {
    const base = baseAliases?.[field] || [];
    const extra = profileAliases?.[field] || [];
    merged[field] = [...new Set([...extra, ...base].map(normKey))].map((k) => k);
  }
  return merged;
}

function resolveHeaderMapWithAliases(headers, aliasMap) {
  const map = {};
  const cells = headers.map((h) => normKey(h));
  for (const [field, aliases] of Object.entries(aliasMap)) {
    const normalizedAliases = aliases.map(normKey);
    const idx = cells.findIndex((cell) => normalizedAliases.includes(cell));
    if (idx >= 0 && map[field] === undefined) map[field] = idx;
  }
  return map;
}

/**
 * @param {string[]} headers
 * @param {string} [fileName]
 * @returns {{ profile: object|null, score: number }}
 */
function detectBankImportProfile(headers, fileName = '') {
  const cells = (headers || []).map(normKey);
  const fileKey = normKey(fileName);
  let best = null;
  let bestScore = 0;

  for (const profile of SUPPORTED_BANKS) {
    let score = 0;
    for (const signal of profile.headerSignals || []) {
      if (cells.includes(normKey(signal))) score += 2;
    }
    for (const hint of profile.fileNameHints || []) {
      if (fileKey.includes(normKey(hint))) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      best = profile;
    }
  }

  if (!best || bestScore < 2) {
    return { profile: null, score: 0 };
  }
  return { profile: best, score: bestScore };
}

function buildSuggestedMappingFromHeaders(headers, headerMap, profile = null) {
  const pick = (field) => {
    const idx = headerMap[field];
    return idx === undefined ? '' : headers[idx] || '';
  };

  const mapping = {
    date: pick('date') || headers[0] || '',
    payee:
      pick('payee') ||
      headers.find((h) => normKey(h).includes('description')) ||
      headers.find((h) => normKey(h).includes('payee')) ||
      '',
    amount: pick('amount') || '',
    direction: pick('direction') || '',
    outflow: pick('outflow') || '',
    inflow: pick('inflow') || '',
    category: pick('category') || '',
    memo: pick('memo') || '',
  };

  if (profile?.id === 'capital_one' && !mapping.amount && (mapping.outflow || mapping.inflow)) {
    mapping.amount = '';
  }

  if (profile?.id === 'navy_federal' && !mapping.direction) {
    const dirHeader = headers.find((h) => normKey(h).includes('credit debit indicator'));
    if (dirHeader) mapping.direction = dirHeader;
  }

  return mapping;
}

function formatPreviewTransactions(normalized, categories) {
  return (normalized || []).map((row) => ({
    id: `import-line-${row.lineNumber}`,
    lineNumber: row.lineNumber,
    date: row.date,
    payee: row.payee,
    description: row.description,
    amount: row.amount,
    category_id: row.categoryId,
    categoryName:
      categories?.find((c) => String(c.id) === String(row.categoryId))?.name ||
      (row.bankCategory && !row.categoryId ? row.bankCategory : null),
    bankCategory: row.bankCategory,
    memo: row.memo,
    cleared: row.cleared,
  }));
}

module.exports = {
  SUPPORTED_BANKS,
  normKey,
  mergeHeaderAliases,
  resolveHeaderMapWithAliases,
  detectBankImportProfile,
  buildSuggestedMappingFromHeaders,
  formatPreviewTransactions,
};
