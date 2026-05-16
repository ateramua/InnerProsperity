export function MetricCard({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <section
      className="premium-card"
      style={{
        padding: 14,
        minHeight: 86,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between'
      }}
    >
      <span className="muted" style={{ fontSize: 12, fontWeight: 700 }}>
        {label}
      </span>
      <strong style={{ color: accent, fontSize: 21, letterSpacing: '-0.03em' }}>{value}</strong>
    </section>
  );
}
