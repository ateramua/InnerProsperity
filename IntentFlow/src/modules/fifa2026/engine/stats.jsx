import { MATCH_STATUS } from '../config';

function goalsFromMatches(matches) {
  const byTeam = {};

  matches.forEach((m) => {
    if (m.status !== MATCH_STATUS.COMPLETED) return;
    const { home, away } = m.score;
    if (home == null || away == null) return;

    byTeam[m.homeTeamId] = (byTeam[m.homeTeamId] || 0) + home;
    byTeam[m.awayTeamId] = (byTeam[m.awayTeamId] || 0) + away;
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
  let champion = null;
  if (final?.status === MATCH_STATUS.COMPLETED) {
    const { home, away } = final.score;
    if (home != null && away != null && home !== away) {
      champion = home > away ? final.homeTeamId : final.awayTeamId;
    }
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
