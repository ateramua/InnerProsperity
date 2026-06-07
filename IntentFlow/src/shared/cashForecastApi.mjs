import { createShareRecord, loadShareRecord, loadForecastPrefs, saveForecastPrefs } from './cashForecastPrefs.mjs';

export async function persistForecastShare(payload) {
  if (typeof window !== 'undefined' && window.electronAPI?.createForecastShare) {
    const res = await window.electronAPI.createForecastShare(payload);
    if (res?.success && res.data?.id) return res.data.id;
  }
  return createShareRecord(payload);
}

export async function fetchForecastShare(shareId) {
  if (!shareId) return null;
  if (typeof window !== 'undefined' && window.electronAPI?.getForecastShare) {
    const res = await window.electronAPI.getForecastShare(shareId);
    if (res?.success && res.data) return res.data;
  }
  return loadShareRecord(shareId);
}

export async function fetchRecurringPrefs(userId) {
  if (typeof window !== 'undefined' && window.electronAPI?.getForecastRecurringPrefs) {
    const res = await window.electronAPI.getForecastRecurringPrefs();
    if (res?.success && Array.isArray(res.data)) {
      const ignoredRecurring = [];
      const confirmedRecurring = [];
      const customOverrides = {};
      for (const row of res.data) {
        if (row.status === 'ignored') ignoredRecurring.push(row.recurring_id);
        if (row.status === 'confirmed') confirmedRecurring.push(row.recurring_id);
        if (row.override_json) {
          try {
            customOverrides[row.recurring_id] = JSON.parse(row.override_json);
          } catch {
            /* ignore bad json */
          }
        }
      }
      return { ignoredRecurring, confirmedRecurring, customOverrides };
    }
  }
  return loadForecastPrefs(userId);
}

export async function persistRecurringPref(recurringId, status, override = null) {
  if (typeof window !== 'undefined' && window.electronAPI?.setForecastRecurringPref) {
    await window.electronAPI.setForecastRecurringPref(recurringId, status, override);
    return;
  }
}

export function syncRecurringPrefsToLocal(userId, prefs) {
  saveForecastPrefs(userId, prefs);
}
