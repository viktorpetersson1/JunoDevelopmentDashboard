/**
 * GET /api/me
 *
 * Returns the authenticated user + their profile (display name, role).
 * 401 when no session.
 * Shape per API_CONTRACTS.md §1.x:
 *   { data: { user: { id, email }, profile: { displayName, role }, org: { id, name } } }
 */
import { ok } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

export const GET = withErrorBoundary(async () => {
  const { user, profile } = await requireAuth();

  // Single-org for P0 (atlas.orgs has one row, seeded in T002 migration).
  // Multi-org switching comes post-P0; org metadata is therefore static.
  return ok({
    user: {
      id: user.id,
      email: user.email ?? profile.email,
    },
    profile: {
      displayName: profile.displayName,
      role: profile.role,
    },
    org: {
      id: 'juno',
      name: 'Juno',
    },
  });
});
