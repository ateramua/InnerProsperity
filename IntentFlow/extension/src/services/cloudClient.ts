import { loadSession } from '@/auth/sessionStore';
import { loadPreferences } from '@/storage/preferences';
import type { CapturedPageContext, DashboardSummary } from '@/types/contracts';

function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '');
}

async function getCloudConfig() {
  const preferences = await loadPreferences();
  if (!preferences.cloudFallbackEnabled || !preferences.cloudApiBaseUrl.trim()) {
    return null;
  }

  const session = await loadSession();
  if (!session.authenticated || !session.accessToken) {
    return null;
  }

  return {
    baseUrl: trimTrailingSlash(preferences.cloudApiBaseUrl.trim()),
    accessToken: session.accessToken
  };
}

async function cloudFetch<TResponse>(path: string, init: RequestInit = {}) {
  const config = await getCloudConfig();
  if (!config) throw new Error('Cloud fallback is not configured');

  const response = await fetch(`${config.baseUrl}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.accessToken}`,
      ...(init.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error(`Cloud API returned ${response.status}`);
  }

  return (await response.json()) as TResponse;
}

export async function fetchCloudDashboardSummary() {
  return cloudFetch<DashboardSummary>('/extension/dashboard-summary');
}

export async function sendCloudCapturedPage(context: CapturedPageContext) {
  return cloudFetch<{ ok: boolean; id?: string }>('/extension/capture-page', {
    method: 'POST',
    body: JSON.stringify(context)
  });
}
