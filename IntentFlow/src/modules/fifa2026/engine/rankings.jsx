import { compareTeams } from './tiebreakers';
import { computeAllGroupStandings } from './standings';

/**
 * Overall tournament ranking across all teams (for Rankings tab).
 * Group position weighted: 1st=12 pts, 2nd=8, 3rd=4, 4th=0 bonus on top of group stats.
 */
export function computeOverallRankings(groups, fixtures) {
  const standings = computeAllGroupStandings(groups, fixtures);
  const rows = [];

  Object.entries(standings).forEach(([groupId, table]) => {
    const positionBonus = { 1: 12, 2: 8, 3: 4, 4: 0 };
    table.forEach((row) => {
      rows.push({
        ...row,
        groupId,
        rankingScore: row.points * 10 + positionBonus[row.position] + row.goalDifference,
      });
    });
  });

  return rows.sort((a, b) => {
    if (b.rankingScore !== a.rankingScore) return b.rankingScore - a.rankingScore;
    return compareTeams(a, b);
  }).map((row, index) => ({
    ...row,
    overallRank: index + 1,
  }));
}
