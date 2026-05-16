import { describe, expect, it } from 'vitest';
import { BRIDGE_PROTOCOL_VERSION, createMessage, isCompatibleProtocol } from '../src/bridge/protocol';

describe('bridge protocol', () => {
  it('creates versioned extension messages', () => {
    const message = createMessage('bridge.ping', { ok: true });

    expect(message.protocolVersion).toBe(BRIDGE_PROTOCOL_VERSION);
    expect(message.source).toBe('extension');
    expect(message.type).toBe('bridge.ping');
    expect(message.payload).toEqual({ ok: true });
  });

  it('detects compatible bridge versions', () => {
    expect(isCompatibleProtocol(BRIDGE_PROTOCOL_VERSION)).toBe(true);
    expect(isCompatibleProtocol('2025.01')).toBe(false);
  });
});
