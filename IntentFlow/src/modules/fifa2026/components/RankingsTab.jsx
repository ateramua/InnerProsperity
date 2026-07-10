import { useMemo, useState } from 'react';
import { teamDisplay } from '../data/countryMeta';
import { QUALIFICATION_STATUS } from '../engine/qualification';
import { useTournamentStore } from '../hooks/useTournamentStore';
import TeamBadge from './TeamBadge';
import FormStrip from './FormStrip';
import QualificationBadge from './QualificationBadge';
import QualificationBanner from './QualificationBanner';

const STATUS_FILTERS = [
  { id: 'all', label: 'All teams' },
  { id: QUALIFICATION_STATUS.QUALIFIED, label: 'Qualified' },
  { id: QUALIFICATION_STATUS.CONDITIONAL, label: '3rd-place race' },
  { id: QUALIFICATION_STATUS.ELIMINATED, label: 'Eliminated' },
];

function formatGd(value) {
  if (value > 0) return `+${value}`;
  return String(value);
}

export default function RankingsTab() {
  const { derived } = useTournamentStore();
  const { overallRankings, groupStageComplete } = derived;
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const filtered = useMemo(() => {
    let rows = overallRankings;
    if (groupFilter !== 'all') rows = rows.filter((r) => r.groupId === groupFilter);
    if (statusFilter !== 'all') rows = rows.filter((r) => r.qualificationStatus === statusFilter);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      rows = rows.filter((r) => {
        const team = teamDisplay(r.teamId);
        return (
          r.teamId.toLowerCase().includes(q)
          || team.name.toLowerCase().includes(q)
        );
      });
    }
    return rows;
  }, [overallRankings, query, groupFilter, statusFilter]);

  return (
    <div>
      <QualificationBanner compact />

      <p className="fifa2026-meta" style={{ margin: '0 0 1rem' }}>
        Ranked by qualification status, then group position and third-place table order,
        then points, goal difference, and goals scored.
        {!groupStageComplete && ' Third-place qualification is provisional until all group matches finish.'}
      </p>

      <div className="fifa2026-filter-bar">
        <input
          type="search"
          className="fifa2026-search"
          placeholder="Search country (e.g. Brazil, Belgium)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            className={`fifa2026-chip ${statusFilter === filter.id ? 'active' : ''}`}
            onClick={() => setStatusFilter(filter.id)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      <div className="fifa2026-filter-bar">
        <button type="button" className={`fifa2026-chip ${groupFilter === 'all' ? 'active' : ''}`} onClick={() => setGroupFilter('all')}>All groups</button>
        {'ABCDEFGHIJKL'.split('').map((g) => (
          <button key={g} type="button" className={`fifa2026-chip ${groupFilter === g ? 'active' : ''}`} onClick={() => setGroupFilter(g)}>{g}</button>
        ))}
      </div>

      <div className="fifa2026-glass" style={{ overflow: 'hidden' }}>
        <div className="fifa2026-rank-row fifa2026-rank-header fifa2026-rank-row-extended">
          <span>Rank</span>
          <span>Team</span>
          <span>Group</span>
          <span>Status</span>
          <span>Pts</span>
          <span>GD</span>
          <span>GF</span>
          <span>Form</span>
        </div>
        {filtered.map((row) => (
          <div
            key={row.teamId}
            className={`fifa2026-rank-row fifa2026-rank-row-extended ${row.qualificationStatus}`}
          >
            <span className={`fifa2026-rank-pos ${row.overallRank <= 3 ? 'top3' : ''}`}>
              {row.overallRank}
            </span>
            <span><TeamBadge teamId={row.teamId} /></span>
            <span className="fifa2026-meta">
              Grp {row.groupId} · #{row.position}
              {row.thirdPlaceRank != null && ` · 3rd #${row.thirdPlaceRank}`}
            </span>
            <span><QualificationBadge status={row.qualificationStatus} compact /></span>
            <span style={{ fontWeight: 700 }}>{row.points}</span>
            <span>{formatGd(row.goalDifference)}</span>
            <span>{row.goalsFor}</span>
            <span><FormStrip form={row.form} /></span>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="fifa2026-meta" style={{ padding: '1.5rem', textAlign: 'center' }}>No teams match your filters.</p>
        )}
      </div>
    </div>
  );
}
