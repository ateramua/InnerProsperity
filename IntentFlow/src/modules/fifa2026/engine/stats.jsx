import { MATCH_STATUS } from '../config';
import { resolveKnockoutOutcome } from './knockoutResolution';

function goalsFromMatches(matches) {
  const byTeam = {};

  matches.forEach((m) => {
    if (m.status !== MATCH_STATUS.COMPLETED) return;
    const { home, away } = m.score ?? {};
    if (home == null || away == null) return;

    byTeam[m.homeTeamId] = (byTeam[m.homeTeamId] || 0) + home;
    byTeam[m.awayTeamId] = (byTeam[m.awayTeamId] || 0) + away;

    if (m.extraTime) {
      byTeam[m.homeTeamId] += m.extraTime.home ?? 0;
      byTeam[m.awayTeamId] += m.extraTime.away ?? 0;
    }
  });

  return byTeam;
}

export function computeTournamentStats(state) {
  const allMatches = [...state.fixtures, ...state.knockoutMatches];
  const completed = allMatches.filter((m) => m.status === MATCH_STATUS.COMPLETED);
  const goalsByTeam = goalsFromMatches(allMatches);

  const topScorerEntry = Object.entries(goalsByTeam)
    .filter(([id]) => id !== 'TBD')
    .sort((a, b) => b[1] - a[1])[0];

  const totalGoals = Object.values(goalsByTeam).reduce((sum, g) => sum + g, 0);
  const knockoutTotal = state.knockoutMatches.length;
  const knockoutCompleted = state.knockoutMatches.filter((m) => m.status === MATCH_STATUS.COMPLETED).length;

  const final = state.knockoutMatches.find((m) => m.roundId === 'final');
  let champion = final?.winnerTeamId ?? null;
  if (!champion && final?.status === MATCH_STATUS.COMPLETED) {
    const outcome = resolveKnockoutOutcome(final);
    champion = outcome.winner;
  }

  return {
    totalGoals,
    matchesPlayed: completed.length,
    totalMatches: allMatches.length,
    topScorer: topScorerEntry ? { teamId: topScorerEntry[0], goals: topScorerEntry[1] } : null,
    knockoutCompleted,
    knockoutTotal,
    knockoutProgress: knockoutTotal ? Math.round((knockoutCompleted / knockoutTotal) * 100) : 0,
    champion,
  };
}
