import { CapacitorUpdater } from '@capgo/capacitor-updater';

export function initializeCapgo() {
  // This runs on the client side
  if (typeof window !== 'undefined') {
    CapacitorUpdater.notifyAppReady()
      .then(() => console.log('✅ Capgo ready'))
      .catch(err => console.error('❌ Capgo error', err));
  }
}