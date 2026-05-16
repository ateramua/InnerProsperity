import type { IntentFlowMessage } from '@/types/contracts';

export const BRIDGE_PROTOCOL_VERSION = '2026.05' as const;
export const NATIVE_HOST_NAME = 'com.intentflow.desktop';

export function createMessage<TPayload>(type: string, payload?: TPayload): IntentFlowMessage<TPayload> {
  return {
    id: crypto.randomUUID(),
    protocolVersion: BRIDGE_PROTOCOL_VERSION,
    source: 'extension',
    type,
    payload,
    sentAt: new Date().toISOString()
  };
}

export function isCompatibleProtocol(version?: string) {
  return version === BRIDGE_PROTOCOL_VERSION;
}
