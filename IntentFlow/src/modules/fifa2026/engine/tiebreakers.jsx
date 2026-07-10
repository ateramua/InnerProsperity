/**
 * FIFA group-stage tiebreakers (simplified official order):
 * 1. Points  2. Goal difference  3. Goals scored  4. Head-to-head (mini-league)
 * 5. Fair play  6. FIFA ranking (final tie-breaker)
 */
import { getFifaRanking } from '../data/countryMeta';

export function compareTeams(a, b, h2hMap = new Map()) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;

  const h2h = h2hMap.get(pairKey(a.teamId, b.teamId));
  if (h2h) {
    if (h2h[b.teamId].points !== h2h[a.teamId].points) {
      return h2h[b.teamId].points - h2h[a.teamId].points;
    }
    if (h2h[b.teamId].goalDifference !== h2h[a.teamId].goalDifference) {
      return h2h[b.teamId].goalDifference - h2h[a.teamId].goalDifference;
    }
    if (h2h[b.teamId].goalsFor !== h2h[a.teamId].goalsFor) {
      return h2h[b.teamId].goalsFor - h2h[a.teamId].goalsFor;
    }
  }

  if (a.fairPlayPoints !== b.fairPlayPoints) return a.fairPlayPoints - b.fairPlayPoints;
  return getFifaRanking(a.teamId) - getFifaRanking(b.teamId);
}

/** Cross-group third-place ranking — no head-to-head between groups. */
export function compareThirdPlaceTeams(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
  if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
  if (a.fairPlayPoints !== b.fairPlayPoints) return a.fairPlayPoints - b.fairPlayPoints;
  return getFifaRanking(a.teamId) - getFifaRanking(b.teamId);
}

export function pairKey(a, b) {
  return [a, b].sort().join('|');
}

export function buildHeadToHeadMap(fixtures, teamIds) {
  const completed = fixtures.filter(
    (f) => f.status === 'completed' && teamIds.includes(f.homeTeamId) && teamIds.includes(f.awayTeamId),
  );

  const tiedSets = new Map();
  const ids = teamIds.join('|');

  const init = () => {
    const row = {};
    teamIds.forEach((id) => {
      row[id] = { points: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0, played: 0 };
    });
    return row;
  };

  if (!tiedSets.has(ids)) tiedSets.set(ids, init());

  completed.forEach((m) => {
    const { home, away } = m.score;
    const table = tiedSets.get(ids);
    const h = table[m.homeTeamId];
    const a = table[m.awayTeamId];
    h.played += 1;
    a.played += 1;
    h.goalsFor += home;
    h.goalsAgainst += away;
    a.goalsFor += away;
    a.goalsAgainst += home;
    h.goalDifference = h.goalsFor - h.goalsAgainst;
    a.goalDifference = a.goalsFor - a.goalsAgainst;

    if (home > away) {
      h.points += 3;
    } else if (home < away) {
      a.points += 3;
    } else {
      h.points += 1;
      a.points += 1;
    }
  });

  const h2hPairs = new Map();
  for (let i = 0; i < teamIds.length; i += 1) {
    for (let j = i + 1; j < teamIds.length; j += 1) {
      h2hPairs.set(pairKey(teamIds[i], teamIds[j]), tiedSets.get(ids));
    }
  }
  return h2hPairs;
}
