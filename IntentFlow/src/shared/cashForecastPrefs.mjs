const PREFS_KEY = 'intentflow.cashForecast.prefs';
const SNAPSHOTS_KEY = 'intentflow.cashForecast.snapshots';
const SHARE_PREFIX = 'intentflow.forecast.share.';

export function loadForecastPrefs(userId = 'default') {
  try {
    const raw = localStorage.getItem(`${PREFS_KEY}.${userId}`);
    if (!raw) return { ignoredRecurring: [], confirmedRecurring: [], customOverrides: {} };
    const parsed = JSON.parse(raw);
    return {
      ignoredRecurring: parsed.ignoredRecurring || [],
      confirmedRecurring: parsed.confirmedRecurring || [],
      customOverrides: parsed.customOverrides || {},
    };
  } catch {
    return { ignoredRecurring: [], confirmedRecurring: [], customOverrides: {} };
  }
}

export function saveForecastPrefs(userId, prefs) {
  try {
    localStorage.setItem(`${PREFS_KEY}.${userId}`, JSON.stringify(prefs));
  } catch {
    /* localStorage unavailable */
  }
}

export function loadForecastSnapshots(userId = 'default') {
  try {
    const raw = localStorage.getItem(`${SNAPSHOTS_KEY}.${userId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function appendForecastSnapshot(userId, snapshot) {
  const list = loadForecastSnapshots(userId);
  const next = [...list, snapshot].slice(-120);
  try {
    localStorage.setItem(`${SNAPSHOTS_KEY}.${userId}`, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  return next;
}

export function createShareRecord(payload) {
  const id =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `share-${Date.now()}`;
  try {
    localStorage.setItem(`${SHARE_PREFIX}${id}`, JSON.stringify(payload));
  } catch {
    return null;
  }
  return id;
}

export function loadShareRecord(id) {
  try {
    const raw = localStorage.getItem(`${SHARE_PREFIX}${id}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
