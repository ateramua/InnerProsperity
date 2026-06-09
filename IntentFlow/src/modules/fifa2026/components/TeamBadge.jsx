import { teamDisplay } from '../data/countryMeta';

export default function TeamBadge({ teamId, align = 'left', compact = false }) {
  const team = teamDisplay(teamId);
  return (
    <span className={`fifa2026-team-cell ${align === 'right' ? 'justify-end' : ''}`} style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
      <span className="fifa2026-flag" aria-hidden>{team.flag}</span>
      {!compact && <span>{team.name}</span>}
      {compact && <span>{team.code}</span>}
    </span>
  );
}
