import type { ExtensionSession } from '@/types/contracts';

export function sessionIsExpired(session: ExtensionSession) {
  if (!session.expiresAt) return false;
  return Date.parse(session.expiresAt) <= Date.now() + 30_000;
}
