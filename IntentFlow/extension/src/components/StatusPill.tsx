import type { BridgeStatus } from '@/types/contracts';

export function StatusPill({ status }: { status: BridgeStatus }) {
  const label = status.connected
    ? status.transport === 'native'
      ? 'Desktop connected'
      : 'Local bridge connected'
    : 'Offline mode';

  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 10px',
        borderRadius: 999,
        background: status.connected ? 'rgba(34, 197, 94, 0.14)' : 'rgba(244, 183, 64, 0.16)',
        color: status.connected ? '#16a34a' : '#b45309',
        fontSize: 12,
        fontWeight: 800
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: status.connected ? '#22c55e' : '#f59e0b'
        }}
      />
      {label}
    </div>
  );
}
