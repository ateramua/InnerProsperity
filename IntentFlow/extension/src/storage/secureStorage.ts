import browser from 'webextension-polyfill';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const KEY_NAME = 'intentflow.localEncryptionKey.v1';

async function getOrCreateKeyMaterial() {
  const stored = await browser.storage.local.get(KEY_NAME);
  const existing = stored[KEY_NAME];
  if (typeof existing === 'string') return Uint8Array.from(atob(existing), (char) => char.charCodeAt(0));

  const raw = crypto.getRandomValues(new Uint8Array(32));
  await browser.storage.local.set({ [KEY_NAME]: btoa(String.fromCharCode(...raw)) });
  return raw;
}

async function getCryptoKey() {
  const raw = await getOrCreateKeyMaterial();
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function secureSet<TValue>(key: string, value: TValue) {
  const cryptoKey = await getCryptoKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify(value));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plaintext);

  await browser.storage.local.set({
    [key]: {
      iv: btoa(String.fromCharCode(...iv)),
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
      version: 1
    }
  });
}

export async function secureGet<TValue>(key: string): Promise<TValue | null> {
  const stored = await browser.storage.local.get(key);
  const record = stored[key] as { iv?: string; ciphertext?: string; version?: number } | undefined;
  if (!record?.iv || !record.ciphertext) return null;

  const cryptoKey = await getCryptoKey();
  const iv = Uint8Array.from(atob(record.iv), (char) => char.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(record.ciphertext), (char) => char.charCodeAt(0));
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, cryptoKey, ciphertext);
  return JSON.parse(decoder.decode(plaintext)) as TValue;
}

export async function secureRemove(key: string) {
  await browser.storage.local.remove(key);
}
