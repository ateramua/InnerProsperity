import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { loadSession } from '@/auth/sessionStore';
import { StatusPill } from '@/components/StatusPill';
import { detectDesktop, fetchDashboardSummary, pairWithDesktop } from '@/bridge/desktopBridge';
import { formatCurrency } from '@/theme/tokens';
import type { BridgeStatus, DashboardSummary } from '@/types/contracts';
import '@/theme/global.css';

function SidePanelApp() {
  const [status, setStatus] = useState<BridgeStatus>({ transport: 'offline', connected: false, desktopAvailable: false });
  const [paired, setPaired] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary>({
    accountsNeedingAttention: 0,
    pendingTasks: 0,
    unreadNotifications: 0
  });

  useEffect(() => {
    void Promise.all([detectDesktop(), loadSession(), fetchDashboardSummary()]).then(([bridgeStatus, session, dashboardSummary]) => {
      setStatus(bridgeStatus);
      setPaired(session.authenticated);
      setSummary(dashboardSummary);
    });
  }, []);

  return (
    <main className="app-shell" style={{ minWidth: 320 }}>
      <section className="premium-card" style={{ padding: 20, display: 'grid', gap: 18 }}>
        <header style={{ display: 'grid', gap: 10 }}>
          <StatusPill status={status} />
          <div>
            <p className="muted" style={{ margin: 0, fontWeight: 800, textTransform: 'uppercase', fontSize: 12 }}>
              Side Panel
            </p>
            <h1 style={{ margin: '6px 0 0', fontSize: 28, letterSpacing: '-0.05em' }}>IntentFlow command center</h1>
          </div>
        </header>

        <section
          style={{
            borderRadius: 22,
            padding: 18,
            background: 'linear-gradient(135deg, rgba(109, 94, 247, 0.20), rgba(32, 199, 181, 0.14))'
          }}
        >
          <span className="muted" style={{ fontSize: 12, fontWeight: 800 }}>
            Monthly budget remaining
          </span>
          <div style={{ fontSize: 38, fontWeight: 900, letterSpacing: '-0.06em', marginTop: 8 }}>
            {formatCurrency(summary.monthlyBudgetRemaining)}
          </div>
        </section>

        <div style={{ display: 'grid', gap: 12 }}>
          {[
            ['Accounts needing attention', summary.accountsNeedingAttention],
            ['Tasks queued', summary.pendingTasks],
            ['Unread notifications', summary.unreadNotifications]
          ].map(([label, value]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--if-border)',
                paddingBottom: 10
              }}
            >
              <span className="muted">{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>

        <button
          className="button"
          type="button"
          onClick={async () => {
            if (!paired) {
              await pairWithDesktop('IntentFlow side panel');
              setPaired(true);
              setSummary(await fetchDashboardSummary());
            }
          }}
        >
          {paired ? 'Open full desktop dashboard' : 'Pair with desktop'}
        </button>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <SidePanelApp />
  </React.StrictMode>
);
