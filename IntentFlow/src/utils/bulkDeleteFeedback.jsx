/**
 * User-facing result for bulk transaction delete (including imported-cash reversals).
 * @param {object} data - bulkDeleteTransactions result payload
 * @returns {{ ok: boolean, message: string }}
 */
export function formatBulkDeleteResultMessage(data) {
  const deleted = Number(data?.deleted) || 0;
  const reversed = Number(data?.reversed) || 0;
  const removed = deleted + reversed;
  const skipped = Array.isArray(data?.skipped) ? data.skipped : [];

  if (removed === 0 && skipped.length > 0) {
    const hasProtected = skipped.some((s) => s.reason === 'system_protected');
    return {
      ok: false,
      message: hasProtected
        ? 'Starting balance and other protected system transactions cannot be removed from the register.\n\n'
          + 'Imported-cash reconciliation adjustments (e.g. "Consolidated imported cash reconciliation") can be deleted.\n'
          + 'Manual opening balances must be changed from account settings.'
        : 'No selected transactions could be deleted.',
    };
  }

  if (removed === 0) {
    return {
      ok: false,
      message: 'No transactions were deleted. They may have already been removed.',
    };
  }

  let message = `Successfully removed ${removed} transaction(s)!`;
  if (reversed > 0 && deleted > 0) {
    message = `Removed ${removed} transaction(s) (${deleted} deleted, ${reversed} imported-cash adjustment(s) reversed).`;
  } else if (reversed > 0) {
    message = `Removed ${reversed} imported-cash adjustment transaction(s) and updated Ready to Assign.`;
  }
  if (skipped.length > 0) {
    message += `\n\n${skipped.length} protected system transaction(s) were skipped.`;
  }
  return { ok: true, message };
}
