import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { StatusPill } from '@/components/StatusPill';
import { detectDesktop, pairWithDesktop } from '@/bridge/desktopBridge';
import type { BridgeStatus } from '@/types/contracts';
import '@/theme/global.css';

function OnboardingApp() {
  const [status, setStatus] = useState<BridgeStatus>({ transport: 'offline', connected: false, desktopAvailable: false });
  const [message, setMessage] = useState('Pairing requires IntentFlow Desktop to be open.');

  useEffect(() => {
    void detectDesktop().then(setStatus);
  }, []);

  return (
    <main className="app-shell" style={{ maxWidth: 820, margin: '0 auto', display: 'grid', alignItems: 'center' }}>
      <section className="premium-card" style={{ padding: 34, display: 'grid', gap: 24 }}>
        <StatusPill status={status} />
        <div>
          <p className="muted" style={{ margin: 0, fontWeight: 800, textTransform: 'uppercase', fontSize: 12 }}>
            Welcome
          </p>
          <h1 style={{ margin: '8px 0 0', fontSize: 44, letterSpacing: '-0.07em', maxWidth: 620 }}>
            IntentFlow now follows your workflow into the browser.
          </h1>
        </div>
        <p className="muted" style={{ fontSize: 16, lineHeight: 1.7, maxWidth: 650 }}>
          Capture receipts, track money moments, open quick actions, and stay synced with the desktop app. If the
          desktop app is unavailable, the extension queues work offline and can use cloud APIs once enabled.
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
          <button
            className="button"
            type="button"
            onClick={async () => {
              setMessage('Waiting for approval in IntentFlow Desktop...');
              try {
                await pairWithDesktop('IntentFlow onboarding');
                setMessage('Connected. You can close this tab and start using the extension.');
              } catch (error) {
                setMessage(error instanceof Error ? error.message : 'Pairing failed');
              }
            }}
          >
            Pair with desktop
          </button>
          <button className="button secondary" type="button" onClick={() => setMessage('Offline queue enabled. Pair later from Settings.')}>
            Continue offline
          </button>
        </div>
        <p className="muted" role="status" style={{ margin: 0 }}>
          {message}
        </p>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OnboardingApp />
  </React.StrictMode>
);
