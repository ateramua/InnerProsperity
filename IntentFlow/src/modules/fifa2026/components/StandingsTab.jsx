import { useMemo, useState } from 'react';
import { groupTeamNames } from '../data/countryMeta';
import { useTournamentStore } from '../hooks/useTournamentStore';
import TeamBadge from './TeamBadge';
import FormStrip from './FormStrip';

export default function StandingsTab() {
  const { state, derived } = useTournamentStore();
  const { groupStandings } = derived;
  const [focusGroup, setFocusGroup] = useState('all');

  const visibleGroups = useMemo(() => {
    if (focusGroup === 'all') return Object.entries(groupStandings);
    return Object.entries(groupStandings).filter(([gid]) => gid === focusGroup);
  }, [groupStandings, focusGroup]);

  return (
    <div>
      <div className="fifa2026-filter-bar">
        <span className="fifa2026-meta" style={{ alignSelf: 'center' }}>Show:</span>
        <button type="button" className={`fifa2026-chip ${focusGroup === 'all' ? 'active' : ''}`} onClick={() => setFocusGroup('all')}>All groups</button>
        {'ABCDEFGHIJKL'.split('').map((g) => (
          <button key={g} type="button" className={`fifa2026-chip ${focusGroup === g ? 'active' : ''}`} onClick={() => setFocusGroup(g)}>Group {g}</button>
        ))}
      </div>

      <div className="fifa2026-group-grid">
        {visibleGroups.map(([groupId, rows]) => (
          <div key={groupId} className="fifa2026-glass fifa2026-group-card">
            <div className="fifa2026-group-header">
              <div>
                <span className="fifa2026-group-letter">Group {groupId}</span>
                <div className="fifa2026-meta fifa2026-group-teams">
                  {groupTeamNames(state.groups[groupId] || [])}
                </div>
              </div>
              <span className="fifa2026-meta">Top 2 qualify</span>
            </div>
            <table className="fifa2026-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Team</th>
                  <th>P</th>
                  <th>W</th>
                  <th>D</th>
                  <th>L</th>
                  <th>GD</th>
                  <th>Pts</th>
                  <th>Form</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.teamId} className={row.position <= 2 ? 'qualified' : ''}>
                    <td>{row.position}</td>
                    <td><TeamBadge teamId={row.teamId} compact /></td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td style={{ color: row.goalDifference > 0 ? 'var(--fifa-accent-green)' : row.goalDifference < 0 ? 'var(--fifa-accent-magenta)' : 'inherit' }}>
                      {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                    </td>
                    <td style={{ fontWeight: 700 }}>{row.points}</td>
                    <td><FormStrip form={row.form} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>
    </div>
  );
}
