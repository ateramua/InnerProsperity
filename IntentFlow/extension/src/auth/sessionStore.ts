import type { ExtensionSession } from '@/types/contracts';
import { secureGet, secureRemove, secureSet } from '@/storage/secureStorage';
import { sessionIsExpired } from '@/auth/sessionUtils';

const SESSION_KEY = 'intentflow.session.v1';

export const anonymousSession: ExtensionSession = {
  authenticated: false,
  scopes: []
};

export async function loadSession() {
  return (await secureGet<ExtensionSession>(SESSION_KEY)) ?? anonymousSession;
}

export async function saveSession(session: ExtensionSession) {
  await secureSet(SESSION_KEY, session);
}

export async function clearSession() {
  await secureRemove(SESSION_KEY);
}

export { sessionIsExpired };
