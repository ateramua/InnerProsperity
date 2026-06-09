import { MATCH_STATUS } from '../config';
import { createInitialTournamentState } from '../data/wc2026Seed';
import { populateKnockoutFromGroups, propagateKnockoutWinners } from './knockout';

export function applyMatchResult(fixture, homeScore, awayScore) {
  const home = Number(homeScore);
  const away = Number(awayScore);
  if (!Number.isFinite(home) || !Number.isFinite(away) || home < 0 || away < 0) {
    throw new Error('Scores must be non-negative numbers');
  }

  return {
    ...fixture,
    status: MATCH_STATUS.COMPLETED,
    score: { home, away },
  };
}

export function recalculateTournament(state) {
  const fixtures = state.fixtures.map((f) => {
    const override = state.resultOverrides[f.id];
    return override ? { ...f, ...override } : f;
  });

  const knockoutSkeleton = createInitialTournamentState().knockoutMatches;
  let knockoutMatches = populateKnockoutFromGroups(
    state.groups,
    fixtures,
    knockoutSkeleton,
  );

  const koOverrides = Object.entries(state.resultOverrides)
    .filter(([id]) => id.startsWith('ko-'))
    .reduce((acc, [id, val]) => {
      acc[id] = val;
      return acc;
    }, {});

  knockoutMatches = knockoutMatches.map((m) => (
    koOverrides[m.id] ? { ...m, ...koOverrides[m.id] } : m
  ));

  knockoutMatches = propagateKnockoutWinners(knockoutMatches);

  return {
    ...state,
    fixtures,
    knockoutMatches,
  };
}
