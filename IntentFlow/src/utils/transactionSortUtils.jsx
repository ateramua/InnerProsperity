/**
 * Shared sorting for transaction lists/tables across register views.
 *
 * Default date ↓: newest dates at the top, oldest at the bottom. Within the same
 * date, rows follow ledger chronology bottom → top (matches running balance).
 */

export const DEFAULT_TRANSACTION_SORT = Object.freeze({ key: 'date', dir: 'desc' });

/** Same as default date sort — newest at top, oldest at bottom, chron within each day. */
export const REGISTER_DISPLAY_SORT = DEFAULT_TRANSACTION_SORT;

/**
 * Register table order for balance walk: oldest row at the bottom, newer rows above.
 * Matches running-balance computation order (reversed for display).
 */
export function sortRegisterDisplayOrder(list) {
  return [...(list || [])].sort((a, b) => {
    const cmp = String(a.date || '').localeCompare(String(b.date || ''));
    if (cmp !== 0) return -cmp;
    return -compareTransactionsChronologically(a, b);
  });
}

/**
 * Ledger chronological order (oldest → newest). Matches running-balance computation.
 */
export function compareTransactionsChronologically(a, b) {
  const da = String(a?.date || '');
  const db = String(b?.date || '');
  if (da !== db) return da.localeCompare(db);

  const ca = String(a?.created_at || '');
  const cb = String(b?.created_at || '');
  if (ca !== cb) return ca.localeCompare(cb);

  const aId = Number(a?.id);
  const bId = Number(b?.id);
  if (Number.isFinite(aId) && Number.isFinite(bId) && aId !== bId) {
    return aId - bId;
  }
  return String(a?.id ?? '').localeCompare(String(b?.id ?? ''), undefined, { numeric: true });
}

export function getNextSortState(current, key) {
  const prev = current || DEFAULT_TRANSACTION_SORT;
  if (key === 'date') {
    return { key: 'date', dir: 'desc' };
  }
  if (prev.key === key) {
    return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key, dir: 'asc' };
}

function categoryLabel(tx, categoryNameById) {
  if (!tx?.category_id) return 'Ready to Assign';
  return categoryNameById.get(tx.category_id) || 'Uncategorized';
}

/**
 * @param {object[]} list
 * @param {{ key: string, dir: 'asc'|'desc' }} sort
 * @param {{ categories?: object[] }} [opts]
 */
export function sortTransactions(list, sort, opts = {}) {
  const { key, dir } = sort || DEFAULT_TRANSACTION_SORT;
  if (key === 'date') {
    return sortRegisterDisplayOrder(list);
  }

  const mult = dir === 'asc' ? 1 : -1;
  const categoryNameById = new Map(
    (opts.categories || [])
      .filter((c) => c?.id)
      .map((c) => [c.id, c.name || ''])
  );

  return [...(list || [])].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'payee':
      case 'description':
        cmp = String(a.payee || a.description || '').localeCompare(
          String(b.payee || b.description || ''),
          undefined,
          { sensitivity: 'base' }
        );
        break;
      case 'amount':
        cmp = (Number(a.amount) || 0) - (Number(b.amount) || 0);
        break;
      case 'outflow': {
        const aOut = Number(a.amount) < 0 ? Math.abs(Number(a.amount)) : 0;
        const bOut = Number(b.amount) < 0 ? Math.abs(Number(b.amount)) : 0;
        cmp = aOut - bOut;
        break;
      }
      case 'inflow': {
        const aIn = Number(a.amount) > 0 ? Number(a.amount) : 0;
        const bIn = Number(b.amount) > 0 ? Number(b.amount) : 0;
        cmp = aIn - bIn;
        break;
      }
      case 'category':
        cmp = categoryLabel(a, categoryNameById).localeCompare(
          categoryLabel(b, categoryNameById),
          undefined,
          { sensitivity: 'base' }
        );
        break;
      case 'account':
        cmp = String(a.account_name || a.account_id || '').localeCompare(
          String(b.account_name || b.account_id || ''),
          undefined,
          { sensitivity: 'base' }
        );
        break;
      default:
        cmp = 0;
    }
    if (cmp !== 0) return cmp * mult;
    return String(a.id ?? '').localeCompare(String(b.id ?? ''), undefined, { numeric: true });
  });
}

export function sortIndicator(sort, key) {
  if (!sort || sort.key !== key) return '';
  if (key === 'date') return ' ↓';
  return sort.dir === 'asc' ? ' ↑' : ' ↓';
}
