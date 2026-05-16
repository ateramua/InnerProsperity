import browser from 'webextension-polyfill';
import type { SyncEnvelope } from '@/types/contracts';

const QUEUE_KEY = 'intentflow.syncQueue.v1';

export async function loadQueue() {
  const stored = await browser.storage.local.get(QUEUE_KEY);
  return (stored[QUEUE_KEY] as SyncEnvelope[] | undefined) ?? [];
}

export async function saveQueue(queue: SyncEnvelope[]) {
  await browser.storage.local.set({ [QUEUE_KEY]: queue.slice(0, 200) });
}

export async function enqueueSync<TPayload>(type: string, payload: TPayload) {
  const queue = await loadQueue();
  const item: SyncEnvelope<TPayload> = {
    id: crypto.randomUUID(),
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    status: 'queued'
  };
  await saveQueue([item, ...queue]);
  return item;
}

export async function markSynced(id: string) {
  const queue = await loadQueue();
  await saveQueue(queue.filter((item) => item.id !== id));
}

export async function markFailed(id: string, error: string) {
  const queue = await loadQueue();
  await saveQueue(
    queue.map((item) =>
      item.id === id
        ? {
            ...item,
            attempts: item.attempts + 1,
            status: 'failed',
            lastError: error
          }
        : item
    )
  );
}
