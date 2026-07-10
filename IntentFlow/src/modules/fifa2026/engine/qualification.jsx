import { MATCH_STATUS } from '../config';
import { compareThirdPlaceTeams } from './tiebreakers';
import { computeAllGroupStandings } from './standings';

export const QUALIFICATION_STATUS = {
  QUALIFIED: 'qualified',
  CONDITIONAL: 'conditional',
  ELIMINATED: 'eliminated',
};

export const THIRD_PLACE_SLOTS = 8;

export function isGroupStageComplete(fixtures) {
  const groupFixtures = fixtures.filter((f) => f.phase === 'group');
  if (groupFixtures.length === 0) return false;
  return groupFixtures.every((f) => f.status === MATCH_STATUS.COMPLETED);
}

/**
 * Collect 3rd-place teams from every group and rank them globally.
 * Tie-breakers: points → GD → GF → fair play → FIFA ranking.
 */
export function computeBestThirdPlaceRanking(groupStandings) {
  const thirdPlacers = [];

  Object.entries(groupStandings).forEach(([groupId, table]) => {
    const third = table.find((row) => row.position === 3);
    if (third) {
      thirdPlacers.push({ ...third, groupId });
    }
  });

  return thirdPlacers
    .sort((a, b) => compareThirdPlaceTeams(a, b))
    .map((row, index) => ({
      ...row,
      thirdPlaceRank: index + 1,
      qualifies: index < THIRD_PLACE_SLOTS,
    }));
}

export function annotateStandingsWithQualification(groupStandings, bestThirdPlace, groupStageComplete) {
  const qualifiedThirdIds = new Set(
    bestThirdPlace.filter((row) => row.qualifies).map((row) => row.teamId),
  );

  return Object.fromEntries(
    Object.entries(groupStandings).map(([groupId, table]) => [
      groupId,
      table.map((row) => ({
        ...row,
        qualificationStatus: resolveQualificationStatus(
          row,
          qualifiedThirdIds,
          groupStageComplete,
        ),
      })),
    ]),
  );
}

function resolveQualificationStatus(row, qualifiedThirdIds, groupStageComplete) {
  if (row.position <= 2) return QUALIFICATION_STATUS.QUALIFIED;
  if (row.position === 4) return QUALIFICATION_STATUS.ELIMINATED;

  if (!groupStageComplete) return QUALIFICATION_STATUS.CONDITIONAL;

  return qualifiedThirdIds.has(row.teamId)
    ? QUALIFICATION_STATUS.QUALIFIED
    : QUALIFICATION_STATUS.ELIMINATED;
}

export function computeQualificationSummary(groups, fixtures, groupStandings, bestThirdPlace) {
  const groupWinners = [];
  const groupRunnersUp = [];

  Object.entries(groupStandings).forEach(([groupId, table]) => {
    const winner = table.find((row) => row.position === 1);
    const runner = table.find((row) => row.position === 2);
    if (winner) groupWinners.push({ ...winner, groupId, slot: `1${groupId}` });
    if (runner) groupRunnersUp.push({ ...runner, groupId, slot: `2${groupId}` });
  });

  const qualifiedThird = bestThirdPlace.filter((row) => row.qualifies);
  const eliminatedThird = bestThirdPlace.filter((row) => !row.qualifies);

  return {
    groupWinners: groupWinners.sort((a, b) => a.groupId.localeCompare(b.groupId)),
    groupRunnersUp: groupRunnersUp.sort((a, b) => a.groupId.localeCompare(b.groupId)),
    qualifiedThird,
    eliminatedThird,
    roundOf32: [
      ...groupWinners,
      ...groupRunnersUp,
      ...qualifiedThird,
    ].sort((a, b) => a.teamId.localeCompare(b.teamId)),
    totalQualified: groupWinners.length + groupRunnersUp.length + qualifiedThird.length,
    groupStageComplete: isGroupStageComplete(fixtures),
  };
}

export function buildQualificationSnapshot(groups, fixtures) {
  const groupStandings = computeAllGroupStandings(groups, fixtures);
  const groupStageComplete = isGroupStageComplete(fixtures);
  const bestThirdPlace = computeBestThirdPlaceRanking(groupStandings);
  const annotatedStandings = annotateStandingsWithQualification(
    groupStandings,
    bestThirdPlace,
    groupStageComplete,
  );
  const summary = computeQualificationSummary(
    groups,
    fixtures,
    groupStandings,
    bestThirdPlace,
  );

  return {
    groupStandings: annotatedStandings,
    bestThirdPlace,
    summary,
    groupStageComplete,
  };
}
