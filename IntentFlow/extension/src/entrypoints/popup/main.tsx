import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import browser from 'webextension-polyfill';
import { loadSession } from '@/auth/sessionStore';
import { StatusPill } from '@/components/StatusPill';
import { MetricCard } from '@/components/MetricCard';
import { QuickActionButton } from '@/components/QuickActionButton';
import { detectDesktop, fetchDashboardSummary, pairWithDesktop, sendCapturedPage } from '@/bridge/desktopBridge';
import { quickActions } from '@/services/quickActions';
import { enqueueSync } from '@/sync/syncQueue';
import { formatCurrency } from '@/theme/tokens';
import type { BridgeStatus, DashboardSummary, QuickAction } from '@/types/contracts';
import '@/theme/global.css';

function PopupApp() {
  const [status, setStatus] = useState<BridgeStatus>({ transport: 'offline', connected: false, desktopAvailable: false });
  const [paired, setPaired] = useState(false);
  const [summary, setSummary] = useState<DashboardSummary>({
    accountsNeedingAttention: 0,
    pendingTasks: 0,
    unreadNotifications: 0
  });
  const [message, setMessage] = useState('Ready');

  useEffect(() => {
    void Promise.all([detectDesktop(), loadSession(), fetchDashboardSummary()]).then(([bridgeStatus, session, dashboardSummary]) => {
      setStatus(bridgeStatus);
      setPaired(session.authenticated);
      setSummary(dashboardSummary);
    });
  }, []);

  async function connectDesktop() {
    setMessage('Waiting for desktop approval...');
    try {
      await pairWithDesktop('IntentFlow popup');
      setPaired(true);
      setSummary(await fetchDashboardSummary());
      setMessage('Connected to IntentFlow Desktop');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Pairing failed');
    }
  }

  async function runAction(action: QuickAction) {
    if (action.id === 'capture-page') {
      const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
      const payload = {
        url: tab?.url ?? '',
        title: tab?.title ?? 'Untitled page',
        detectedKind: 'general' as const,
        capturedAt: new Date().toISOString()
      };

      try {
        await sendCapturedPage(payload);
        setMessage('Captured to IntentFlow');
      } catch {
        await enqueueSync('capture.page', payload);
        setMessage('Saved offline. IntentFlow will sync later.');
      }
      return;
    }

    if (action.id === 'open-dashboard') {
      await browser.tabs.create({ url: browser.runtime.getURL('/sidepanel.html') });
      return;
    }

    await enqueueSync(`quickAction.${action.id}`, { requestedAt: new Date().toISOString() });
    setMessage(`${action.label} queued`);
  }

  return (
    <main className="app-shell" style={{ width: 390 }}>
      <section className="premium-card" style={{ padding: 18, display: 'grid', gap: 16 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <p className="muted" style={{ margin: 0, fontSize: 12, fontWeight: 800, textTransform: 'uppercase' }}>
              IntentFlow Companion
            </p>
            <h1 style={{ margin: '4px 0 0', fontSize: 24, letterSpacing: '-0.04em' }}>Your money, in flow.</h1>
          </div>
          <StatusPill status={status} />
        </header>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <MetricCard label="Available cash" value={formatCurrency(summary.availableCash)} accent="var(--if-aqua)" />
          <MetricCard label="Budget left" value={formatCurrency(summary.monthlyBudgetRemaining)} accent="var(--if-brand)" />
          <MetricCard label="Needs review" value={String(summary.accountsNeedingAttention)} />
          <MetricCard label="Notifications" value={String(summary.unreadNotifications)} />
        </div>

        <div style={{ display: 'grid', gap: 10 }}>
          {!paired ? (
            <button className="button" type="button" onClick={connectDesktop}>
              Connect to desktop
            </button>
          ) : null}
          {quickActions.map((action) => (
            <QuickActionButton key={action.id} action={action} onRun={runAction} />
          ))}
        </div>

        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span className="muted" role="status" style={{ fontSize: 12 }}>
            {message}
          </span>
          <button className="button secondary" type="button" onClick={() => browser.runtime.openOptionsPage()}>
            Settings
          </button>
        </footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PopupApp />
  </React.StrictMode>
);
