import { describe, expect, it } from 'vitest';
import { hashWithSalt } from '../hash';

describe('hashWithSalt', () => {
  it('produces a stable hash for the same input', async () => {
    const a = await hashWithSalt('192.168.1.1');
    const b = await hashWithSalt('192.168.1.1');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', async () => {
    const a = await hashWithSalt('1.2.3.4');
    const b = await hashWithSalt('1.2.3.5');
    expect(a).not.toBe(b);
  });

  it('output is 32 hex chars (128 bits)', async () => {
    const out = await hashWithSalt('test');
    expect(out).toMatch(/^[a-f0-9]{32}$/);
  });

  it('changes when AUDIT_HASH_SALT changes', async () => {
    const original = process.env.AUDIT_HASH_SALT;
    try {
      process.env.AUDIT_HASH_SALT = 'salt-A';
      const a = await hashWithSalt('ip');
      process.env.AUDIT_HASH_SALT = 'salt-B';
      const b = await hashWithSalt('ip');
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
