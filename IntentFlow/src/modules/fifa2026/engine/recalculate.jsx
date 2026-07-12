import { MATCH_STATUS } from '../config';
import { createInitialTournamentState, R32_CONFIRMED_TEAMS } from '../data/wc2026Seed';
import { GROUP_STAGE_SCORES } from '../data/groupStageResults';
import { KNOCKOUT_STAGE_RESULTS } from '../data/knockoutStageResults';
import { populateKnockoutFromGroups, propagateKnockoutWinners } from './knockout';
import { applyKnockoutMatchResult, normalizeKnockoutMatch, pickKnockoutResultOverride } from './knockoutResolution';

const KNOCKOUT_ROUND_SEED_ORDER = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];

function applyKnockoutStageSeeds(matches) {
  let next = matches;
  for (const roundId of KNOCKOUT_ROUND_SEED_ORDER) {
    const hasSeeds = next.some((m) => m.roundId === roundId && KNOCKOUT_STAGE_RESULTS[m.id]);
    if (!hasSeeds) continue;

    next = next.map((match) => {
      const seed = KNOCKOUT_STAGE_RESULTS[match.id];
      if (!seed || match.roundId !== roundId) return match;
      return applyKnockoutMatchResult(normalizeKnockoutMatch(match), seed);
    });
    next = propagateKnockoutWinners(next);
  }
  return next;
}

function applySeedGroupScore(fixture) {
  const preset = GROUP_STAGE_SCORES[fixture.id];
  if (!preset) return fixture;
  return {
    ...fixture,
    status: MATCH_STATUS.COMPLETED,
    score: { home: preset.home, away: preset.away },
  };
}

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

export function applyKnockoutResult(fixture, result) {
  return applyKnockoutMatchResult(normalizeKnockoutMatch(fixture), result);
}

export function recalculateTournament(state) {
  const fixtures = state.fixtures.map((f) => {
    const seeded = applySeedGroupScore(f);
    const override = state.resultOverrides[f.id];
    return override ? { ...seeded, ...override } : seeded;
  });

  const knockoutSkeleton = createInitialTournamentState().knockoutMatches;
  let knockoutMatches = populateKnockoutFromGroups(
    state.groups,
    fixtures,
    knockoutSkeleton,
  );

  knockoutMatches = knockoutMatches.map((m) => {
    const confirmed = R32_CONFIRMED_TEAMS[m.id];
    if (!confirmed) return m;
    return { ...m, ...confirmed };
  });

  knockoutMatches = applyKnockoutStageSeeds(knockoutMatches);

  const koOverrides = Object.entries(state.resultOverrides)
    .filter(([id]) => id.startsWith('ko-'))
    .reduce((acc, [id, val]) => {
      acc[id] = val;
      return acc;
    }, {});

  knockoutMatches = knockoutMatches.map((m) => {
    const override = koOverrides[m.id];
    if (!override) return m;
    return normalizeKnockoutMatch({ ...m, ...pickKnockoutResultOverride(override) });
  });

  knockoutMatches = propagateKnockoutWinners(knockoutMatches);

  return {
    ...state,
    fixtures,
    knockoutMatches,
  };
}
