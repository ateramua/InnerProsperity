/**
 * Export / import Prosperity Map table rows (PropertyMapView columns).
 */

function loadXlsx() {
  try {
    return require('xlsx');
  } catch (e) {
    return null;
  }
}

const EXPORT_VERSION = 1;

const TABLE_HEADERS = [
  'Group',
  'Category',
  'Assigned',
  'Activity',
  'Available',
  'Progress',
  'Goal Target',
  'Goal Type',
  'Month',
];

const HEADER_ALIASES = {
  group: ['group', 'category group', 'category_group', 'categorygroup'],
  category: ['category', 'name', 'category name'],
  assigned: ['assigned', 'budgeted', 'budget', 'budgeted amount'],
  activity: ['activity', 'spent', 'spending'],
  available: ['available', 'balance'],
  progress: ['progress', 'percent', '%'],
  goalTarget: ['goal target', 'goal_target', 'target', 'target amount', 'target_amount', 'goaltarget'],
  goalType: ['goal type', 'goal_type', 'target type', 'target_type', 'goaltype'],
  month: ['month', 'budget month', 'month_key', 'monthkey', 'budget_month'],
};

function roundMoney(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

function normKey(s) {
  return String(s ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function parseMoney(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return roundMoney(value);
  let s = String(value).trim();
  if (!s) return null;
  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[$,\s]/g, '');
  if (s.startsWith('-')) {
    negative = true;
    s = s.slice(1);
  }
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return roundMoney(negative ? -n : n);
}

function parseProgress(value) {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).trim().replace(/%/g, '');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function normalizeGoalType(raw) {
  const t = normKey(raw);
  if (!t) return null;
  if (t === 'monthly' || t === 'monthly goal') return 'monthly';
  if (t === 'monthly_debt_payment' || t === 'debt' || t === 'monthly debt' || t === 'monthly debt payment') {
    return 'monthly_debt_payment';
  }
  return raw.trim();
}

function calculateExportProgress(category) {
  if (!category?.target_amount) return '';
  const currentAmount = Number(category.available) || 0;
  const target = Number(category.target_amount) || 0;
  if (target <= 0) return '';
  if (category.target_type === 'monthly' || category.target_type === 'monthly_debt_payment') {
    return String(Math.round((currentAmount / target) * 100));
  }
  return '';
}

function resolveHeaderMap(headerRow) {
  const map = {};
  const cells = headerRow.map((h) => normKey(h));
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = cells.findIndex((cell) => aliases.includes(cell));
    if (idx >= 0) map[field] = idx;
  }
  return map;
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

function parseCsv(content) {
  const text = String(content || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const headerMap = resolveHeaderMap(headers);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const get = (field) => {
      const idx = headerMap[field];
      return idx === undefined ? '' : String(cells[idx] ?? '').trim();
    };
    rows.push({
      group: get('group'),
      category: get('category'),
      assigned: get('assigned'),
      activity: get('activity'),
      available: get('available'),
      progress: get('progress'),
      goalTarget: get('goalTarget'),
      goalType: get('goalType'),
      month: get('month'),
      lineNumber: i + 1,
    });
  }
  return { headers, rows, headerMap };
}

function excelSerialToDate(value) {
  const serial = Number(value);
  if (!Number.isFinite(serial) || serial <= 0) return null;
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  if (Number.isNaN(dateInfo.getTime())) return null;
  const yyyy = dateInfo.getUTCFullYear();
  const mm = String(dateInfo.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dateInfo.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function normalizeMonthInput(value) {
  if (value === undefined || value === null || value === '') return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    return `${yyyy}-${mm}-01`;
  }
  if (typeof value === 'number') {
    const excelDate = excelSerialToDate(value);
    return excelDate ? `${excelDate.slice(0, 7)}-01` : String(value);
  }
  const s = String(value).trim();
  if (!s) return '';
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s);
    if (serial > 30000) {
      const excelDate = excelSerialToDate(serial);
      if (excelDate) return `${excelDate.slice(0, 7)}-01`;
    }
  }
  if (/^\d{4}-\d{2}$/.test(s)) return `${s}-01`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return `${s.slice(0, 7)}-01`;
  const mdy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mdy) {
    const mm = String(Number(mdy[1])).padStart(2, '0');
    const yyyy = mdy[3].length === 2 ? `20${mdy[3]}` : mdy[3];
    return `${yyyy}-${mm}-01`;
  }
  return s;
}

function cellToString(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return normalizeMonthInput(value);
  }
  return String(value).trim();
}

function isTemplateHeaderRow(cells) {
  const first = normKey(cells[0]);
  return first === 'group' || first === 'category group' || first === 'category';
}

/** Prefer Assigned; if blank/0 and Goal Target has amount, use Goal Target for Assigned. */
function normalizeImportRow(row) {
  const assigned = parseMoney(row.assigned);
  const goalTarget = parseMoney(row.goalTarget);
  let assignedRaw = row.assigned;
  const assignedBlank =
    row.assigned === undefined || row.assigned === null || String(row.assigned).trim() === '';
  if ((assignedBlank || assigned === 0) && goalTarget !== null && goalTarget > 0) {
    assignedRaw = String(goalTarget);
  }
  return {
    ...row,
    assigned: assignedRaw,
    month: normalizeMonthInput(row.month),
  };
}

function parseDelimited(content, delimiter) {
  const text = String(content || '').replace(/^\uFEFF/, '');
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const split = (line) => {
    if (delimiter === ',') return parseCsvLine(line);
    if (delimiter === '\t') return line.split('\t');
    return line.split(';');
  };
  const firstCells = split(lines[0]).map((h) => cellToString(h));
  let headerMap = resolveHeaderMap(firstCells);
  const hasHeader = isTemplateHeaderRow(firstCells) || Object.keys(headerMap).length >= 3;
  const rows = [];

  const mapFromCells = (cells, lineNumber) => {
    const getAt = (idx) => String(cells[idx] ?? '').trim();
    const get = (field, fallbackIndex) => {
      const idx = headerMap[field];
      return idx === undefined ? getAt(fallbackIndex) : getAt(idx);
    };
    return {
      group: get('group', 0),
      category: get('category', 1),
      assigned: get('assigned', 2),
      activity: get('activity', 3),
      available: get('available', 4),
      progress: get('progress', 5),
      goalTarget: get('goalTarget', 6),
      goalType: get('goalType', 7),
      month: normalizeMonthInput(get('month', 8)),
      lineNumber,
    };
  };

  if (!hasHeader) {
    headerMap = resolveHeaderMap(TABLE_HEADERS);
  }
  const startIdx = hasHeader ? 1 : 0;
  for (let i = startIdx; i < lines.length; i++) {
    const cells = split(lines[i]).map((c) => cellToString(c));
    if (!cells.some((c) => c.length > 0)) continue;
    rows.push(normalizeImportRow(mapFromCells(cells, i + 1)));
  }

  return { headers: hasHeader ? firstCells : TABLE_HEADERS, rows, headerMap };
}

function parseXlsxImport(content) {
  const XLSX = loadXlsx();
  if (!XLSX) {
    throw new Error('Excel import requires the xlsx package. Reinstall dependencies (npm install) and restart the app.');
  }
  const workbook = Buffer.isBuffer(content)
    ? XLSX.read(content, { type: 'buffer', cellDates: true })
    : XLSX.read(String(content || ''), { type: 'base64', cellDates: true });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  const rowsRaw = XLSX.utils.sheet_to_json(firstSheet, { header: 1, raw: false, defval: '' });
  if (!rowsRaw.length) return { headers: [], rows: [] };
  const lines = rowsRaw.map((row) =>
    (Array.isArray(row) ? row : []).map((v) => cellToString(v)).join('\t')
  );
  return parseDelimited(lines.join('\n'), '\t');
}

function escapeCsvCell(value) {
  const s = value === undefined || value === null ? '' : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildCsvFromRows(rows) {
  const lines = [TABLE_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(
      [
        row.group,
        row.category,
        row.assigned,
        row.activity,
        row.available,
        row.progress,
        row.goalTarget,
        row.goalType,
        row.month,
      ]
        .map(escapeCsvCell)
        .join(',')
    );
  }
  return lines.join('\n');
}

function buildExportRows(snapshot) {
  const monthKey = snapshot.monthKey;
  const categories = snapshot.categories || [];
  const byGroup = new Map();
  for (const cat of categories) {
    const groupName = cat.group_name || 'Uncategorized';
    if (!byGroup.has(groupName)) byGroup.set(groupName, []);
    byGroup.get(groupName).push(cat);
  }
  const groupNames = [...byGroup.keys()].sort((a, b) => a.localeCompare(b));
  const rows = [];
  for (const groupName of groupNames) {
    const cats = byGroup.get(groupName).sort((a, b) => String(a.name).localeCompare(String(b.name)));
    for (const cat of cats) {
      rows.push({
        group: groupName,
        category: cat.name || '',
        assigned: roundMoney(cat.assigned),
        activity: roundMoney(cat.activity),
        available: roundMoney(cat.available),
        progress: calculateExportProgress(cat),
        goalTarget: roundMoney(cat.target_amount),
        goalType: cat.target_type || 'monthly',
        month: monthKey,
        categoryId: cat.id,
      });
    }
  }
  return rows;
}

function buildExportPayload(snapshot) {
  const rows = buildExportRows(snapshot);
  return {
    version: EXPORT_VERSION,
    monthKey: snapshot.monthKey,
    exportedAt: new Date().toISOString(),
    headers: TABLE_HEADERS,
    rows,
  };
}

function parseJsonImport(content) {
  const parsed = JSON.parse(content);
  const rawRows = Array.isArray(parsed?.rows) ? parsed.rows : Array.isArray(parsed) ? parsed : [];
  const rows = rawRows.map((r, i) => ({
    group: r.group ?? r.group_name ?? r.Group ?? '',
    category: r.category ?? r.name ?? r.Category ?? '',
    assigned: r.assigned ?? r.Assigned ?? '',
    activity: r.activity ?? r.Activity ?? '',
    available: r.available ?? r.Available ?? '',
    progress: r.progress ?? r.Progress ?? '',
    goalTarget: r.goalTarget ?? r.goal_target ?? r.target_amount ?? r['Goal Target'] ?? '',
    goalType: r.goalType ?? r.goal_type ?? r.target_type ?? r['Goal Type'] ?? '',
    month: r.month ?? r.monthKey ?? r.month_key ?? r.Month ?? '',
    lineNumber: i + 2,
  }));
  return { headers: parsed?.headers || TABLE_HEADERS, rows };
}

function detectDelimiter(text) {
  const sample = String(text || '').split(/\r?\n/).slice(0, 5).join('\n');
  const tabs = (sample.match(/\t/g) || []).length;
  const commas = (sample.match(/,/g) || []).length;
  const semicolons = (sample.match(/;/g) || []).length;
  if (tabs > commas && tabs > semicolons) return '\t';
  if (semicolons > commas) return ';';
  return ',';
}

function parseImportContent(content, format, fileName) {
  const fmt = String(format || detectFormat(fileName, content)).toLowerCase();
  if (fmt === 'json') {
    const parsed = parseJsonImport(content);
    parsed.rows = parsed.rows.map(normalizeImportRow);
    return parsed;
  }
  if (fmt === 'xlsx' || fmt === 'xls') return parseXlsxImport(content);
  const text = String(content || '');
  return parseDelimited(text, detectDelimiter(text));
}

function buildCategoryIndex(snapshot) {
  const byPair = new Map();
  for (const cat of snapshot.categories || []) {
    const groupName = cat.group_name || 'Uncategorized';
    const pairKey = `${normKey(groupName)}::${normKey(cat.name)}`;
    byPair.set(pairKey, cat);
  }
  return { byPair };
}

function matchCategory(row, index, defaultMonthKey, toLocalMonthKey) {
  const categoryName = String(row.category || '').trim();
  if (!categoryName) {
    return { status: 'error', error: 'Missing category name' };
  }
  const groupName = String(row.group || '').trim() || 'Uncategorized';
  const pairKey = `${normKey(groupName)}::${normKey(categoryName)}`;
  const cat = index.byPair.get(pairKey);
  const assigned = parseMoney(row.assigned);
  const goalTarget = parseMoney(row.goalTarget);
  const goalType = normalizeGoalType(row.goalType);
  const rowMonth = String(row.month || '').trim();
  const monthKey = rowMonth ? monthlyBudgetServiceKey(rowMonth, toLocalMonthKey) : defaultMonthKey;

  const normalized = {
    group: groupName,
    category: categoryName,
    assigned,
    goalTarget,
    goalType,
    monthKey,
    lineNumber: row.lineNumber,
  };

  if (!cat) {
    return {
      status: 'unmatched',
      normalized,
      willCreate: true,
    };
  }

  const changes = [];
  if (assigned !== null && roundMoney(cat.assigned) !== assigned) {
    changes.push('assigned');
  }
  if (goalTarget !== null && roundMoney(cat.target_amount) !== goalTarget) {
    changes.push('goalTarget');
  }
  if (goalType && (cat.target_type || 'monthly') !== goalType) {
    changes.push('goalType');
  }

  return {
    status: changes.length ? 'update' : 'unchanged',
    categoryId: cat.id,
    existingGroup: cat.group_name || 'Uncategorized',
    normalized,
    changes,
    willCreate: false,
  };
}

/** Accept YYYY-MM-01, YYYY-MM-DD, YYYY-MM, or M/D/YY */
function monthlyBudgetServiceKey(monthStr, toLocalMonthKey) {
  const normalized = normalizeMonthInput(monthStr);
  if (!normalized) return toLocalMonthKey(new Date());
  if (/^\d{4}-\d{2}-01$/.test(normalized)) return normalized;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return `${normalized.slice(0, 7)}-01`;
  return toLocalMonthKey(normalized);
}

function previewImport(snapshot, parsedRows, defaultMonthKey, toLocalMonthKey) {
  const index = buildCategoryIndex(snapshot);
  const items = [];
  const summary = {
    total: 0,
    update: 0,
    unchanged: 0,
    unmatched: 0,
    error: 0,
  };

  for (const row of parsedRows) {
    if (!String(row.category || '').trim() && !String(row.group || '').trim()) continue;
    summary.total++;
    const m = matchCategory(row, index, defaultMonthKey, toLocalMonthKey);
    if (m.status === 'error') {
      summary.error++;
      items.push({ ...m, normalized: { lineNumber: row.lineNumber } });
      continue;
    }
    if (m.status === 'unmatched') summary.unmatched++;
    else if (m.status === 'update') summary.update++;
    else summary.unchanged++;
    items.push(m);
  }

  return {
    monthKey: defaultMonthKey,
    items,
    summary,
  };
}

async function findOrCreateGroup(db, userId, groupName) {
  const name = String(groupName || '').trim() || 'Uncategorized';
  let row = await db.get(
    'SELECT id, name FROM category_groups WHERE user_id = ? AND LOWER(TRIM(name)) = LOWER(TRIM(?))',
    [userId, name]
  );
  if (row) return row.id;
  const result = await db.run(
    `INSERT INTO category_groups (user_id, name, sort_order, created_at, updated_at)
     VALUES (?, ?, 999, datetime('now'), datetime('now'))`,
    [userId, name]
  );
  return result.lastID;
}

async function applyImport(db, userId, monthKey, previewItems, options, deps) {
  const {
    createMissing = true,
    updateAssigned = true,
    updateGoals = true,
  } = options || {};
  const { monthlyBudgetService, notifyBudgetStateChanged } = deps;
  const mKey = monthlyBudgetService.toLocalMonthKey(monthKey);

  const result = {
    applied: 0,
    created: 0,
    skipped: 0,
    unchanged: 0,
    errors: [],
  };

  for (const item of previewItems) {
    if (item.status === 'error') {
      result.skipped++;
      result.errors.push({ line: item.normalized?.lineNumber, error: item.error });
      continue;
    }
    if (item.status === 'unchanged') {
      result.unchanged++;
      result.skipped++;
      continue;
    }

    const { normalized } = item;
    const targetMonth = monthlyBudgetService.toLocalMonthKey(normalized.monthKey || mKey);

    try {
      let categoryId = item.categoryId;

      if (item.status === 'unmatched') {
        if (!createMissing) {
          result.skipped++;
          continue;
        }
        const groupId = await findOrCreateGroup(db, userId, normalized.group);
        categoryId = `cat_import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const assigned = normalized.assigned !== null ? normalized.assigned : 0;
        const targetAmount = normalized.goalTarget !== null ? normalized.goalTarget : 0;
        const targetType = normalized.goalType || 'monthly';
        await db.run(
          `INSERT INTO categories (id, user_id, name, group_id, assigned, target_type, target_amount, target_date)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            categoryId,
            userId,
            normalized.category,
            groupId,
            assigned,
            targetType,
            targetAmount,
            null,
          ]
        );
        result.created++;
        if (notifyBudgetStateChanged) {
          notifyBudgetStateChanged('category:created', { categoryId, userId });
        }
      }

      if (!categoryId) {
        result.skipped++;
        continue;
      }

      if (updateAssigned && normalized.assigned !== null) {
        await monthlyBudgetService.applyMonthBudgetedAmount(
          db,
          userId,
          categoryId,
          targetMonth,
          normalized.assigned
        );
        result.applied++;
      }

      if (updateGoals && (normalized.goalTarget !== null || normalized.goalType)) {
        const setClauses = [];
        const values = [];
        if (normalized.goalTarget !== null) {
          setClauses.push('target_amount = ?');
          values.push(normalized.goalTarget);
        }
        if (normalized.goalType) {
          setClauses.push('target_type = ?');
          values.push(normalized.goalType);
        }
        if (setClauses.length) {
          setClauses.push('updated_at = datetime("now")');
          values.push(categoryId, userId);
          await db.run(
            `UPDATE categories SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`,
            values
          );
          if (!updateAssigned || normalized.assigned === null) result.applied++;
        }
      }
    } catch (e) {
      result.errors.push({
        line: normalized?.lineNumber,
        category: normalized?.category,
        error: e?.message || String(e),
      });
    }
  }

  await monthlyBudgetService.getBudgetMonthSnapshot(db, userId, mKey);

  if (notifyBudgetStateChanged) {
    notifyBudgetStateChanged('prosperity:updated', {
      userId,
      reason: 'budget:table-import',
      monthKey: mKey,
    });
  }

  return result;
}

function detectFormat(fileName, content) {
  const name = String(fileName || '').toLowerCase();
  if (name.endsWith('.json')) return 'json';
  if (name.endsWith('.xlsx')) return 'xlsx';
  if (name.endsWith('.xls')) return 'xls';
  if (name.endsWith('.csv')) return 'csv';
  const trimmed = String(content || '').trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return 'json';
  return 'csv';
}

module.exports = {
  TABLE_HEADERS,
  EXPORT_VERSION,
  buildExportRows,
  buildExportPayload,
  buildCsvFromRows,
  parseImportContent,
  previewImport,
  applyImport,
  detectFormat,
  parseMoney,
  monthlyBudgetServiceKey,
};
