import { describe, expect, it } from 'vitest';
import { hashWithSalt } from '../hash';

describe('hashWithSalt', () => {
  it('produces a stable hash for the same input', () => {
    const a = hashWithSalt('192.168.1.1');
    const b = hashWithSalt('192.168.1.1');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', () => {
    const a = hashWithSalt('1.2.3.4');
    const b = hashWithSalt('1.2.3.5');
    expect(a).not.toBe(b);
  });

  it('output is 32 hex chars (128 bits)', () => {
    const out = hashWithSalt('test');
    expect(out).toMatch(/^[a-f0-9]{32}$/);
  });

  it('changes when AUDIT_HASH_SALT changes', () => {
    const original = process.env.AUDIT_HASH_SALT;
    try {
      process.env.AUDIT_HASH_SALT = 'salt-A';
      const a = hashWithSalt('ip');
      process.env.AUDIT_HASH_SALT = 'salt-B';
      const b = hashWithSalt('ip');
      expect(a).not.toBe(b);
    } finally {
      if (original !== undefined) {
        process.env.AUDIT_HASH_SALT = original;
      } else {
        delete process.env.AUDIT_HASH_SALT;
      }
    }
  });
});
