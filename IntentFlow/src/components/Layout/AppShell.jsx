import React from 'react';

export default function AppShell({ title, subtitle, actions, children }) {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="relative overflow-hidden bg-slate-950">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-800 opacity-90"></div>
        <div className="relative mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <header className="mb-8 rounded-[2rem] border border-slate-800 bg-slate-900/80 p-6 shadow-2xl shadow-slate-950/40 backdrop-blur-xl">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-400">IntentFlow</p>
                <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">{title}</h1>
                {subtitle && <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{subtitle}</p>}
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
