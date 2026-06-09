import { POINTS, MATCH_STATUS } from '../config';
import { buildHeadToHeadMap, compareTeams } from './tiebreakers';

function emptyRow(teamId) {
  return {
    teamId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0,
    fairPlayPoints: 0,
    form: [],
  };
}

export function computeGroupStandings(groupId, teamIds, fixtures) {
  const groupFixtures = fixtures.filter(
    (f) => f.groupId === groupId && f.phase === 'group',
  );
  const rows = Object.fromEntries(teamIds.map((id) => [id, emptyRow(id)]));

  groupFixtures.forEach((match) => {
    if (match.status !== MATCH_STATUS.COMPLETED) return;
    const { home, away } = match.score;
    if (home == null || away == null) return;

    const h = rows[match.homeTeamId];
    const a = rows[match.awayTeamId];
    [h, a].forEach((r) => { r.played += 1; });

    h.goalsFor += home;
    h.goalsAgainst += away;
    a.goalsFor += away;
    a.goalsAgainst += home;

    if (home > away) {
      h.won += 1;
      a.lost += 1;
      h.points += POINTS.WIN;
      a.points += POINTS.LOSS;
      h.form.push('W');
      a.form.push('L');
    } else if (home < away) {
      a.won += 1;
      h.lost += 1;
      a.points += POINTS.WIN;
      h.points += POINTS.LOSS;
      h.form.push('L');
      a.form.push('W');
    } else {
      h.drawn += 1;
      a.drawn += 1;
      h.points += POINTS.DRAW;
      a.points += POINTS.DRAW;
      h.form.push('D');
      a.form.push('D');
    }

    h.goalDifference = h.goalsFor - h.goalsAgainst;
    a.goalDifference = a.goalsFor - a.goalsAgainst;
  });

  const h2hMap = buildHeadToHeadMap(groupFixtures, teamIds);
  const sorted = teamIds
    .map((id) => rows[id])
    .sort((x, y) => compareTeams(x, y, h2hMap))
    .map((row, index) => ({ ...row, position: index + 1 }));

  return sorted;
}

export function computeAllGroupStandings(groups, fixtures) {
  return Object.entries(groups).reduce((acc, [groupId, teamIds]) => {
    acc[groupId] = computeGroupStandings(groupId, teamIds, fixtures);
    return acc;
  }, {});
}
