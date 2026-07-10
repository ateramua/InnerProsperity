import { seedLabel } from '../data/countryMeta';
import { R32_PAIRING } from '../data/r32BracketTemplate';
import {
  assignThirdPlaceTeams,
  getAssignmentForSlot,
} from '../data/thirdPlaceAllocationMatrix';
import { isGroupStageComplete } from './qualification';
import { computeAllGroupStandings } from './standings';
import { computeBestThirdPlaceRanking } from './qualification';
import {
  normalizeKnockoutMatch,
  resolveKnockoutOutcome,
} from './knockoutResolution';

function buildGroupParticipants(groups, fixtures) {
  const standings = computeAllGroupStandings(groups, fixtures);
  const winners = [];
  const runners = [];

  Object.entries(standings).forEach(([groupId, table]) => {
    const w = table.find((r) => r.position === 1);
    const r = table.find((r) => r.position === 2);
    if (w) winners.push({ ...w, groupId, seed: `1${groupId}` });
    if (r) runners.push({ ...r, groupId, seed: `2${groupId}` });
  });

  const bestThirdRanking = computeBestThirdPlaceRanking(standings);
  const qualifiedThird = bestThirdRanking.filter((row) => row.qualifies);
  const thirdPlaceAssignments = assignThirdPlaceTeams(qualifiedThird);

  return {
    winners,
    runners,
    qualifiedThird,
    thirdPlaceAssignments,
    standings,
    groupStageComplete: isGroupStageComplete(fixtures),
  };
}

function resolveWinnerRunnerToken(token, participants) {
  if (token.startsWith('1') || token.startsWith('2')) {
    const pos = token[0] === '1' ? 1 : 2;
    const gid = token.slice(1);
    const pool = pos === 1 ? participants.winners : participants.runners;
    const hit = pool.find((p) => p.groupId === gid);
    return hit?.teamId || 'TBD';
  }
  return 'TBD';
}

function resolveThirdPlaceToken(token, r32Slot, side, participants) {
  if (!token.startsWith('3')) return 'TBD';
  return getAssignmentForSlot(participants.thirdPlaceAssignments, r32Slot, side);
}

function resolveR32SlotToken(token, r32Slot, side, participants) {
  if (token.startsWith('3')) {
    return resolveThirdPlaceToken(token, r32Slot, side, participants);
  }
  return resolveWinnerRunnerToken(token, participants);
}

export function populateKnockoutFromGroups(groups, fixtures, knockoutMatches) {
  const participants = buildGroupParticipants(groups, fixtures);
  let matches = knockoutMatches.map((m) => normalizeKnockoutMatch(m));

  matches = matches.map((m) => {
    if (m.roundId !== 'r32') return m;
    const pair = R32_PAIRING[m.slot - 1];
    if (!pair) return m;
    return {
      ...m,
      homeTeamId: resolveR32SlotToken(pair[0], m.slot, 'home', participants),
      awayTeamId: resolveR32SlotToken(pair[1], m.slot, 'away', participants),
      homeSource: pair[0],
      awaySource: pair[1],
      homeSourceLabel: seedLabel(pair[0]),
      awaySourceLabel: seedLabel(pair[1]),
    };
  });

  return propagateKnockoutWinners(matches);
}

function getFeedSide(sourceMatchId, targetMatch) {
  if (!targetMatch?.feedsFrom) return 'home';
  const idx = targetMatch.feedsFrom.indexOf(sourceMatchId);
  return idx === 1 ? 'away' : 'home';
}

function applyFeedSlot(match, feedId, byId) {
  const side = getFeedSide(feedId, match);
  const source = byId[feedId];
  if (!source) return match;

  const outcome = resolveKnockoutOutcome(source);
  if (!outcome.complete) {
    return {
      ...match,
      [`${side}TeamId`]: 'TBD',
      [`${side}SourceLabel`]: null,
    };
  }

  const useLoser = match.roundId === 'third';
  const teamId = useLoser
    ? (source.loserTeamId ?? outcome.loser)
    : outcome.winner;
  const prefix = useLoser ? 'Loser' : 'Winner';

  return {
    ...match,
    [`${side}TeamId`]: teamId,
    [`${side}SourceLabel`]: `${prefix} ${source.label}`,
  };
}

/** Populate each slot from its feeder match; incomplete feeders leave TBD. */
function populateMatchFromFeeds(match, byId) {
  if (!match.feedsFrom || match.roundId === 'r32') return match;

  const [feedA, feedB] = match.feedsFrom;
  let next = match;
  next = applyFeedSlot(next, feedA, byId);
  next = applyFeedSlot(next, feedB, byId);
  return next;
}

function annotateOutcomes(match) {
  const outcome = resolveKnockoutOutcome(match);
  if (!outcome.complete) {
    return { ...match, winnerTeamId: null, loserTeamId: null };
  }
  return { ...match, winnerTeamId: outcome.winner, loserTeamId: outcome.loser };
}

export function propagateKnockoutWinners(knockoutMatches) {
  const roundOrder = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];
  const byId = Object.fromEntries(
    knockoutMatches.map((m) => [m.id, normalizeKnockoutMatch(m)]),
  );

  roundOrder.forEach((roundId) => {
    knockoutMatches
      .filter((m) => m.roundId === roundId)
      .forEach((match) => {
        const current = byId[match.id];
        const populated = populateMatchFromFeeds(current, byId);
        byId[match.id] = annotateOutcomes(populated);
      });
  });

  return Object.values(byId).sort((a, b) => {
    const ri = roundOrder.indexOf(a.roundId) - roundOrder.indexOf(b.roundId);
    if (ri !== 0) return ri;
    return a.slot - b.slot;
  });
}

export function groupKnockoutByRound(matches) {
  return matches.reduce((acc, m) => {
    if (!acc[m.roundId]) acc[m.roundId] = [];
    acc[m.roundId].push(m);
    return acc;
  }, {});
}

export function buildMatchIndex(matches) {
  return Object.fromEntries(matches.map((m) => [m.id, m]));
}

export function findNextMatch(match, matchIndex) {
  return Object.values(matchIndex).find(
    (candidate) => candidate.feedsFrom?.includes(match.id) && candidate.roundId !== 'third',
  );
}

/** Match IDs on the champion's winning path (for UI highlighting). */
export function computeChampionPath(matches, championTeamId) {
  if (!championTeamId || championTeamId === 'TBD') return new Set();

  const byId = buildMatchIndex(matches);
  const path = new Set();

  function walk(matchId) {
    const match = byId[matchId];
    if (!match || match.winnerTeamId !== championTeamId) return;
    path.add(matchId);
    match.feedsFrom?.forEach((sourceId) => walk(sourceId));
  }

  const finalMatch = matches.find((m) => m.roundId === 'final');
  if (finalMatch) walk(finalMatch.id);

  matches
    .filter((m) => m.roundId === 'r32' && m.winnerTeamId === championTeamId)
    .forEach((m) => path.add(m.id));

  return path;
}

export function getNextMatchLabel(match, matchIndex) {
  const next = findNextMatch(match, matchIndex);
  return next?.label ?? null;
}
