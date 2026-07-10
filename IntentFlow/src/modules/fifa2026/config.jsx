/** Plug-in feature flag — set false to hide nav and retire module. */
export const FIFA_2026_MODULE_ENABLED = true;

export const TOURNAMENT_ID = 'fifa-wc-2026';
export const STORAGE_KEY = 'intentflow:fifa2026:v9';

export const POINTS = { WIN: 3, DRAW: 1, LOSS: 0 };

export const MATCH_STATUS = {
  SCHEDULED: 'scheduled',
  LIVE: 'live',
  COMPLETED: 'completed',
  POSTPONED: 'postponed',
  CANCELLED: 'cancelled',
};

export const KNOCKOUT_ROUNDS = [
  { id: 'r32', label: 'Round of 32', slots: 16 },
  { id: 'r16', label: 'Round of 16', slots: 8 },
  { id: 'qf', label: 'Quarter-Finals', slots: 4 },
  { id: 'sf', label: 'Semi-Finals', slots: 2 },
  { id: 'third', label: 'Third Place', slots: 1 },
  { id: 'final', label: 'Final', slots: 1 },
];
