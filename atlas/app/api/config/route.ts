/**
 * GET /api/config
 *
 * Returns runtime feature flags + Sentry DSN + design tokens map. The token
 * map mirrors the build-time values from app/tokens.css so the client can
 * reference them for inline styles when needed (charts, etc.).
 *
 * 401 when no session — config can include internal flag names that aren't
 * safe to expose anonymously.
 *
 * Shape per API_CONTRACTS.md §1.x:
 *   { data: { flags: string[], sentryDsn: string | null, tokens: Record<string,string> } }
 */
import { ok } from '@/lib/api/response';
import { withErrorBoundary } from '@/lib/api/handler';
import { requireAuth } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function parseFlags(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const GET = withErrorBoundary(async () => {
  await requireAuth();

  return ok({
    flags: parseFlags(process.env.ATLAS_FEATURE_FLAGS),
    sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? null,
    // Token map is intentionally narrow — only the chart palette consumers
    // need at runtime. Surfaces should reference the CSS vars directly.
    tokens: {
      chart1: 'var(--color-chart-1)',
      chart2: 'var(--color-chart-2)',
      chart3: 'var(--color-chart-3)',
      chart4: 'var(--color-chart-4)',
      chart5: 'var(--color-chart-5)',
      chart6: 'var(--color-chart-6)',
    },
  });
});
