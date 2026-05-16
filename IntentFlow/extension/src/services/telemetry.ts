import browser from 'webextension-polyfill';
import { loadPreferences } from '@/storage/preferences';

type TelemetryEvent = {
  id: string;
  name: string;
  createdAt: string;
  properties?: Record<string, string | number | boolean | null>;
};

const TELEMETRY_QUEUE_KEY = 'intentflow.telemetryQueue.v1';
const MAX_EVENTS = 100;

function sanitizeProperties(properties?: Record<string, unknown>): TelemetryEvent['properties'] {
  if (!properties) return undefined;
  return Object.fromEntries(
    Object.entries(properties)
      .filter(([key]) => !/token|secret|password|url|title|text|account|balance|amount/i.test(key))
      .map(([key, value]) => {
        if (['string', 'number', 'boolean'].includes(typeof value) || value === null) return [key, value];
        return [key, String(value)];
      })
  ) as TelemetryEvent['properties'];
}

async function loadQueue() {
  const stored = await browser.storage.local.get(TELEMETRY_QUEUE_KEY);
  return (stored[TELEMETRY_QUEUE_KEY] as TelemetryEvent[] | undefined) ?? [];
}

async function saveQueue(queue: TelemetryEvent[]) {
  await browser.storage.local.set({ [TELEMETRY_QUEUE_KEY]: queue.slice(0, MAX_EVENTS) });
}

export async function trackEvent(name: string, properties?: Record<string, unknown>) {
  const preferences = await loadPreferences();
  if (!preferences.telemetryEnabled) return;

  const event: TelemetryEvent = {
    id: crypto.randomUUID(),
    name,
    createdAt: new Date().toISOString(),
    properties: sanitizeProperties(properties)
  };

  await saveQueue([event, ...(await loadQueue())]);
  await flushTelemetry().catch(() => undefined);
}

export async function flushTelemetry() {
  const preferences = await loadPreferences();
  if (!preferences.telemetryEnabled || !preferences.telemetryEndpoint.trim()) return;

  const queue = await loadQueue();
  if (!queue.length) return;

  const response = await fetch(preferences.telemetryEndpoint.trim(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ events: queue })
  });

  if (response.ok) {
    await saveQueue([]);
  }
}
