import { describe, expect, it } from 'vitest';
import { hasRole, requireRole, requireSuperAdmin, requireEditor } from '../requireRole';
import { ForbiddenError } from '../requireAuth';
import type { UserProfile } from '../profile';

const PROFILE = (role: UserProfile['role']): UserProfile => ({
  id: 'u1',
  email: 'a@b.c',
  displayName: 'A',
  role,
});

describe('hasRole', () => {
  it('returns true when role is in allowed set', () => {
    expect(hasRole(PROFILE('editor'), ['editor', 'super_admin'])).toBe(true);
  });

  it('returns false when role is not in allowed set', () => {
    expect(hasRole(PROFILE('viewer'), ['editor', 'super_admin'])).toBe(false);
  });
});

describe('requireRole', () => {
  it('does not throw when role is allowed', () => {
    expect(() => requireRole(PROFILE('super_admin'), ['super_admin'])).not.toThrow();
  });

  it('throws ForbiddenError when role is not allowed', () => {
    expect(() => requireRole(PROFILE('viewer'), ['super_admin'])).toThrow(ForbiddenError);
  });

  it('error includes role + allowed list for debugging', () => {
    try {
      requireRole(PROFILE('viewer_basic'), ['super_admin', 'editor']);
    } catch (e) {
      expect(e).toBeInstanceOf(ForbiddenError);
      expect((e as Error).message).toContain('viewer_basic');
      expect((e as Error).message).toContain('super_admin');
    }
  });
});

describe('requireSuperAdmin + requireEditor', () => {
  it('requireSuperAdmin admits only super_admin', () => {
    expect(() => requireSuperAdmin(PROFILE('super_admin'))).not.toThrow();
    expect(() => requireSuperAdmin(PROFILE('editor'))).toThrow(ForbiddenError);
    expect(() => requireSuperAdmin(PROFILE('viewer'))).toThrow(ForbiddenError);
  });

  it('requireEditor admits super_admin + editor', () => {
    expect(() => requireEditor(PROFILE('super_admin'))).not.toThrow();
    expect(() => requireEditor(PROFILE('editor'))).not.toThrow();
    expect(() => requireEditor(PROFILE('viewer'))).toThrow(ForbiddenError);
  });
});

describe('ForbiddenError shape', () => {
  it('exposes status 403 and code FORBIDDEN', () => {
    const e = new ForbiddenError();
    expect(e.status).toBe(403);
    expect(e.code).toBe('FORBIDDEN');
  });
});
