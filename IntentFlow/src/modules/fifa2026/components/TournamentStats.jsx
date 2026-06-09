import { useTournamentStore } from '../hooks/useTournamentStore';
import TeamBadge from './TeamBadge';

function StatCard({ icon, label, value, accent }) {
  return (
    <div className="fifa2026-glass fifa2026-stat-card" style={{ '--stat-accent': accent }}>
      <span className="fifa2026-stat-icon">{icon}</span>
      <div>
        <div className="fifa2026-stat-label">{label}</div>
        <div className="fifa2026-stat-value">{value}</div>
      </div>
    </div>
  );
}

export default function TournamentStats() {
  const { derived } = useTournamentStore();
  const { stats } = derived;

  return (
    <div className="fifa2026-stats-grid">
      <StatCard
        icon="⚽"
        label="Goals Scored"
        value={stats.totalGoals}
        accent="var(--fifa-accent-cyan)"
      />
      <StatCard
        icon="🏟️"
        label="Matches Played"
        value={`${stats.matchesPlayed} / ${stats.totalMatches}`}
        accent="var(--fifa-accent-gold)"
      />
      <StatCard
        icon="🏆"
        label="Top Scorer"
        value={stats.topScorer ? (
          <span className="fifa2026-stat-inline">
            <TeamBadge teamId={stats.topScorer.teamId} compact />
            <span className="fifa2026-meta">{stats.topScorer.goals} goals</span>
          </span>
        ) : '—'}
        accent="var(--fifa-accent-green)"
      />
      <StatCard
        icon="🎯"
        label="Knockout Stage"
        value={`${stats.knockoutCompleted} / ${stats.knockoutTotal}`}
        accent="var(--fifa-accent-magenta)"
      />
    </div>
  );
}
