import { teamDisplay } from '../data/countryMeta';

export default function ChampionBanner({ teamId }) {
  if (!teamId) return null;
  const team = teamDisplay(teamId);

  return (
    <div className="fifa2026-champion-banner">
      <div className="fifa2026-champion-glow" />
      <span className="fifa2026-champion-trophy">🏆</span>
      <div>
        <div className="fifa2026-champion-label">World Champions 2026</div>
        <div className="fifa2026-champion-name">
          <span>{team.flag}</span> {team.name}
        </div>
      </div>
    </div>
  );
}
