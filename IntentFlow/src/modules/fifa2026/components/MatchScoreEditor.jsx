import { useState } from 'react';
import { MATCH_STATUS } from '../config';
import TeamBadge from './TeamBadge';

export default function MatchScoreEditor({ match, onSubmit, phase = 'group' }) {
  const [home, setHome] = useState(match.score.home ?? '');
  const [away, setAway] = useState(match.score.away ?? '');
  const completed = match.status === MATCH_STATUS.COMPLETED;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(match.id, home, away, phase);
  };

  return (
    <form className="fifa2026-score-input" onSubmit={handleSubmit}>
      <input
        type="number"
        min="0"
        value={home}
        onChange={(e) => setHome(e.target.value)}
        aria-label="Home score"
      />
      <span style={{ color: 'var(--fifa-text-muted)', fontWeight: 700 }}>:</span>
      <input
        type="number"
        min="0"
        value={away}
        onChange={(e) => setAway(e.target.value)}
        aria-label="Away score"
      />
      <button type="submit" className="fifa2026-btn fifa2026-btn-primary">
        {completed ? 'Update' : 'Save'}
      </button>
    </form>
  );
}

export function FixtureRow({ match, onSubmit, phase, showSeeds = false }) {
  const completed = match.status === MATCH_STATUS.COMPLETED;
  const showHomeSeed = showSeeds && match.homeTeamId === 'TBD' && (match.homeSourceLabel || match.homeSource);
  const showAwaySeed = showSeeds && match.awayTeamId === 'TBD' && (match.awaySourceLabel || match.awaySource);

  return (
    <div className={`fifa2026-glass fifa2026-fixture-card ${completed ? 'completed' : ''}`}>
      <div className="fifa2026-fixture-team">
        <TeamBadge teamId={match.homeTeamId} />
        {showHomeSeed && (
          <span className="fifa2026-seed-hint">{match.homeSourceLabel || match.homeSource}</span>
        )}
      </div>
      <div style={{ textAlign: 'center' }}>
        <MatchScoreEditor match={match} onSubmit={onSubmit} phase={phase} />
        {match.venue && (
          <div className="fifa2026-meta">{match.venue}</div>
        )}
        {match.kickoff && (
          <div className="fifa2026-meta">
            {new Date(match.kickoff).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
          </div>
        )}
      </div>
      <div className="fifa2026-fixture-team away">
        <TeamBadge teamId={match.awayTeamId} align="right" />
        {showAwaySeed && (
          <span className="fifa2026-seed-hint">{match.awaySourceLabel || match.awaySource}</span>
        )}
      </div>
    </div>
  );
}
