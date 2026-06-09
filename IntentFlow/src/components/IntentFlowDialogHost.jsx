import React, { useEffect, useState } from 'react';
import { intentFlowDialogManager } from '../utils/intentFlowDialogManager.jsx';

const DIALOG_TEST_IDS = {
  'import-complete': {
    dialog: 'import-complete-dialog',
    ok: 'import-complete-ok',
  },
  'transaction-added': {
    dialog: 'transaction-added-dialog',
    ok: 'transaction-added-ok',
  },
  'group-created': {
    dialog: 'group-created-dialog',
    ok: 'group-created-ok',
  },
  'unassign-confirm': {
    dialog: 'unassign-confirm-dialog',
    ok: 'unassign-confirm-ok',
    cancel: 'unassign-confirm-cancel',
  },
  'unassign-complete': {
    dialog: 'unassign-complete-dialog',
    ok: 'unassign-complete-ok',
  },
  'smart-assign-confirm': {
    dialog: 'smart-assign-confirm-dialog',
    ok: 'smart-assign-confirm-ok',
    cancel: 'smart-assign-confirm-cancel',
  },
  'smart-assign-complete': {
    dialog: 'smart-assign-complete-dialog',
    ok: 'smart-assign-complete-ok',
  },
  'fund-underfunded-confirm': {
    dialog: 'fund-underfunded-confirm-dialog',
    ok: 'fund-underfunded-confirm-ok',
    cancel: 'fund-underfunded-confirm-cancel',
  },
  'fund-underfunded-complete': {
    dialog: 'fund-underfunded-complete-dialog',
    ok: 'fund-underfunded-complete-ok',
  },
  'category-update': {
    dialog: 'category-update-dialog',
    ok: 'category-update-ok',
  },
  'no-rta-for-assign': {
    dialog: 'no-rta-for-assign-dialog',
    ok: 'no-rta-for-assign-ok',
  },
};

const styles = {
  overlay: {
    position: 'fixed',
    inset: 0,
    background: 'rgba(0, 0, 0, 0.65)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20000,
    padding: '1rem',
    boxSizing: 'border-box',
  },
  panel: {
    background: '#0f172a',
    color: '#f8fafc',
    borderRadius: '12px',
    maxWidth: '480px',
    width: '100%',
    border: '1px solid rgba(255, 255, 255, 0.15)',
    boxShadow: '0 20px 40px rgba(0, 0, 0, 0.45)',
    padding: '1.25rem 1.5rem',
  },
  title: {
    margin: '0 0 0.75rem',
    fontSize: '1.15rem',
    fontWeight: 600,
  },
  message: {
    margin: '0 0 1.25rem',
    fontSize: '0.95rem',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    color: '#e2e8f0',
  },
  okButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '88px',
    padding: '0.55rem 1.25rem',
    borderRadius: '8px',
    border: 'none',
    background: '#2563eb',
    color: '#fff',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
  },
  cancelButton: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: '88px',
    padding: '0.55rem 1.25rem',
    borderRadius: '8px',
    border: '1px solid rgba(255, 255, 255, 0.2)',
    background: 'transparent',
    color: '#e2e8f0',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginRight: '0.75rem',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '0.75rem',
  },
};

export default function IntentFlowDialogHost() {
  const [state, setState] = useState(() => intentFlowDialogManager.getState());

  useEffect(() => intentFlowDialogManager.subscribe(setState), []);

  if (!state.open) return null;

  const testIds = DIALOG_TEST_IDS[state.id] || {
    dialog: 'intentflow-dialog',
    ok: 'intentflow-dialog-ok',
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={`${testIds.dialog}-title`}
      data-testid={testIds.dialog}
      style={styles.overlay}
    >
      <div style={styles.panel}>
        <h3 id={`${testIds.dialog}-title`} style={styles.title}>
          {state.title}
        </h3>
        <p style={styles.message}>{state.message}</p>
        {state.mode === 'confirm' ? (
          <div style={styles.actions}>
            <button
              type="button"
              data-testid={testIds.cancel || 'intentflow-dialog-cancel'}
              style={styles.cancelButton}
              onClick={() => intentFlowDialogManager.close(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid={testIds.ok}
              style={styles.okButton}
              onClick={() => intentFlowDialogManager.close(true)}
            >
              OK
            </button>
          </div>
        ) : (
          <button
            type="button"
            data-testid={testIds.ok}
            style={styles.okButton}
            onClick={() => intentFlowDialogManager.close(true)}
          >
            OK
          </button>
        )}
      </div>
    </div>
  );
}
