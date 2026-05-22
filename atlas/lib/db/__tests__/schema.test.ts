import { describe, expect, it } from 'vitest';
import { atlas, orgs, auditLog, userProfiles, authUsers } from '../schema';

// Schema invariants that don't need a live DB connection.
// Connection-dependent tests live in tests/integration/ and are skipped
// in CI until DATABASE_URL is wired (T076).
describe('atlas db schema', () => {
  it('declares the atlas Postgres schema', () => {
    expect(atlas).toBeDefined();
    expect(typeof atlas.table).toBe('function');
  });

  it('atlas.orgs has the expected columns', () => {
    const cols = Object.keys(orgs);
    expect(cols).toContain('id');
    expect(cols).toContain('name');
    expect(cols).toContain('createdAt');
    expect(cols).toContain('updatedAt');
  });

  it('atlas.audit_log has the expected columns', () => {
    const cols = Object.keys(auditLog);
    expect(cols).toContain('id');
    expect(cols).toContain('orgId');
    expect(cols).toContain('userId');
    expect(cols).toContain('route');
    expect(cols).toContain('method');
    expect(cols).toContain('statusCode');
    expect(cols).toContain('beforeJson');
    expect(cols).toContain('afterJson');
    expect(cols).toContain('ipHash');
    expect(cols).toContain('userAgent');
    expect(cols).toContain('createdAt');
  });

  it('declares external (read-only) auth.users + public.user_profiles for typed reads', () => {
    expect(authUsers).toBeDefined();
    expect(userProfiles).toBeDefined();
    // user_profiles role is the enum vanilla owns
    expect(Object.keys(userProfiles)).toContain('role');
  });
});
