import { intentFlowDialogManager } from './intentFlowDialogManager.jsx';

/**
 * Show a blocking IntentFlow confirmation dialog (DOM-based, non-blocking renderer IPC).
 *
 * @param {object} options
 * @param {string} options.id - Stable dialog id (import-complete, transaction-added, group-created)
 * @param {'success'|'error'|'info'} [options.type]
 * @param {string} options.title
 * @param {string} options.message
 * @param {boolean} [options.blocking=true] - Await until user clicks OK
 */
export async function showIntentFlowDialog({
  id,
  type = 'success',
  title,
  message,
  blocking = true,
}) {
  intentFlowDialogManager.assertNoDialogOpen(`showIntentFlowDialog(${id})`);
  const promise = intentFlowDialogManager.open({ id, type, title, message });
  if (blocking) {
    await promise;
  }
  return promise;
}

/**
 * Blocking confirm sheet (DOM-based). Resolves true when user clicks OK, false on Cancel.
 */
export async function showIntentFlowConfirmDialog({
  id,
  type = 'info',
  title,
  message,
  blocking = true,
}) {
  intentFlowDialogManager.assertNoDialogOpen(`showIntentFlowConfirmDialog(${id})`);
  const promise = intentFlowDialogManager.openConfirm({ id, type, title, message });
  if (blocking) {
    return promise;
  }
  return promise;
}
