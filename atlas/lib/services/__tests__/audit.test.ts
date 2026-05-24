import { describe, expect, it } from 'vitest';
import { redactPII } from '../audit';

describe('redactPII', () => {
  it('returns primitives unchanged', () => {
    expect(redactPII(null)).toBe(null);
    expect(redactPII(undefined)).toBe(undefined);
    expect(redactPII(42)).toBe(42);
    expect(redactPII('hello')).toBe('hello');
  });

  it('redacts known sensitive fields case-insensitively', () => {
    expect(redactPII({ email: 'a@b.c', password: 'pw' })).toEqual({
      email: 'a@b.c',
      password: '[REDACTED]',
    });
    expect(redactPII({ Password_Hash: 'x' })).toEqual({ Password_Hash: '[REDACTED]' });
    expect(redactPII({ inviteToken: 't' })).toEqual({ inviteToken: '[REDACTED]' });
  });

  it('recursively walks nested objects + arrays', () => {
    const input = {
      user: { name: 'A', password: 'pw' },
      tokens: [{ access_token: 't1' }, { access_token: 't2' }],
    };
    expect(redactPII(input)).toEqual({
      user: { name: 'A', password: '[REDACTED]' },
      tokens: [{ access_token: '[REDACTED]' }, { access_token: '[REDACTED]' }],
    });
  });

  it('does not redact fields that merely contain sensitive substrings', () => {
    // 'passwords_count' is fine — we only redact exact-match field names.
    expect(redactPII({ passwords_count: 3 })).toEqual({ passwords_count: 3 });
  });
});
