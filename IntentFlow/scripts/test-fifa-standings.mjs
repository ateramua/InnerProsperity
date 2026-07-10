/**
 * Unit tests for FIFA 2026 standings & qualification engine.
 * Run: npm run test:fifa-standings
 */
import assert from 'node:assert/strict';
import { MATCH_STATUS } from '../src/modules/fifa2026/config.jsx';
import { computeGroupStandings } from '../src/modules/fifa2026/engine/standings.jsx';
import { compareThirdPlaceTeams } from '../src/modules/fifa2026/engine/tiebreakers.jsx';
import {
  computeBestThirdPlaceRanking,
  annotateStandingsWithQualification,
  computeQualificationSummary,
  isGroupStageComplete,
  QUALIFICATION_STATUS,
  THIRD_PLACE_SLOTS,
} from '../src/modules/fifa2026/engine/qualification.jsx';
import { populateKnockoutFromGroups } from '../src/modules/fifa2026/engine/knockout.jsx';
import { computeOverallRankings } from '../src/modules/fifa2026/engine/rankings.jsx';
import { buildQualificationSnapshot } from '../src/modules/fifa2026/engine/qualification.jsx';
import { GROUPS } from '../src/modules/fifa2026/data/wc2026Seed.jsx';

function makeFixture(id, groupId, home, away, homeScore, awayScore) {
  return {
    id,
    phase: 'group',
    groupId,
    homeTeamId: home,
    awayTeamId: away,
    status: MATCH_STATUS.COMPLETED,
    score: { home: homeScore, away: awayScore },
  };
}

const groupA = ['MEX', 'RSA', 'CZE', 'KOR'];
const fixtures = [
  makeFixture('a1', 'A', 'MEX', 'RSA', 2, 0),
  makeFixture('a2', 'A', 'KOR', 'CZE', 2, 1),
  makeFixture('a3', 'A', 'MEX', 'KOR', 1, 1),
  makeFixture('a4', 'A', 'RSA', 'CZE', 0, 2),
  makeFixture('a5', 'A', 'CZE', 'MEX', 0, 3),
  makeFixture('a6', 'A', 'RSA', 'KOR', 1, 2),
];

const standings = computeGroupStandings('A', groupA, fixtures);
assert.equal(standings[0].teamId, 'MEX');
assert.equal(standings[0].position, 1);
assert.equal(standings[0].points, 7);
assert.equal(standings[0].goalsFor, 6);
assert.equal(standings[0].goalsAgainst, 1);
assert.equal(standings[3].position, 4);

const partialFixtures = fixtures.slice(0, 2);
const partialStandings = { A: computeGroupStandings('A', groupA, partialFixtures) };
const bestPartial = computeBestThirdPlaceRanking(partialStandings);
assert.equal(bestPartial.length, 1);
assert.equal(bestPartial[0].teamId, 'CZE');

const allGroups = { A: groupA, B: ['CAN', 'BIH', 'QAT', 'SUI'] };
const groupBFixtures = [
  makeFixture('b1', 'B', 'CAN', 'BIH', 1, 0),
  makeFixture('b2', 'B', 'QAT', 'SUI', 0, 2),
  makeFixture('b3', 'B', 'CAN', 'QAT', 2, 2),
  makeFixture('b4', 'B', 'BIH', 'SUI', 1, 1),
  makeFixture('b5', 'B', 'SUI', 'CAN', 0, 1),
  makeFixture('b6', 'B', 'BIH', 'QAT', 3, 0),
];
const combined = { A: standings, B: computeGroupStandings('B', allGroups.B, groupBFixtures) };
const bestThird = computeBestThirdPlaceRanking(combined);
assert.equal(bestThird.length, 2);
assert.equal(bestThird.filter((r) => r.qualifies).length, 2);
assert.equal(THIRD_PLACE_SLOTS, 8);

const annotated = annotateStandingsWithQualification(combined, bestThird, true);
assert.equal(annotated.A[0].qualificationStatus, QUALIFICATION_STATUS.QUALIFIED);
assert.equal(annotated.A[1].qualificationStatus, QUALIFICATION_STATUS.QUALIFIED);
assert.equal(annotated.A[2].qualificationStatus, QUALIFICATION_STATUS.QUALIFIED);
assert.equal(annotated.A[3].qualificationStatus, QUALIFICATION_STATUS.ELIMINATED);

const tieA = { teamId: 'ARG', points: 3, goalDifference: 0, goalsFor: 2, fairPlayPoints: 0 };
const tieB = { teamId: 'ZZZ', points: 3, goalDifference: 0, goalsFor: 2, fairPlayPoints: 0 };
assert.ok(compareThirdPlaceTeams(tieA, tieB) !== 0, 'FIFA ranking should break identical third-place ties');

const summary = computeQualificationSummary(allGroups, [...fixtures, ...groupBFixtures], combined, bestThird);
assert.equal(summary.groupWinners.length, 2);
assert.equal(summary.groupRunnersUp.length, 2);
assert.equal(summary.qualifiedThird.length, 2);
assert.equal(summary.totalQualified, 6);

assert.equal(isGroupStageComplete([{ phase: 'group', status: MATCH_STATUS.COMPLETED }]), true);
assert.equal(isGroupStageComplete([{ phase: 'group', status: MATCH_STATUS.SCHEDULED }]), false);

const knockoutSkeleton = [{ id: 'ko-r32-1', roundId: 'r32', slot: 1, homeTeamId: 'TBD', awayTeamId: 'TBD' }];
const populated = populateKnockoutFromGroups(GROUPS, fixtures.slice(0, 2), knockoutSkeleton);
assert.notEqual(populated[0].homeTeamId, 'TBD');

const snapshot = buildQualificationSnapshot(allGroups, [...fixtures, ...groupBFixtures]);
const rankings = computeOverallRankings(allGroups, [...fixtures, ...groupBFixtures], snapshot);
assert.equal(rankings.length, 8);
assert.equal(rankings[0].qualificationStatus, QUALIFICATION_STATUS.QUALIFIED);
assert.ok(rankings.filter((r) => r.qualificationStatus === QUALIFICATION_STATUS.ELIMINATED).length >= 2);
const thirdRows = rankings.filter((r) => r.position === 3);
assert.ok(thirdRows.every((r) => r.thirdPlaceRank != null));

console.log('✓ FIFA standings & qualification tests passed');
