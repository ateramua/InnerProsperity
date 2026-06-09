export default function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onCancel }) {
  if (!open) return null;

  return (
    <div className="fifa2026-dialog-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="fifa2026-glass fifa2026-dialog"
        role="alertdialog"
        aria-labelledby="fifa-dialog-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 id="fifa-dialog-title" className="fifa2026-dialog-title">{title}</h3>
        <p className="fifa2026-meta">{message}</p>
        <div className="fifa2026-dialog-actions">
          <button type="button" className="fifa2026-btn fifa2026-btn-ghost" onClick={onCancel}>
            Cancel
          </button>
          <button type="button" className="fifa2026-btn fifa2026-btn-danger" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
