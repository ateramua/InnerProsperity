import React from 'react';
import { APP_BG, APP_FG, APP_ON_FG } from '../../theme/appPalette';

export default function AppShell({ title, subtitle, actions, children }) {
  return (
    <div className="min-h-screen" style={{ backgroundColor: APP_BG, color: APP_ON_FG }}>
      <div className="relative overflow-hidden" style={{ backgroundColor: APP_BG }}>
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <header
            className="mb-8 rounded-[2rem] p-6 shadow-2xl backdrop-blur-xl"
            style={{
              backgroundColor: APP_FG,
              color: APP_ON_FG,
              border: `2px solid ${APP_BG}`,
              boxShadow: '0 25px 50px -12px rgba(0, 71, 171, 0.35)',
            }}
          >
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em]" style={{ color: 'rgba(255,255,255,0.75)' }}>
                  IntentFlow
                </p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
                {subtitle && (
                  <p className="mt-2 max-w-2xl text-sm leading-6" style={{ color: 'rgba(255,255,255,0.88)' }}>
                    {subtitle}
                  </p>
                )}
              </div>
              {actions && <div className="flex flex-wrap items-center gap-3">{actions}</div>}
            </div>
          </header>
          <section className="space-y-6">{children}</section>
        </div>
      </div>
    </div>
  );
}
