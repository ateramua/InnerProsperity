import { useMemo, useState } from 'react';
import { groupTeamNames } from '../data/countryMeta';
import { QUALIFICATION_STATUS } from '../engine/qualification';
import { useTournamentStore } from '../hooks/useTournamentStore';
import TeamBadge from './TeamBadge';
import FormStrip from './FormStrip';
import QualificationBadge from './QualificationBadge';

function rowClassName(status) {
  if (status === QUALIFICATION_STATUS.QUALIFIED) return 'qualified';
  if (status === QUALIFICATION_STATUS.CONDITIONAL) return 'conditional';
  if (status === QUALIFICATION_STATUS.ELIMINATED) return 'eliminated';
  return '';
}

function formatGd(value) {
  if (value > 0) return `+${value}`;
  return String(value);
}

function BestThirdPlaceTable({ rows, groupStageComplete }) {
  return (
    <section className="fifa2026-glass fifa2026-third-place-section">
      <div className="fifa2026-section-header">
        <h2>Best Third-Place Ranking</h2>
        <span className="fifa2026-meta">
          Top 8 qualify · Bottom 4 eliminated
          {!groupStageComplete && ' · live standings'}
        </span>
      </div>
      <table className="fifa2026-table fifa2026-third-place-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Team</th>
            <th>Grp</th>
            <th>P</th>
            <th>W</th>
            <th>D</th>
            <th>L</th>
            <th>GF</th>
            <th>GA</th>
            <th>GD</th>
            <th>Pts</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.teamId}
              className={row.qualifies ? 'qualified' : row.thirdPlaceRank > 8 ? 'eliminated' : 'conditional'}
            >
              <td>{row.thirdPlaceRank}</td>
              <td><TeamBadge teamId={row.teamId} compact /></td>
              <td>{row.groupId}</td>
              <td>{row.played}</td>
              <td>{row.won}</td>
              <td>{row.drawn}</td>
              <td>{row.lost}</td>
              <td>{row.goalsFor}</td>
              <td>{row.goalsAgainst}</td>
              <td style={{ color: row.goalDifference > 0 ? 'var(--fifa-accent-green)' : row.goalDifference < 0 ? 'var(--fifa-accent-magenta)' : 'inherit' }}>
                {formatGd(row.goalDifference)}
              </td>
              <td style={{ fontWeight: 700 }}>{row.points}</td>
              <td>
                <QualificationBadge
                  status={
                    !groupStageComplete
                      ? QUALIFICATION_STATUS.CONDITIONAL
                      : row.qualifies
                        ? QUALIFICATION_STATUS.QUALIFIED
                        : QUALIFICATION_STATUS.ELIMINATED
                  }
                  compact
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export default function StandingsTab() {
  const { state, derived } = useTournamentStore();
  const { groupStandings, bestThirdPlace, groupStageComplete } = derived;
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
              <span className="fifa2026-meta">Top 2 + 8 best 3rd</span>
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
                  <th>GF</th>
                  <th>GA</th>
                  <th>GD</th>
                  <th>Pts</th>
                  <th>Status</th>
                  <th>Form</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.teamId} className={rowClassName(row.qualificationStatus)}>
                    <td>{row.position}</td>
                    <td><TeamBadge teamId={row.teamId} compact /></td>
                    <td>{row.played}</td>
                    <td>{row.won}</td>
                    <td>{row.drawn}</td>
                    <td>{row.lost}</td>
                    <td>{row.goalsFor}</td>
                    <td>{row.goalsAgainst}</td>
                    <td style={{ color: row.goalDifference > 0 ? 'var(--fifa-accent-green)' : row.goalDifference < 0 ? 'var(--fifa-accent-magenta)' : 'inherit' }}>
                      {formatGd(row.goalDifference)}
                    </td>
                    <td style={{ fontWeight: 700 }}>{row.points}</td>
                    <td><QualificationBadge status={row.qualificationStatus} compact /></td>
                    <td><FormStrip form={row.form} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <BestThirdPlaceTable rows={bestThirdPlace} groupStageComplete={groupStageComplete} />
    </div>
  );
}
