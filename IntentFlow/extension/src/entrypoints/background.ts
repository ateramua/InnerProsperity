import browser from 'webextension-polyfill';
import { defineBackground } from 'wxt/utils/define-background';
import { loadSession } from '@/auth/sessionStore';
import { detectDesktop, sendCapturedPage } from '@/bridge/desktopBridge';
import { log } from '@/services/logger';
import { flushTelemetry, trackEvent } from '@/services/telemetry';
import { enqueueSync, loadQueue, markFailed, markSynced } from '@/sync/syncQueue';
import type { CapturedPageContext } from '@/types/contracts';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === 'install') {
      void browser.tabs.create({ url: browser.runtime.getURL('/onboarding.html') });
    }
    void browser.alarms.create('intentflow.sync', { periodInMinutes: 5 });
    void browser.alarms.create('intentflow.telemetry', { periodInMinutes: 30 });
  });

  browser.commands.onCommand.addListener((command) => {
    if (command === 'quick-capture') void captureActiveTab();
    if (command === 'open-intentflow') void browser.action.openPopup?.();
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'intentflow.sync') void drainSyncQueue();
    if (alarm.name === 'intentflow.telemetry') void flushTelemetry();
  });

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message !== 'object' || message === null) return undefined;
    const typed = message as { type?: string; payload?: CapturedPageContext };
    if (typed.type === 'intentflow.capturePage' && typed.payload) {
      return capturePage(typed.payload);
    }
    return undefined;
  });
});

async function captureActiveTab() {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const payload: CapturedPageContext = {
    url: tab?.url ?? '',
    title: tab?.title ?? 'Untitled page',
    detectedKind: 'general',
    capturedAt: new Date().toISOString()
  };
  await capturePage(payload);
}

async function capturePage(payload: CapturedPageContext) {
  const session = await loadSession();
  if (!session.authenticated) {
    await enqueueSync('capture.page', payload);
    log('warn', 'Capture queued because extension is not paired');
    return;
  }

  try {
    await sendCapturedPage(payload);
    await trackEvent('capture.sent', { detectedKind: payload.detectedKind ?? 'general' });
    await browser.notifications.create({
      type: 'basic',
      iconUrl: browser.runtime.getURL('/icons/icon-128.svg'),
      title: 'Captured to IntentFlow',
      message: payload.title
    });
  } catch (error) {
    await enqueueSync('capture.page', payload);
    await trackEvent('capture.queued', { reason: 'send_failed' });
    log('warn', 'Capture queued for offline sync', error);
  }
}

async function drainSyncQueue() {
  const status = await detectDesktop();
  if (!status.connected) return;

  const queue = await loadQueue();
  for (const item of queue.filter((entry) => entry.status === 'queued' || entry.status === 'failed')) {
    try {
      if (item.type === 'capture.page') await sendCapturedPage(item.payload as CapturedPageContext);
      await markSynced(item.id);
      await trackEvent('sync.item_synced', { type: item.type });
    } catch (error) {
      await markFailed(item.id, error instanceof Error ? error.message : 'Sync failed');
    }
  }
}
