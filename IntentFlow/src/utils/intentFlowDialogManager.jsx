/**
 * Single authoritative dialog state machine for IntentFlow success/confirm sheets.
 * Replaces window.alert() for testable, DOM-only confirmation flows.
 */

const CLOSED_STATE = Object.freeze({
  open: false,
  id: null,
  type: null,
  title: null,
  message: null,
  mode: null,
});

class IntentFlowDialogManager {
  constructor() {
    this.activeDialog = null;
    this.resolveClose = null;
    this.listeners = new Set();
    this.syncGlobalState();
  }

  getState() {
    if (!this.activeDialog) return { ...CLOSED_STATE };
    return {
      open: true,
      id: this.activeDialog.id,
      type: this.activeDialog.type,
      title: this.activeDialog.title,
      message: this.activeDialog.message,
      mode: this.activeDialog.mode || 'alert',
    };
  }

  syncGlobalState() {
    if (typeof window !== 'undefined') {
      window.__INTENTFLOW_DIALOG_STATE__ = this.getState();
    }
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    const state = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (err) {
        console.error('[IntentFlowDialog] listener error:', err);
      }
    }
  }

  /**
   * Open a dialog. Returns a promise that resolves when the user clicks OK.
   * Only one dialog may be open at a time.
   */
  open(dialog) {
    if (this.activeDialog) {
      console.warn(
        '[IntentFlowDialog] dialog already open — ignoring new open request',
        this.activeDialog.id,
        dialog?.id
      );
      return Promise.resolve(this.activeDialog);
    }

    this.activeDialog = {
      id: dialog.id,
      type: dialog.type || 'success',
      title: dialog.title || '',
      message: dialog.message || '',
      mode: dialog.mode || 'alert',
    };
    this.syncGlobalState();
    this.notifyListeners();

    return new Promise((resolve) => {
      this.resolveClose = resolve;
    });
  }

  /** Confirm sheet — resolves true (OK) or false (Cancel). */
  openConfirm(dialog) {
    return this.open({ ...dialog, mode: 'confirm' });
  }

  close(result = true) {
    const closed = this.activeDialog;
    const mode = closed?.mode || 'alert';
    this.activeDialog = null;
    this.syncGlobalState();
    this.notifyListeners();

    if (this.resolveClose) {
      const resolve = this.resolveClose;
      this.resolveClose = null;
      resolve(mode === 'confirm' ? Boolean(result) : closed);
    }
  }

  assertNoDialogOpen(actionLabel = 'action') {
    if (this.activeDialog) {
      throw new Error(
        `Dialog "${this.activeDialog.id}" is still open before ${actionLabel}`
      );
    }
  }
}

export const intentFlowDialogManager = new IntentFlowDialogManager();
