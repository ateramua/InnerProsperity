import { MATCH_STATUS } from '../config';
import { seedLabel } from '../data/countryMeta';
import { computeAllGroupStandings } from './standings';

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

  return { winners, runners, standings };
}

/** R32: Winner A vs Runner-up B, Winner C vs Runner-up D, … then mirrored pairs. */
const R32_PAIRING = [
  ['1A', '2B'], ['1C', '2D'], ['1E', '2F'], ['1G', '2H'],
  ['1I', '2J'], ['1K', '2L'], ['1B', '2A'], ['1D', '2C'],
  ['1F', '2E'], ['1H', '2G'], ['1J', '2I'], ['1L', '2K'],
  ['1A', '2C'], ['1E', '2G'], ['1I', '2K'], ['1B', '2D'],
];

function resolveSeedToken(token, participants) {
  if (token.startsWith('1') || token.startsWith('2')) {
    const pos = token[0] === '1' ? 1 : 2;
    const gid = token.slice(1);
    const pool = pos === 1 ? participants.winners : participants.runners;
    const hit = pool.find((p) => p.groupId === gid);
    return hit?.teamId || 'TBD';
  }
  return 'TBD';
}

export function populateKnockoutFromGroups(groups, fixtures, knockoutMatches) {
  const participants = buildGroupParticipants(groups, fixtures);
  let matches = knockoutMatches.map((m) => ({ ...m }));

  matches = matches.map((m) => {
    if (m.roundId !== 'r32') return m;
    const pair = R32_PAIRING[m.slot - 1];
    if (!pair) return m;
    return {
      ...m,
      homeTeamId: resolveSeedToken(pair[0], participants),
      awayTeamId: resolveSeedToken(pair[1], participants),
      homeSource: pair[0],
      awaySource: pair[1],
      homeSourceLabel: seedLabel(pair[0]),
      awaySourceLabel: seedLabel(pair[1]),
    };
  });

  return propagateKnockoutWinners(matches);
}

export function propagateKnockoutWinners(knockoutMatches) {
  const byId = Object.fromEntries(knockoutMatches.map((m) => [m.id, { ...m }]));
  const roundOrder = ['r32', 'r16', 'qf', 'sf', 'third', 'final'];

  roundOrder.forEach((roundId) => {
    knockoutMatches
      .filter((m) => m.roundId === roundId)
      .forEach((match) => {
        const current = byId[match.id];

        if (roundId !== 'r32' && roundId !== 'third' && current.feedsFrom) {
          const [feedA, feedB] = current.feedsFrom;
          const srcA = byId[feedA];
          const srcB = byId[feedB];
          if (srcA?.status === MATCH_STATUS.COMPLETED && srcB?.status === MATCH_STATUS.COMPLETED) {
            const winnerA = getWinner(srcA);
            const winnerB = getWinner(srcB);
            if (winnerA && winnerB) {
              byId[current.id] = {
                ...current,
                homeTeamId: winnerA,
                awayTeamId: winnerB,
                homeSourceLabel: `Winner ${srcA.label}`,
                awaySourceLabel: `Winner ${srcB.label}`,
              };
            }
          }
        }

        if (current.status !== MATCH_STATUS.COMPLETED) return;
        const { home, away } = current.score;
        if (home == null || away == null) return;

        const winner = home > away ? current.homeTeamId : away > home ? current.awayTeamId : null;
        const loser = home > away ? current.awayTeamId : away > home ? current.homeTeamId : null;
        if (!winner) return;

        if (current.winnerAdvancesTo) {
          const target = byId[current.winnerAdvancesTo];
          if (target) {
            const side = target.homeTeamId === 'TBD' ? 'home' : target.awayTeamId === 'TBD' ? 'away' : 'home';
            byId[current.winnerAdvancesTo] = {
              ...target,
              [`${side}TeamId`]: winner,
            };
          }
        }

        if (roundId === 'sf' && loser) {
          const thirdMatch = Object.values(byId).find((m) => m.roundId === 'third');
          if (thirdMatch) {
            const side = current.slot === 1 ? 'home' : 'away';
            byId[thirdMatch.id] = {
              ...thirdMatch,
              [`${side}TeamId`]: loser,
              [`${side}SourceLabel`]: `Loser ${current.label}`,
            };
          }
        }
      });
  });

  return Object.values(byId).sort((a, b) => {
    const ri = roundOrder.indexOf(a.roundId) - roundOrder.indexOf(b.roundId);
    if (ri !== 0) return ri;
    return a.slot - b.slot;
  });
}

function getWinner(match) {
  if (match.status !== MATCH_STATUS.COMPLETED) return null;
  const { home, away } = match.score;
  if (home == null || away == null) return null;
  if (home > away) return match.homeTeamId;
  if (away > home) return match.awayTeamId;
  return null;
}

export function groupKnockoutByRound(matches) {
  return matches.reduce((acc, m) => {
    if (!acc[m.roundId]) acc[m.roundId] = [];
    acc[m.roundId].push(m);
    return acc;
  }, {});
}
