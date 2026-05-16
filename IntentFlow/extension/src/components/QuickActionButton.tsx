import type { QuickAction } from '@/types/contracts';

export function QuickActionButton({ action, onRun }: { action: QuickAction; onRun: (action: QuickAction) => void }) {
  return (
    <button
      type="button"
      onClick={() => onRun(action)}
      style={{
        width: '100%',
        border: '1px solid var(--if-border)',
        borderRadius: 18,
        background: 'rgba(148, 163, 184, 0.12)',
        color: 'var(--if-text)',
        padding: 14,
        textAlign: 'left',
        display: 'grid',
        gap: 4,
        transition: 'transform 160ms ease, border-color 160ms ease'
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <strong>{action.label}</strong>
        {action.shortcut ? <kbd className="muted">{action.shortcut}</kbd> : null}
      </span>
      <span className="muted" style={{ fontSize: 12, lineHeight: 1.45 }}>
        {action.description}
      </span>
    </button>
  );
}
