import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { clearSession, loadSession } from '@/auth/sessionStore';
import { pairWithDesktop } from '@/bridge/desktopBridge';
import { defaultPreferences, loadPreferences, savePreferences, type ExtensionPreferences } from '@/storage/preferences';
import '@/theme/global.css';

function OptionsApp() {
  const [preferences, setPreferences] = useState<ExtensionPreferences>(defaultPreferences);
  const [paired, setPaired] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    void loadPreferences().then(setPreferences);
    void loadSession().then((session) => setPaired(session.authenticated));
  }, []);

  async function update(next: ExtensionPreferences) {
    setPreferences(next);
    await savePreferences(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1600);
  }

  return (
    <main className="app-shell" style={{ maxWidth: 760, margin: '0 auto' }}>
      <section className="premium-card" style={{ padding: 28, display: 'grid', gap: 22 }}>
        <header>
          <p className="muted" style={{ margin: 0, fontWeight: 800, textTransform: 'uppercase', fontSize: 12 }}>
            IntentFlow Extension
          </p>
          <h1 style={{ margin: '6px 0 0', fontSize: 32, letterSpacing: '-0.05em' }}>Settings and privacy</h1>
        </header>

        <label style={{ display: 'grid', gap: 8 }}>
          <span style={{ fontWeight: 800 }}>Theme</span>
          <select
            value={preferences.theme}
            onChange={(event) => update({ ...preferences, theme: event.target.value as ExtensionPreferences['theme'] })}
            style={{ minHeight: 44, borderRadius: 14, border: '1px solid var(--if-border)', padding: '0 12px' }}
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>

        {(
          [
          ['notificationsEnabled', 'Notifications', 'Show bill, sync, and account attention notifications.'],
          ['cloudFallbackEnabled', 'Cloud fallback', 'Use cloud APIs when IntentFlow Desktop is unavailable.'],
          ['telemetryEnabled', 'Privacy-safe diagnostics', 'Queue sanitized extension reliability events when enabled.'],
          ['contentEnhancementsEnabled', 'Browser context enhancements', 'Detect receipts, invoices, and finance pages.']
        ] as const
        ).map(([key, label, description]) => (
          <label key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 18 }}>
            <span>
              <strong>{label}</strong>
              <span className="muted" style={{ display: 'block', fontSize: 13, marginTop: 4 }}>
                {description}
              </span>
            </span>
            <input
              type="checkbox"
              checked={Boolean(preferences[key as keyof ExtensionPreferences])}
              onChange={(event) => update({ ...preferences, [key]: event.target.checked })}
            />
          </label>
        ))}

        <label style={{ display: 'grid', gap: 8 }}>
          <span style={{ fontWeight: 800 }}>Cloud API base URL</span>
          <input
            value={preferences.cloudApiBaseUrl}
            onChange={(event) => update({ ...preferences, cloudApiBaseUrl: event.target.value })}
            placeholder="https://api.intentflow.app"
            style={{ minHeight: 44, borderRadius: 14, border: '1px solid var(--if-border)', padding: '0 12px' }}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            Optional. Leave empty until your cloud backend is available.
          </span>
        </label>

        <label style={{ display: 'grid', gap: 8 }}>
          <span style={{ fontWeight: 800 }}>Telemetry endpoint</span>
          <input
            value={preferences.telemetryEndpoint}
            onChange={(event) => update({ ...preferences, telemetryEndpoint: event.target.value })}
            placeholder="https://telemetry.intentflow.app/events"
            style={{ minHeight: 44, borderRadius: 14, border: '1px solid var(--if-border)', padding: '0 12px' }}
          />
          <span className="muted" style={{ fontSize: 12 }}>
            Optional. Events are sanitized and never include page URLs, financial amounts, tokens, or selected text.
          </span>
        </label>

        <footer style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <span className="muted">{saved ? 'Saved' : paired ? 'Connected to desktop' : 'Not paired'}</span>
          <button
            className="button secondary"
            type="button"
            onClick={async () => {
              if (paired) {
                await clearSession();
                setPaired(false);
                return;
              }
              await pairWithDesktop('IntentFlow settings');
              setPaired(true);
            }}
          >
            {paired ? 'Disconnect extension' : 'Pair with desktop'}
          </button>
        </footer>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <OptionsApp />
  </React.StrictMode>
);
