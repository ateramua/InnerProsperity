import browser from 'webextension-polyfill';
import { loadSession, saveSession, sessionIsExpired } from '@/auth/sessionStore';
import { fetchCloudDashboardSummary, sendCloudCapturedPage } from '@/services/cloudClient';
import type { BridgeStatus, CapturedPageContext, DashboardSummary, ExtensionSession, IntentFlowMessage } from '@/types/contracts';
import { createMessage, isCompatibleProtocol, NATIVE_HOST_NAME } from '@/bridge/protocol';

const LOOPBACK_PORTS = [37631, 37632, 37633];

async function sendNative<TResponse>(message: IntentFlowMessage) {
  try {
    const response = (await browser.runtime.sendNativeMessage(NATIVE_HOST_NAME, message)) as TResponse;
    return response;
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'Native messaging failed');
  }
}

async function getAccessToken() {
  const session = await loadSession();
  if (!session.authenticated || !session.accessToken || sessionIsExpired(session)) return null;
  return session.accessToken;
}

async function sendLoopback<TResponse>(path: string, body?: unknown, accessToken?: string | null) {
  let lastError: unknown;

  for (const port of LOOPBACK_PORTS) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: {
          'Content-Type': 'application/json',
          'X-IntentFlow-Source': 'browser-extension',
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
        },
        body: body ? JSON.stringify(body) : undefined
      });
      if (response.ok) return (await response.json()) as TResponse;
      lastError = new Error(`Loopback bridge returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
  }

  throw new Error(lastError instanceof Error ? lastError.message : 'Loopback bridge unavailable');
}

export async function pairWithDesktop(clientName = 'IntentFlow browser extension'): Promise<ExtensionSession> {
  const extensionInfo = browser.runtime.getManifest();
  const payload = {
    clientName,
    browser: extensionInfo.name,
    extensionId: browser.runtime.id,
    requestedAt: new Date().toISOString()
  };

  try {
    const response = await sendNative<{ ok: boolean; session?: ExtensionSession; error?: string }>(
      createMessage('pair.request', payload)
    );
    if (!response.ok || !response.session) throw new Error(response.error || 'Pairing failed');
    await saveSession(response.session);
    return response.session;
  } catch {
    const response = await sendLoopback<{ ok: boolean; session?: ExtensionSession; error?: string }>(
      '/extension/pair/request',
      payload
    );
    if (!response.ok || !response.session) throw new Error(response.error || 'Pairing failed');
    await saveSession(response.session);
    return response.session;
  }
}

export async function detectDesktop(): Promise<BridgeStatus> {
  try {
    const response = await sendNative<{ ok: boolean; desktopVersion?: string; protocolVersion?: string }>(
      createMessage('bridge.ping')
    );

    return {
      transport: 'native',
      connected: Boolean(response.ok),
      desktopAvailable: Boolean(response.ok),
      desktopVersion: response.desktopVersion,
      protocolVersion: response.protocolVersion,
      lastSeenAt: new Date().toISOString(),
      error: response.protocolVersion && !isCompatibleProtocol(response.protocolVersion) ? 'Desktop bridge needs an update' : undefined
    };
  } catch {
    try {
      const response = await sendLoopback<{ ok: boolean; desktopVersion?: string; protocolVersion?: string }>('/extension/health');
      return {
        transport: 'loopback',
        connected: Boolean(response.ok),
        desktopAvailable: Boolean(response.ok),
        desktopVersion: response.desktopVersion,
        protocolVersion: response.protocolVersion,
        lastSeenAt: new Date().toISOString()
      };
    } catch (error) {
      return {
        transport: 'offline',
        connected: false,
        desktopAvailable: false,
        error: error instanceof Error ? error.message : 'Desktop bridge unavailable'
      };
    }
  }
}

export async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const accessToken = await getAccessToken();
  if (!accessToken) {
    return {
      accountsNeedingAttention: 0,
      pendingTasks: 0,
      unreadNotifications: 0
    };
  }

  try {
    return await sendNative<DashboardSummary>(createMessage('dashboard.summary', { accessToken }));
  } catch {
    try {
      return await sendLoopback<DashboardSummary>('/extension/dashboard-summary', undefined, accessToken);
    } catch {
      try {
        return await fetchCloudDashboardSummary();
      } catch {
        return {
          accountsNeedingAttention: 0,
          pendingTasks: 0,
          unreadNotifications: 0
        };
      }
    }
  }
}

export async function sendCapturedPage(context: CapturedPageContext) {
  const accessToken = await getAccessToken();
  if (!accessToken) throw new Error('Pair with IntentFlow Desktop before capturing pages');

  try {
    return await sendNative<{ ok: boolean }>(createMessage('capture.page', { ...context, accessToken }));
  } catch {
    try {
      return await sendLoopback<{ ok: boolean }>('/extension/capture-page', context, accessToken);
    } catch {
      return sendCloudCapturedPage(context);
    }
  }
}
