import { useMemo, useState } from 'react';
import { KNOCKOUT_ROUNDS } from '../config';
import { useTournamentStore } from '../hooks/useTournamentStore';
import { FixtureRow } from './MatchScoreEditor';

const GROUPS = 'ABCDEFGHIJKL'.split('');

export default function FixturesTab() {
  const { state, submitResult } = useTournamentStore();
  const [phase, setPhase] = useState('group');
  const [filterGroup, setFilterGroup] = useState('all');
  const [filterMatchday, setFilterMatchday] = useState('all');
  const [filterRound, setFilterRound] = useState('all');

  const groupFixtures = useMemo(() => {
    let list = [...state.fixtures];
    if (filterGroup !== 'all') list = list.filter((f) => f.groupId === filterGroup);
    if (filterMatchday !== 'all') list = list.filter((f) => f.matchday === Number(filterMatchday));
    return list.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
  }, [state.fixtures, filterGroup, filterMatchday]);

  const knockoutFixtures = useMemo(() => {
    let list = [...state.knockoutMatches];
    if (filterRound !== 'all') list = list.filter((m) => m.roundId === filterRound);
    return list.sort((a, b) => {
      const roundOrder = KNOCKOUT_ROUNDS.map((r) => r.id);
      const rd = roundOrder.indexOf(a.roundId) - roundOrder.indexOf(b.roundId);
      if (rd !== 0) return rd;
      return a.slot - b.slot;
    });
  }, [state.knockoutMatches, filterRound]);

  return (
    <div>
      <div className="fifa2026-filter-bar">
        <button type="button" className={`fifa2026-chip ${phase === 'group' ? 'active' : ''}`} onClick={() => setPhase('group')}>Group Stage</button>
        <button type="button" className={`fifa2026-chip ${phase === 'knockout' ? 'active' : ''}`} onClick={() => setPhase('knockout')}>Knockout</button>
      </div>

      {phase === 'group' && (
        <>
          <div className="fifa2026-filter-bar">
            <span className="fifa2026-meta" style={{ alignSelf: 'center' }}>Group:</span>
            <button type="button" className={`fifa2026-chip ${filterGroup === 'all' ? 'active' : ''}`} onClick={() => setFilterGroup('all')}>All</button>
            {GROUPS.map((g) => (
              <button key={g} type="button" className={`fifa2026-chip ${filterGroup === g ? 'active' : ''}`} onClick={() => setFilterGroup(g)}>{g}</button>
            ))}
          </div>
          <div className="fifa2026-filter-bar">
            <span className="fifa2026-meta" style={{ alignSelf: 'center' }}>Matchday:</span>
            {[1, 2, 3].map((md) => (
              <button key={md} type="button" className={`fifa2026-chip ${filterMatchday === String(md) ? 'active' : ''}`} onClick={() => setFilterMatchday(String(md))}>MD {md}</button>
            ))}
            <button type="button" className={`fifa2026-chip ${filterMatchday === 'all' ? 'active' : ''}`} onClick={() => setFilterMatchday('all')}>All</button>
          </div>
          <div className="fifa2026-fixture-list">
            {groupFixtures.map((match) => (
              <FixtureRow key={match.id} match={match} onSubmit={submitResult} phase="group" />
            ))}
          </div>
        </>
      )}

      {phase === 'knockout' && (
        <>
          <div className="fifa2026-filter-bar">
            <span className="fifa2026-meta" style={{ alignSelf: 'center' }}>Round:</span>
            <button type="button" className={`fifa2026-chip ${filterRound === 'all' ? 'active' : ''}`} onClick={() => setFilterRound('all')}>All</button>
            {KNOCKOUT_ROUNDS.map((r) => (
              <button key={r.id} type="button" className={`fifa2026-chip ${filterRound === r.id ? 'active' : ''}`} onClick={() => setFilterRound(r.id)}>{r.label}</button>
            ))}
          </div>
          <div className="fifa2026-fixture-list">
            {knockoutFixtures.map((match) => (
              <div key={match.id}>
                <div className="fifa2026-fixture-round-label">{match.label}</div>
                <FixtureRow match={match} onSubmit={submitResult} phase="knockout" />
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
