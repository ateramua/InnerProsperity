import { describe, expect, it } from 'vitest';
import { sessionIsExpired } from '../src/auth/sessionUtils';

describe('extension session lifecycle', () => {
  it('treats sessions expiring within the refresh window as expired', () => {
    expect(
      sessionIsExpired({
        authenticated: true,
        accessToken: 'token',
        expiresAt: new Date(Date.now() + 10_000).toISOString(),
        scopes: []
      })
    ).toBe(true);
  });

  it('keeps long-lived paired sessions active', () => {
    expect(
      sessionIsExpired({
        authenticated: true,
        accessToken: 'token',
        expiresAt: new Date(Date.now() + 600_000).toISOString(),
        scopes: []
      })
    ).toBe(false);
  });
});
