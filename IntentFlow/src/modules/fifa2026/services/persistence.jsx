import { STORAGE_KEY } from '../config';
import { createInitialTournamentState } from '../data/wc2026Seed';
import { recalculateTournament } from '../engine/recalculate';

export function loadTournamentState() {
  if (typeof window === 'undefined') {
    return recalculateTournament(createInitialTournamentState());
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return recalculateTournament(createInitialTournamentState());
    const parsed = JSON.parse(raw);
    const resultOverrides = Object.fromEntries(
      Object.entries(parsed.resultOverrides ?? {}).filter(([id]) => id.startsWith('ko-')),
    );
    return recalculateTournament({
      ...createInitialTournamentState(),
      ...parsed,
      resultOverrides,
    });
  } catch {
    return recalculateTournament(createInitialTournamentState());
  }
}

export function saveTournamentState(state) {
  if (typeof window === 'undefined') return;
  const payload = {
    version: state.version,
    resultOverrides: state.resultOverrides,
    activeTab: state.activeTab,
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
}

export function resetTournamentState() {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(STORAGE_KEY);
  }
  return recalculateTournament(createInitialTournamentState());
}
