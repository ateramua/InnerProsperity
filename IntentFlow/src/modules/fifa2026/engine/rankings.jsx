import { compareTeams, compareThirdPlaceTeams } from './tiebreakers';
import {
  QUALIFICATION_STATUS,
  buildQualificationSnapshot,
} from './qualification';

const QUALIFICATION_TIER = {
  [QUALIFICATION_STATUS.QUALIFIED]: 3,
  [QUALIFICATION_STATUS.CONDITIONAL]: 2,
  [QUALIFICATION_STATUS.ELIMINATED]: 1,
};

/**
 * Tournament-wide rankings aligned with WC 2026 qualification rules.
 */
export function computeOverallRankings(groups, fixtures, snapshot = null) {
  const qualification = snapshot ?? buildQualificationSnapshot(groups, fixtures);
  const { groupStandings, bestThirdPlace } = qualification;

  const thirdRankByTeam = Object.fromEntries(
    bestThirdPlace.map((row) => [row.teamId, row.thirdPlaceRank]),
  );

  const rows = [];
  Object.entries(groupStandings).forEach(([groupId, table]) => {
    table.forEach((row) => {
      rows.push({
        ...row,
        groupId,
        qualificationStatus: row.qualificationStatus,
        thirdPlaceRank: row.position === 3 ? thirdRankByTeam[row.teamId] ?? null : null,
      });
    });
  });

  return rows
    .sort((a, b) => compareOverallRankRows(a, b))
    .map((row, index) => ({
      ...row,
      overallRank: index + 1,
    }));
}

function compareOverallRankRows(a, b) {
  const tierDiff =
    (QUALIFICATION_TIER[b.qualificationStatus] ?? 0)
    - (QUALIFICATION_TIER[a.qualificationStatus] ?? 0);
  if (tierDiff !== 0) return tierDiff;

  if (a.position !== b.position) return a.position - b.position;

  if (a.position === 3 && b.position === 3) {
    const rankDiff = (a.thirdPlaceRank ?? 99) - (b.thirdPlaceRank ?? 99);
    if (rankDiff !== 0) return rankDiff;
    return compareThirdPlaceTeams(a, b);
  }

  return compareTeams(a, b);
}
