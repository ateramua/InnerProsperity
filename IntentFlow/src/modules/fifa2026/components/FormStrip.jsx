export default function FormStrip({ form = [] }) {
  const recent = form.slice(-5);
  return (
    <span className="fifa2026-form" aria-label={`Form: ${recent.join(' ') || 'none'}`}>
      {recent.length === 0 && <span className="fifa2026-meta">—</span>}
      {recent.map((r, i) => (
        <span key={`${r}-${i}`} className={`fifa2026-form-badge ${r}`}>{r}</span>
      ))}
    </span>
  );
}
