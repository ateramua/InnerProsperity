/**
 * Shared sorting for transaction lists/tables across register views.
 */

export const DEFAULT_TRANSACTION_SORT = Object.freeze({ key: 'date', dir: 'desc' });

export function getNextSortState(current, key) {
  const prev = current || DEFAULT_TRANSACTION_SORT;
  if (prev.key === key) {
    return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' };
  }
  return { key, dir: key === 'date' ? 'desc' : 'asc' };
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
  const mult = dir === 'asc' ? 1 : -1;
  const categoryNameById = new Map(
    (opts.categories || [])
      .filter((c) => c?.id)
      .map((c) => [c.id, c.name || ''])
  );

  return [...(list || [])].sort((a, b) => {
    let cmp = 0;
    switch (key) {
      case 'date':
        cmp = String(a.date || '').localeCompare(String(b.date || ''));
        break;
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
    return String(a.id ?? '').localeCompare(String(b.id ?? ''));
  });
}

export function sortIndicator(sort, key) {
  if (!sort || sort.key !== key) return '';
  return sort.dir === 'asc' ? ' ↑' : ' ↓';
}
