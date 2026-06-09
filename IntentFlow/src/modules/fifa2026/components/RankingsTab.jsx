import { useMemo, useState } from 'react';
import { teamDisplay } from '../data/countryMeta';
import { useTournamentStore } from '../hooks/useTournamentStore';
import TeamBadge from './TeamBadge';
import FormStrip from './FormStrip';

export default function RankingsTab() {
  const { derived } = useTournamentStore();
  const { overallRankings } = derived;
  const [query, setQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState('all');

  const filtered = useMemo(() => {
    let rows = overallRankings;
    if (groupFilter !== 'all') rows = rows.filter((r) => r.groupId === groupFilter);
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
  }, [overallRankings, query, groupFilter]);

  return (
    <div>
      <div className="fifa2026-filter-bar">
        <input
          type="search"
          className="fifa2026-search"
          placeholder="Search country (e.g. Brazil, Belgium)…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <button type="button" className={`fifa2026-chip ${groupFilter === 'all' ? 'active' : ''}`} onClick={() => setGroupFilter('all')}>All groups</button>
        {'ABCDEFGHIJKL'.split('').map((g) => (
          <button key={g} type="button" className={`fifa2026-chip ${groupFilter === g ? 'active' : ''}`} onClick={() => setGroupFilter(g)}>{g}</button>
        ))}
      </div>

      <div className="fifa2026-glass" style={{ overflow: 'hidden' }}>
        <div className="fifa2026-rank-row fifa2026-rank-header">
          <span>Rank</span>
          <span>Team</span>
          <span>Group</span>
          <span>Pts</span>
          <span>GD</span>
          <span>Form</span>
        </div>
        {filtered.map((row) => (
          <div key={row.teamId} className="fifa2026-rank-row">
            <span className={`fifa2026-rank-pos ${row.overallRank <= 3 ? 'top3' : ''}`}>
              {row.overallRank}
            </span>
            <span><TeamBadge teamId={row.teamId} /></span>
            <span className="fifa2026-meta">Grp {row.groupId} · #{row.position}</span>
            <span style={{ fontWeight: 700 }}>{row.points}</span>
            <span>{row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}</span>
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
