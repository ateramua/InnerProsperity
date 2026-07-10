import { MATCH_STATUS } from '../config';

export const KNOCKOUT_DEFAULTS = {
  extraTime: null,
  penalties: null,
  winnerTeamId: null,
  loserTeamId: null,
};

export function normalizeKnockoutMatch(match) {
  return {
    ...KNOCKOUT_DEFAULTS,
    ...match,
    score: match.score ?? { home: null, away: null },
    extraTime: match.extraTime ?? null,
    penalties: match.penalties ?? null,
  };
}

function totalGoals(score, extraTime) {
  const home = (score?.home ?? 0) + (extraTime?.home ?? 0);
  const away = (score?.away ?? 0) + (extraTime?.away ?? 0);
  return { home, away };
}

export function isKnockoutDrawAfter90(match) {
  const { home, away } = match.score ?? {};
  return home != null && away != null && home === away;
}

export function isKnockoutDrawAfterExtraTime(match) {
  if (!isKnockoutDrawAfter90(match)) return false;
  const totals = totalGoals(match.score, match.extraTime);
  return totals.home === totals.away;
}

export function knockoutResultNeedsExtraTime(match) {
  return match.phase === 'knockout'
    && match.status === MATCH_STATUS.COMPLETED
    && isKnockoutDrawAfter90(match)
    && !match.extraTime;
}

export function knockoutResultNeedsPenalties(match) {
  return match.phase === 'knockout'
    && match.status === MATCH_STATUS.COMPLETED
    && isKnockoutDrawAfterExtraTime(match)
    && !match.penalties;
}

/**
 * Resolve knockout winner/loser. Knockout ties require ET then penalties.
 */
export function resolveKnockoutOutcome(match) {
  if (match.status !== MATCH_STATUS.COMPLETED) {
    return { winner: null, loser: null, complete: false, reason: 'incomplete' };
  }

  const { home, away } = match.score ?? {};
  if (home == null || away == null) {
    return { winner: null, loser: null, complete: false, reason: 'no_score' };
  }

  if (home !== away) {
    const winner = home > away ? match.homeTeamId : match.awayTeamId;
    const loser = home > away ? match.awayTeamId : match.homeTeamId;
    return { winner, loser, complete: true, reason: 'regulation' };
  }

  if (!match.extraTime || match.extraTime.home == null || match.extraTime.away == null) {
    return { winner: null, loser: null, complete: false, reason: 'needs_extra_time' };
  }

  const totals = totalGoals(match.score, match.extraTime);
  if (totals.home !== totals.away) {
    const winner = totals.home > totals.away ? match.homeTeamId : match.awayTeamId;
    const loser = totals.home > totals.away ? match.awayTeamId : match.homeTeamId;
    return { winner, loser, complete: true, reason: 'extra_time' };
  }

  const pens = match.penalties;
  if (!pens || pens.home == null || pens.away == null) {
    return { winner: null, loser: null, complete: false, reason: 'needs_penalties' };
  }

  if (pens.home === pens.away) {
    return { winner: null, loser: null, complete: false, reason: 'invalid_penalties' };
  }

  const winner = pens.home > pens.away ? match.homeTeamId : match.awayTeamId;
  const loser = pens.home > pens.away ? match.awayTeamId : match.homeTeamId;
  return { winner, loser, complete: true, reason: 'penalties' };
}

export function formatKnockoutScoreLine(match) {
  const { home, away } = match.score ?? {};
  if (home == null || away == null) return '—';

  let line = `${home}–${away}`;
  if (match.extraTime) {
    const etH = match.extraTime.home ?? 0;
    const etA = match.extraTime.away ?? 0;
    if (etH > 0 || etA > 0) {
      line += ` (${home + etH}–${away + etA} aet)`;
    }
  }
  if (match.penalties) {
    line += ` · pens ${match.penalties.home}–${match.penalties.away}`;
  }
  return line;
}

/** Persist only match results — never structural bracket fields from stale state. */
export function pickKnockoutResultOverride(match) {
  return {
    status: match.status,
    score: match.score,
    extraTime: match.extraTime ?? null,
    penalties: match.penalties ?? null,
    winnerTeamId: match.winnerTeamId ?? null,
    loserTeamId: match.loserTeamId ?? null,
  };
}

const KNOCKOUT_DRAW_MESSAGE =
  'A knockout match cannot end in a draw. Enter extra-time scores (and penalties if still level) to decide a winner.';

function isBlankScore(value) {
  return value === '' || value == null;
}

/** Non-throwing validation for knockout score entry UI. */
export function validateKnockoutResultInput(result) {
  const home = Number(result.homeScore);
  const away = Number(result.awayScore);
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) {
    return { ok: false, message: 'Scores must be non-negative numbers.' };
  }

  if (home !== away) {
    return { ok: true };
  }

  if (!result.extraTime || isBlankScore(result.extraTime.home) || isBlankScore(result.extraTime.away)) {
    return { ok: false, message: KNOCKOUT_DRAW_MESSAGE };
  }

  const etHome = Number(result.extraTime.home);
  const etAway = Number(result.extraTime.away);
  if (!Number.isFinite(etHome) || !Number.isFinite(etAway) || etHome < 0 || etAway < 0) {
    return { ok: false, message: 'Extra time scores must be non-negative numbers.' };
  }

  if (home + etHome !== away + etAway) {
    return { ok: true };
  }

  if (!result.penalties || isBlankScore(result.penalties.home) || isBlankScore(result.penalties.away)) {
    return {
      ok: false,
      message: 'Still level after extra time. Enter penalty shootout scores to decide a winner.',
    };
  }

  const penHome = Number(result.penalties.home);
  const penAway = Number(result.penalties.away);
  if (!Number.isFinite(penHome) || !Number.isFinite(penAway) || penHome < 0 || penAway < 0) {
    return { ok: false, message: 'Penalty scores must be non-negative numbers.' };
  }
  if (penHome === penAway) {
    return { ok: false, message: 'Penalty shootout cannot end in a draw.' };
  }

  return { ok: true };
}

export function applyKnockoutMatchResult(match, result) {
  const home = Number(result.homeScore);
  const away = Number(result.awayScore);
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) {
    throw new Error('Scores must be non-negative numbers');
  }

  const next = normalizeKnockoutMatch({
    ...match,
    status: MATCH_STATUS.COMPLETED,
    score: { home, away },
    extraTime: null,
    penalties: null,
    winnerTeamId: null,
    loserTeamId: null,
  });

  if (home === away) {
    if (result.extraTime) {
      const etHome = Number(result.extraTime.home);
      const etAway = Number(result.extraTime.away);
      if (!Number.isFinite(etHome) || !Number.isFinite(etAway) || etHome < 0 || etAway < 0) {
        throw new Error('Extra time scores must be non-negative numbers');
      }
      next.extraTime = { home: etHome, away: etAway };
    }

    const totals = totalGoals(next.score, next.extraTime);
    if (next.extraTime && totals.home === totals.away) {
      if (result.penalties) {
        const penHome = Number(result.penalties.home);
        const penAway = Number(result.penalties.away);
        if (!Number.isFinite(penHome) || !Number.isFinite(penAway) || penHome < 0 || penAway < 0) {
          throw new Error('Penalty scores must be non-negative numbers');
        }
        if (penHome === penAway) {
          throw new Error('Penalty shootout cannot end in a draw');
        }
        next.penalties = { home: penHome, away: penAway };
      }
    }
  }

  const outcome = resolveKnockoutOutcome(next);
  if (!outcome.complete) {
    throw new Error(
      outcome.reason === 'needs_extra_time'
        ? KNOCKOUT_DRAW_MESSAGE
        : outcome.reason === 'needs_penalties'
          ? 'Still level after extra time. Enter penalty shootout scores to decide a winner.'
          : 'Could not resolve knockout winner',
    );
  }

  next.winnerTeamId = outcome.winner;
  next.loserTeamId = outcome.loser;
  return next;
}
