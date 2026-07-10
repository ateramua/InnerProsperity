/**
 * Unit tests for FIFA 2026 knockout bracket engine.
 * Run: npm run test:fifa-knockout
 */
import assert from 'node:assert/strict';
import { MATCH_STATUS } from '../src/modules/fifa2026/config.jsx';
import { assignThirdPlaceTeams, buildCombinationKey } from '../src/modules/fifa2026/data/thirdPlaceAllocationMatrix.jsx';
import {
  applyKnockoutMatchResult,
  resolveKnockoutOutcome,
  validateKnockoutResultInput,
} from '../src/modules/fifa2026/engine/knockoutResolution.jsx';
import {
  populateKnockoutFromGroups,
  propagateKnockoutWinners,
  computeChampionPath,
  findNextMatch,
  buildMatchIndex,
} from '../src/modules/fifa2026/engine/knockout.jsx';
import { createInitialTournamentState } from '../src/modules/fifa2026/data/wc2026Seed.jsx';
import { getBracketSide } from '../src/modules/fifa2026/data/bracketLayout.jsx';
import { recalculateTournament } from '../src/modules/fifa2026/engine/recalculate.jsx';

function koMatch(id, roundId, slot, home, away, extra = {}) {
  return {
    id,
    phase: 'knockout',
    roundId,
    slot,
    label: id,
    homeTeamId: home,
    awayTeamId: away,
    status: MATCH_STATUS.SCHEDULED,
    score: { home: null, away: null },
    ...extra,
  };
}

// Third-place assignment by group (not ranking order)
const qualified = [
  { teamId: 'T1', groupId: 'B' },
  { teamId: 'T2', groupId: 'D' },
  { teamId: 'T3', groupId: 'E' },
  { teamId: 'T4', groupId: 'F' },
  { teamId: 'T5', groupId: 'I' },
  { teamId: 'T6', groupId: 'J' },
  { teamId: 'T7', groupId: 'K' },
  { teamId: 'T8', groupId: 'L' },
];
const assignments = assignThirdPlaceTeams(qualified);
assert.equal(assignments.size, 8);
assert.equal(buildCombinationKey(qualified.map((t) => t.groupId)), 'BDEFIJKL');

// Regulation winner
const regWin = applyKnockoutMatchResult(
  koMatch('m1', 'r32', 1, 'A', 'B'),
  { homeScore: 2, awayScore: 1 },
);
assert.equal(regWin.winnerTeamId, 'A');
assert.equal(regWin.loserTeamId, 'B');

// Extra time winner
const etWin = applyKnockoutMatchResult(
  koMatch('m2', 'r16', 1, 'C', 'D'),
  { homeScore: 1, awayScore: 1, extraTime: { home: 1, away: 0 } },
);
assert.equal(etWin.winnerTeamId, 'C');
assert.equal(resolveKnockoutOutcome(etWin).reason, 'extra_time');

// Penalties winner
const penWin = applyKnockoutMatchResult(
  koMatch('m3', 'qf', 1, 'E', 'F'),
  {
    homeScore: 0,
    awayScore: 0,
    extraTime: { home: 0, away: 0 },
    penalties: { home: 4, away: 3 },
  },
);
assert.equal(penWin.winnerTeamId, 'E');
assert.equal(resolveKnockoutOutcome(penWin).reason, 'penalties');

// Draw without extra time — validation message (no crash)
const drawValidation = validateKnockoutResultInput({ homeScore: 1, awayScore: 1 });
assert.equal(drawValidation.ok, false);
assert.match(drawValidation.message, /cannot end in a draw/i);

assert.throws(
  () => applyKnockoutMatchResult(koMatch('m4', 'r32', 2, 'G', 'H'), { homeScore: 1, awayScore: 1 }),
  /cannot end in a draw/i,
);

// Bracket progression R32 -> R16
let bracket = [
  koMatch('ko-r32-1', 'r32', 1, 'AAA', 'BBB', {
    winnerAdvancesTo: 'ko-r16-1',
    feedsFrom: null,
    status: MATCH_STATUS.COMPLETED,
    score: { home: 2, away: 0 },
    winnerTeamId: 'AAA',
    loserTeamId: 'BBB',
  }),
  koMatch('ko-r32-2', 'r32', 2, 'CCC', 'DDD', {
    winnerAdvancesTo: 'ko-r16-1',
    feedsFrom: null,
    status: MATCH_STATUS.COMPLETED,
    score: { home: 1, away: 0 },
    winnerTeamId: 'CCC',
    loserTeamId: 'DDD',
  }),
  koMatch('ko-r16-1', 'r16', 1, 'TBD', 'TBD', {
    winnerAdvancesTo: 'ko-qf-1',
    feedsFrom: ['ko-r32-1', 'ko-r32-2'],
  }),
  koMatch('ko-qf-1', 'qf', 1, 'TBD', 'TBD', {
    feedsFrom: ['ko-r16-1', 'ko-r16-2'],
  }),
];

bracket = propagateKnockoutWinners(bracket);
const r16 = bracket.find((m) => m.id === 'ko-r16-1');
assert.equal(r16.homeTeamId, 'AAA');
assert.equal(r16.awayTeamId, 'CCC');

// SF losers -> third place
bracket = [
  koMatch('ko-sf-1', 'sf', 1, 'W1', 'W2', {
    feedsFrom: ['ko-qf-1', 'ko-qf-2'],
    winnerAdvancesTo: 'ko-final-1',
    status: MATCH_STATUS.COMPLETED,
    score: { home: 2, away: 1 },
    winnerTeamId: 'W1',
    loserTeamId: 'W2',
  }),
  koMatch('ko-sf-2', 'sf', 2, 'X1', 'X2', {
    feedsFrom: ['ko-qf-3', 'ko-qf-4'],
    winnerAdvancesTo: 'ko-final-1',
    status: MATCH_STATUS.COMPLETED,
    score: { home: 0, away: 1 },
    winnerTeamId: 'X2',
    loserTeamId: 'X1',
  }),
  koMatch('ko-third-1', 'third', 1, 'TBD', 'TBD', { feedsFrom: ['ko-sf-1', 'ko-sf-2'] }),
  koMatch('ko-final-1', 'final', 1, 'TBD', 'TBD', { feedsFrom: ['ko-sf-1', 'ko-sf-2'] }),
];
bracket = propagateKnockoutWinners(bracket);
const third = bracket.find((m) => m.id === 'ko-third-1');
const final = bracket.find((m) => m.id === 'ko-final-1');
assert.equal(third.homeTeamId, 'W2');
assert.equal(third.awayTeamId, 'X1');
assert.equal(final.homeTeamId, 'W1');
assert.equal(final.awayTeamId, 'X2');

// Champion path (requires completed final)
bracket = propagateKnockoutWinners([
  ...bracket.filter((m) => m.id !== 'ko-final-1'),
  {
    ...bracket.find((m) => m.id === 'ko-final-1'),
    homeTeamId: 'W1',
    awayTeamId: 'X2',
    status: MATCH_STATUS.COMPLETED,
    score: { home: 2, away: 1 },
    winnerTeamId: 'W1',
    loserTeamId: 'X2',
  },
]);
const path = computeChampionPath(bracket, 'W1');
assert.ok(path.has('ko-final-1'));
assert.ok(path.has('ko-sf-1'));

// Populate R32 from groups (smoke)
const state = createInitialTournamentState();
const populated = populateKnockoutFromGroups(state.groups, state.fixtures, state.knockoutMatches);
assert.equal(populated.filter((m) => m.roundId === 'r32').length, 16);

// Brazil (right R32) advances to right R16 only
let brazilState = recalculateTournament({
  ...state,
  resultOverrides: {
    'ko-r32-4': {
      status: MATCH_STATUS.COMPLETED,
      score: { home: 2, away: 0 },
      winnerTeamId: 'BRA',
      loserTeamId: 'JPN',
    },
  },
});
const brazilR16 = brazilState.knockoutMatches.find(
  (m) => m.roundId === 'r16' && (m.homeTeamId === 'BRA' || m.awayTeamId === 'BRA'),
);
assert.ok(brazilR16, 'Brazil should appear in a Round of 16 match');
assert.equal(brazilR16.id, 'ko-r16-5');
assert.equal(getBracketSide('ko-r32-4'), 'right');
assert.equal(getBracketSide(brazilR16.id), 'right');

// Wrong winnerAdvancesTo on a completed match must not misroute winners
let staleBracket = createInitialTournamentState().knockoutMatches.map((m) => ({ ...m }));
const staleR32 = staleBracket.find((m) => m.id === 'ko-r32-4');
Object.assign(staleR32, {
  homeTeamId: 'BRA',
  awayTeamId: 'JPN',
  status: MATCH_STATUS.COMPLETED,
  score: { home: 2, away: 0 },
  winnerTeamId: 'BRA',
  loserTeamId: 'JPN',
  winnerAdvancesTo: 'ko-r16-1',
});
staleBracket = propagateKnockoutWinners(staleBracket);
const staleBrazilR16 = staleBracket.find(
  (m) => m.roundId === 'r16' && (m.homeTeamId === 'BRA' || m.awayTeamId === 'BRA'),
);
assert.equal(staleBrazilR16?.id, 'ko-r16-5');

// Every R32 winner stays on the same bracket half through R16, QF, and SF
const skeleton = createInitialTournamentState().knockoutMatches;
const matchIndex = buildMatchIndex(skeleton);
skeleton
  .filter((m) => m.roundId === 'r32')
  .forEach((r32Match) => {
    const startSide = getBracketSide(r32Match.id);
    let current = r32Match;
    for (const roundId of ['r16', 'qf', 'sf']) {
      const next = findNextMatch(current, matchIndex);
      assert.ok(next, `${current.id} should feed a ${roundId} match`);
      assert.equal(next.roundId, roundId);
      assert.equal(getBracketSide(next.id), startSide, `${current.id} must stay on ${startSide} at ${next.id}`);
      current = next;
    }
    const final = findNextMatch(current, matchIndex);
    assert.equal(final?.roundId, 'final');
  });

// Confirmed R32 matchups (post group stage)
const r32State = recalculateTournament(createInitialTournamentState());
const r32Chrono = r32State.knockoutMatches
  .filter((m) => m.roundId === 'r32')
  .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
const expectedR32 = [
  ['RSA', 'CAN'],
  ['BRA', 'JPN'],
  ['GER', 'PAR'],
  ['NED', 'MAR'],
  ['CIV', 'NOR'],
  ['FRA', 'SWE'],
  ['MEX', 'ECU'],
  ['ENG', 'COD'],
  ['BEL', 'SEN'],
  ['USA', 'BIH'],
  ['ESP', 'AUT'],
  ['POR', 'CRO'],
  ['SUI', 'ALG'],
  ['AUS', 'EGY'],
  ['ARG', 'CPV'],
  ['COL', 'GHA'],
];
assert.equal(r32Chrono.length, 16);
expectedR32.forEach(([home, away], i) => {
  assert.equal(r32Chrono[i].homeTeamId, home, `R32 chrono ${i + 1} home`);
  assert.equal(r32Chrono[i].awayTeamId, away, `R32 chrono ${i + 1} away`);
});

console.log('✓ FIFA knockout bracket engine tests passed');
