import { useState } from 'react';
import { useTournamentStore } from '../hooks/useTournamentStore';
import StandingsTab from './StandingsTab';
import FixturesTab from './FixturesTab';
import RankingsTab from './RankingsTab';
import KnockoutTab from './KnockoutTab';
import TournamentStats from './TournamentStats';
import ChampionBanner from './ChampionBanner';
import ConfirmDialog from './ConfirmDialog';

const TABS = [
  { id: 'standings', label: 'Standings', icon: '📊' },
  { id: 'fixtures', label: 'Fixtures', icon: '📅' },
  { id: 'rankings', label: 'Rankings', icon: '🏅' },
  { id: 'knockout', label: 'Knockout', icon: '⚔️' },
];

function TabPanel({ id, active, children }) {
  if (id !== active) return null;
  return <div className="fifa2026-content">{children}</div>;
}

export default function TournamentPage() {
  const { state, derived, setActiveTab, resetTournament } = useTournamentStore();
  const { tournament, stats } = { tournament: state.tournament, stats: derived.stats };
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="fifa2026-root">
      <header className="fifa2026-hero">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div className="fifa2026-hero-badge">Live Tournament Dashboard</div>
            <h1 className="fifa2026-hero-title">{tournament.name}</h1>
            <p className="fifa2026-hero-sub">{tournament.host} · {tournament.startDate} — {tournament.endDate}</p>
          </div>
          <button type="button" className="fifa2026-btn fifa2026-btn-ghost" onClick={() => setConfirmReset(true)}>
            Reset results
          </button>
        </div>

        <ChampionBanner teamId={stats.champion} />

        <TournamentStats />

        <div className="fifa2026-progress-wrap">
          <div className="fifa2026-progress-header">
            <span>Group stage progress</span>
            <span>{derived.completedGroup} / {derived.totalGroup} matches ({derived.progress}%)</span>
          </div>
          <div className="fifa2026-progress" role="progressbar" aria-valuenow={derived.progress} aria-valuemin={0} aria-valuemax={100}>
            <div className="fifa2026-progress-fill" style={{ width: `${derived.progress}%` }} />
          </div>
        </div>
      </header>

      <nav className="fifa2026-tabs" aria-label="Tournament sections">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`fifa2026-tab ${state.activeTab === tab.id ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className="fifa2026-tab-icon">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </nav>

      <TabPanel id="standings" active={state.activeTab}><StandingsTab /></TabPanel>
      <TabPanel id="fixtures" active={state.activeTab}><FixturesTab /></TabPanel>
      <TabPanel id="rankings" active={state.activeTab}><RankingsTab /></TabPanel>
      <TabPanel id="knockout" active={state.activeTab}><KnockoutTab /></TabPanel>

      <ConfirmDialog
        open={confirmReset}
        title="Reset all results?"
        message="This clears every entered score and restores the tournament to its initial state. This cannot be undone."
        confirmLabel="Reset tournament"
        onCancel={() => setConfirmReset(false)}
        onConfirm={() => {
          resetTournament();
          setConfirmReset(false);
        }}
      />
    </div>
  );
}
