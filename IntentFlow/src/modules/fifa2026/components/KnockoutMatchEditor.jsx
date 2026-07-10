import { useMemo, useState } from 'react';
import { MATCH_STATUS } from '../config';
import {
  isKnockoutDrawAfter90,
  isKnockoutDrawAfterExtraTime,
  formatKnockoutScoreLine,
  validateKnockoutResultInput,
} from '../engine/knockoutResolution';
import TeamBadge from './TeamBadge';

export default function KnockoutMatchEditor({ match, onSubmit }) {
  const [home, setHome] = useState(match.score?.home ?? '');
  const [away, setAway] = useState(match.score?.away ?? '');
  const [etHome, setEtHome] = useState(match.extraTime?.home ?? '');
  const [etAway, setEtAway] = useState(match.extraTime?.away ?? '');
  const [penHome, setPenHome] = useState(match.penalties?.home ?? '');
  const [penAway, setPenAway] = useState(match.penalties?.away ?? '');
  const [error, setError] = useState('');
  const completed = match.status === MATCH_STATUS.COMPLETED;

  const clearError = () => {
    if (error) setError('');
  };

  const previewDraw = useMemo(() => {
    const h = Number(home);
    const a = Number(away);
    return Number.isFinite(h) && Number.isFinite(a) && h === a;
  }, [home, away]);

  const previewNeedsPens = useMemo(() => {
    if (!previewDraw) return false;
    const eh = Number(etHome);
    const ea = Number(etAway);
    if (!Number.isFinite(eh) || !Number.isFinite(ea)) return false;
    const h = Number(home);
    const a = Number(away);
    return h + eh === a + ea;
  }, [previewDraw, home, away, etHome, etAway]);

  const handleSubmit = (e) => {
    e.preventDefault();
    const result = {
      homeScore: home,
      awayScore: away,
    };
    if (previewDraw) {
      result.extraTime = { home: etHome, away: etAway };
      if (previewNeedsPens) {
        result.penalties = { home: penHome, away: penAway };
      }
    }

    const validation = validateKnockoutResultInput(result);
    if (!validation.ok) {
      setError(validation.message);
      return;
    }

    const outcome = onSubmit(match.id, null, null, 'knockout', result);
    if (outcome?.error) {
      setError(outcome.error);
      return;
    }

    setError('');
  };

  return (
    <form className="fifa2026-ko-score-form" onSubmit={handleSubmit}>
      <div className="fifa2026-score-input">
        <label className="fifa2026-meta">90&apos;</label>
        <input
          type="number"
          min="0"
          value={home}
          onChange={(e) => { setHome(e.target.value); clearError(); }}
          aria-label="Home score after 90 minutes"
        />
        <span style={{ color: 'var(--fifa-text-muted)', fontWeight: 700 }}>:</span>
        <input
          type="number"
          min="0"
          value={away}
          onChange={(e) => { setAway(e.target.value); clearError(); }}
          aria-label="Away score after 90 minutes"
        />
      </div>

      {previewDraw && (
        <div className="fifa2026-ko-et-block">
          <span className="fifa2026-meta">Extra time required — enter goals scored in extra time only</span>
          <div className="fifa2026-score-input">
            <input
              type="number"
              min="0"
              value={etHome}
              onChange={(e) => { setEtHome(e.target.value); clearError(); }}
              aria-label="Home extra time goals"
            />
            <span>:</span>
            <input
              type="number"
              min="0"
              value={etAway}
              onChange={(e) => { setEtAway(e.target.value); clearError(); }}
              aria-label="Away extra time goals"
            />
          </div>
        </div>
      )}

      {previewNeedsPens && (
        <div className="fifa2026-ko-et-block">
          <span className="fifa2026-meta">Penalty shootout</span>
          <div className="fifa2026-score-input">
            <input
              type="number"
              min="0"
              value={penHome}
              onChange={(e) => { setPenHome(e.target.value); clearError(); }}
              aria-label="Home penalties scored"
            />
            <span>:</span>
            <input
              type="number"
              min="0"
              value={penAway}
              onChange={(e) => { setPenAway(e.target.value); clearError(); }}
              aria-label="Away penalties scored"
            />
          </div>
        </div>
      )}

      {error && (
        <p className="fifa2026-form-error" role="alert">
          {error}
        </p>
      )}

      <button type="submit" className="fifa2026-btn fifa2026-btn-primary">
        {completed ? 'Update result' : 'Save result'}
      </button>
    </form>
  );
}

export function KnockoutScoreDisplay({ match }) {
  if (match.status !== MATCH_STATUS.COMPLETED) return null;
  return (
    <div className="fifa2026-ko-score-display">
      {formatKnockoutScoreLine(match)}
      {isKnockoutDrawAfter90(match) && !match.extraTime && (
        <span className="fifa2026-meta"> · needs ET</span>
      )}
      {isKnockoutDrawAfterExtraTime(match) && !match.penalties && (
        <span className="fifa2026-meta"> · needs pens</span>
      )}
    </div>
  );
}

export function KnockoutFixtureRow({ match, onSubmit, showSeeds = false }) {
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
        <KnockoutScoreDisplay match={match} />
        <KnockoutMatchEditor match={match} onSubmit={onSubmit} />
        {match.venue && <div className="fifa2026-meta">{match.venue}</div>}
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
