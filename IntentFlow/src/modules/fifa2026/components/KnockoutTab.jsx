import { useMemo, useState } from 'react';
import { getNextMatchLabel } from '../engine/knockout';
import { formatKnockoutScoreLine } from '../engine/knockoutResolution';
import { useTournamentStore } from '../hooks/useTournamentStore';
import {
  BRACKET_COLUMNS,
  indexMatchesById,
  pickMatches,
} from '../data/bracketLayout.jsx';
import TeamBadge from './TeamBadge';
import KnockoutMatchEditor, { KnockoutScoreDisplay } from './KnockoutMatchEditor';
import QualificationBanner from './QualificationBanner';
import KnockoutMatchupGuide from './KnockoutMatchupGuide';

function BracketMatch({ match, onSubmit, isFinal, matchIndex, championPath, expanded, onToggle }) {
  const { home, away } = match.score ?? {};
  const homeWins = match.winnerTeamId === match.homeTeamId;
  const awayWins = match.winnerTeamId === match.awayTeamId;
  const ready = match.homeTeamId !== 'TBD' && match.awayTeamId !== 'TBD';
  const isR32 = match.roundId === 'r32';
  const onChampionPath = championPath.has(match.id);
  const nextLabel = getNextMatchLabel(match, matchIndex);

  return (
    <div
      className={[
        'fifa2026-glass',
        'fifa2026-bracket-match',
        isFinal ? 'final' : '',
        match.status === 'completed' ? 'completed' : '',
        onChampionPath ? 'champion-path' : '',
        expanded ? 'expanded' : '',
      ].filter(Boolean).join(' ')}
    >
      <button type="button" className="fifa2026-bracket-match-toggle" onClick={onToggle}>
        <div className="fifa2026-bracket-match-label">
          {match.label}
          {match.matchNumber != null && (
            <span className="fifa2026-meta"> · M{match.matchNumber}</span>
          )}
        </div>
        <span className="fifa2026-meta">{expanded ? '▲' : '▼'}</span>
      </button>

      <div className={`fifa2026-bracket-team ${homeWins ? 'winner' : ''}`}>
        <TeamBadge teamId={match.homeTeamId} compact />
        {match.homeTeamId === 'TBD' && (match.homeSourceLabel || match.homeSource) && (
          <span className="fifa2026-seed-hint">{match.homeSourceLabel || match.homeSource}</span>
        )}
        {home != null && <span className="fifa2026-bracket-score">{home}</span>}
      </div>
      <div className={`fifa2026-bracket-team ${awayWins ? 'winner' : ''}`}>
        <TeamBadge teamId={match.awayTeamId} compact />
        {match.awayTeamId === 'TBD' && (match.awaySourceLabel || match.awaySource) && (
          <span className="fifa2026-seed-hint">{match.awaySourceLabel || match.awaySource}</span>
        )}
        {away != null && <span className="fifa2026-bracket-score">{away}</span>}
      </div>

      <KnockoutScoreDisplay match={match} />

      {expanded && (
        <div className="fifa2026-bracket-match-details">
          {match.venue && <div className="fifa2026-meta"><strong>Venue:</strong> {match.venue}</div>}
          {match.kickoff && (
            <div className="fifa2026-meta">
              <strong>Kickoff:</strong>{' '}
              {new Date(match.kickoff).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
          {match.status === 'completed' && (
            <div className="fifa2026-meta">
              <strong>Result:</strong> {formatKnockoutScoreLine(match)}
            </div>
          )}
          {match.winnerTeamId && match.winnerTeamId !== 'TBD' && (
            <div className="fifa2026-meta fifa2026-ko-progression">
              <strong>Winner:</strong> <TeamBadge teamId={match.winnerTeamId} compact />
              {nextLabel && <span> → {nextLabel}</span>}
            </div>
          )}
          {match.feedsFrom && (
            <div className="fifa2026-meta">
              <strong>Feeds from:</strong> {match.feedsFrom.join(', ')}
            </div>
          )}
          {ready && (
            <div style={{ marginTop: '0.5rem' }}>
              <KnockoutMatchEditor match={match} onSubmit={onSubmit} />
            </div>
          )}
          {!ready && isR32 && (match.homeSource || match.awaySource) && (
            <div className="fifa2026-meta">
              Awaiting group results — slots fill from top 2 per group plus the 8 best third-place teams.
            </div>
          )}
          {!ready && !isR32 && (match.homeSourceLabel || match.homeSource) && (
            <div className="fifa2026-meta">
              {match.homeSourceLabel || match.homeSource} vs {match.awaySourceLabel || match.awaySource}
            </div>
          )}
        </div>
      )}

      {!expanded && ready && match.status !== 'completed' && (
        <div className="fifa2026-meta" style={{ marginTop: '0.35rem' }}>Expand to enter score</div>
      )}
    </div>
  );
}

function BracketRoundColumn({
  label,
  matches,
  onSubmit,
  matchIndex,
  championPath,
  expandedId,
  onToggle,
  roundId,
  side,
}) {
  if (!matches.length) return null;

  return (
    <div
      className={[
        'fifa2026-bracket-round',
        'fifa2026-bracket-col',
        `fifa2026-bracket-col--${roundId}`,
        side ? `fifa2026-bracket-col--${side}` : '',
      ].filter(Boolean).join(' ')}
    >
      <div className="fifa2026-bracket-round-title">{label}</div>
      <div className="fifa2026-bracket-round-matches">
        {matches.map((m) => (
          <BracketMatch
            key={m.id}
            match={m}
            onSubmit={onSubmit}
            isFinal={m.roundId === 'final'}
            matchIndex={matchIndex}
            championPath={championPath}
            expanded={expandedId === m.id}
            onToggle={() => onToggle(m.id)}
          />
        ))}
      </div>
    </div>
  );
}

export default function KnockoutTab() {
  const { state, derived, submitResult } = useTournamentStore();
  const { knockoutMatches } = state;
  const {
    r32Ready,
    r32Total,
    groupStageComplete,
    matchIndex,
    championPath,
    stats,
  } = derived;
  const [view, setView] = useState('bracket');
  const [expandedId, setExpandedId] = useState(null);

  const matchById = useMemo(() => indexMatchesById(knockoutMatches), [knockoutMatches]);

  const handleToggle = (id) => {
    setExpandedId(expandedId === id ? null : id);
  };

  return (
    <div>
      <div className="fifa2026-filter-bar" style={{ marginBottom: '1rem' }}>
        <button
          type="button"
          className={`fifa2026-chip ${view === 'bracket' ? 'active' : ''}`}
          onClick={() => setView('bracket')}
        >
          Live Bracket
        </button>
        <button
          type="button"
          className={`fifa2026-chip ${view === 'guide' ? 'active' : ''}`}
          onClick={() => setView('guide')}
        >
          How Matchups Work
        </button>
      </div>

      {view === 'guide' ? (
        <KnockoutMatchupGuide />
      ) : (
        <>
          <QualificationBanner compact />

          <p className="fifa2026-meta" style={{ marginBottom: '0.75rem' }}>
            Knockout bracket — left and right halves converge at Third Place and the Final (center).
            Progress: {stats.knockoutCompleted}/{stats.knockoutTotal} knockout matches.
          </p>
          <p className="fifa2026-meta" style={{ marginBottom: '1.25rem' }}>
            R32 slots filled: {r32Ready} / {r32Total}
            {!groupStageComplete && ' · provisional until all group matches are complete'}
            {championPath.size > 0 && ' · Gold highlight = champion’s path'}
            {' · '}
            <button
              type="button"
              className="fifa2026-ko-inline-link"
              onClick={() => setView('guide')}
            >
              See how matchups are determined
            </button>
          </p>

          <div className="fifa2026-split-bracket" role="list" aria-label="Knockout bracket">
            {BRACKET_COLUMNS.map((col) => (
              <BracketRoundColumn
                key={`${col.side}-${col.id}`}
                label={col.label}
                matches={pickMatches(matchById, col.matchIds)}
                onSubmit={submitResult}
                matchIndex={matchIndex}
                championPath={championPath}
                expandedId={expandedId}
                onToggle={handleToggle}
                roundId={col.id}
                side={col.side}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
