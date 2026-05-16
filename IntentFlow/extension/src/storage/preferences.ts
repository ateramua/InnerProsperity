import browser from 'webextension-polyfill';
import type { IntentFlowTheme } from '@/types/contracts';

const PREF_KEY = 'intentflow.preferences.v1';

export type ExtensionPreferences = {
  theme: IntentFlowTheme;
  notificationsEnabled: boolean;
  cloudFallbackEnabled: boolean;
  contentEnhancementsEnabled: boolean;
  cloudApiBaseUrl: string;
  telemetryEnabled: boolean;
  telemetryEndpoint: string;
};

export const defaultPreferences: ExtensionPreferences = {
  theme: 'system',
  notificationsEnabled: true,
  cloudFallbackEnabled: false,
  contentEnhancementsEnabled: true,
  cloudApiBaseUrl: '',
  telemetryEnabled: false,
  telemetryEndpoint: ''
};

export async function loadPreferences() {
  const stored = await browser.storage.local.get(PREF_KEY);
  return {
    ...defaultPreferences,
    ...((stored[PREF_KEY] as Partial<ExtensionPreferences> | undefined) ?? {})
  };
}

export async function savePreferences(preferences: ExtensionPreferences) {
  await browser.storage.local.set({ [PREF_KEY]: preferences });
}
