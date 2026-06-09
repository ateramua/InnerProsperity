import { KNOCKOUT_ROUNDS } from '../config';
import { useTournamentStore } from '../hooks/useTournamentStore';
import TeamBadge from './TeamBadge';
import MatchScoreEditor from './MatchScoreEditor';

function BracketMatch({ match, onSubmit, isFinal }) {
  const { home, away } = match.score;
  const homeWins = match.status === 'completed' && home != null && away != null && home > away;
  const awayWins = match.status === 'completed' && home != null && away != null && away > home;
  const ready = match.homeTeamId !== 'TBD' && match.awayTeamId !== 'TBD';

  return (
    <div className={`fifa2026-glass fifa2026-bracket-match ${isFinal ? 'final' : ''} ${match.status === 'completed' ? 'completed' : ''}`}>
      <div className="fifa2026-bracket-match-label">{match.label}</div>
      <div className={`fifa2026-bracket-team ${homeWins ? 'winner' : ''}`}>
        <TeamBadge teamId={match.homeTeamId} compact />
        {home != null && <span className="fifa2026-bracket-score">{home}</span>}
      </div>
      <div className={`fifa2026-bracket-team ${awayWins ? 'winner' : ''}`}>
        <TeamBadge teamId={match.awayTeamId} compact />
        {away != null && <span className="fifa2026-bracket-score">{away}</span>}
      </div>
      {ready && (
        <div style={{ marginTop: '0.5rem' }}>
          <MatchScoreEditor match={match} onSubmit={onSubmit} phase="knockout" />
        </div>
      )}
      {!ready && (match.homeSourceLabel || match.homeSource) && (
        <div className="fifa2026-meta">
          {match.homeSourceLabel || match.homeSource} vs {match.awaySourceLabel || match.awaySource}
        </div>
      )}
      {match.kickoff && (
        <div className="fifa2026-meta">
          {new Date(match.kickoff).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
        </div>
      )}
    </div>
  );
}

export default function KnockoutTab() {
  const { derived, submitResult } = useTournamentStore();
  const { knockoutByRound } = derived;

  return (
    <div>
      <p className="fifa2026-meta" style={{ marginBottom: '1.25rem' }}>
        Bracket teams populate from group standings. Enter knockout scores here or on the Fixtures tab — advances recalculate instantly.
      </p>
      <div className="fifa2026-bracket">
        {KNOCKOUT_ROUNDS.map(({ id, label }) => {
          const matches = knockoutByRound[id] || [];
          return (
            <div key={id} className={`fifa2026-bracket-round ${id === 'final' ? 'final-round' : ''}`}>
              <div className="fifa2026-bracket-round-title">{label}</div>
              {matches.map((m) => (
                <BracketMatch
                  key={m.id}
                  match={m}
                  onSubmit={submitResult}
                  isFinal={m.roundId === 'final'}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
