/**
 * T073 / Surface 29 — States gallery.
 *
 * Dev-only catalog of every empty / loading / error state from real
 * surfaces. Gated to non-production via NODE_ENV check + middleware.
 *
 * Used as a smoke check during design + QA — does NOT replace Playwright.
 * Lives under /dev so the prefix can be banned in production builds (see
 * middleware.ts guard). NOTE: cannot use _dev — Next.js treats folders
 * with an underscore prefix as private and excludes them from routing.
 */

import { notFound } from 'next/navigation';
import { DashboardShell } from '../../_components/dashboard-shell';
// Direct imports rather than the barrel — the index re-exports stateful
// client components (Tooltip, Modal, Drawer, Avatar) and pulling them
// into a Server Component graph fails to compile.
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/feedback/EmptyState';
import { JunoMark, JunoThinking } from '@/components/brand';
import { requireAuthOrRedirect } from '@/lib/auth/requireAuth';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const runtime = 'edge';

interface StateEntry {
  id: string;
  surface: string;
  state: 'empty' | 'loading' | 'error' | 'success';
  preview: React.ReactNode;
}

const ENTRIES: StateEntry[] = [
  // ── Empty states ───────────────────────────────────────────────────────
  {
    id: 'projects-empty',
    surface: '/projects',
    state: 'empty',
    preview: (
      <EmptyState
        title="No projects yet"
        description="Create your first project to start tracking IRR, capital, and risks."
        action={{ label: 'New project', onClick: () => undefined }}
      />
    ),
  },
  {
    id: 'notifications-empty',
    surface: '/notifications',
    state: 'empty',
    preview: (
      <CardWrap>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 13 }}>
          Your inbox is empty.
        </p>
      </CardWrap>
    ),
  },
  {
    id: 'actuals-empty',
    surface: '/projects/:id?tab=actuals',
    state: 'empty',
    preview: (
      <CardWrap pad="32px 24px">
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            margin: 0,
            marginBottom: 8,
            color: 'var(--color-text-primary)',
          }}
        >
          No actuals ingested yet
        </h2>
        <p
          style={{
            margin: 0,
            color: 'var(--color-text-secondary)',
            fontSize: 13,
            maxWidth: 380,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          The <code>actuals_entries</code> table + ingest API land in T060. Once invoices &amp;
          payments flow in, this view will show plan vs actual variance.
        </p>
      </CardWrap>
    ),
  },
  {
    id: 'pipeline-column-empty',
    surface: '/pipeline (column with no cards)',
    state: 'empty',
    preview: (
      <section
        style={{
          background: 'var(--color-surface-sunken)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 12,
          padding: 12,
          minHeight: 160,
          maxWidth: 220,
        }}
      >
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Sold</div>
        <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginBottom: 8 }}>
          Closed within last 12 mo
        </div>
        <p
          style={{
            margin: 0,
            padding: '16px 0',
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
          }}
        >
          Empty column
        </p>
      </section>
    ),
  },

  // ── Loading states ─────────────────────────────────────────────────────
  {
    id: 'thinking-medium',
    surface: 'global · medium size',
    state: 'loading',
    preview: (
      <CardWrap>
        <JunoThinking size={48} label="Juno is thinking" />
      </CardWrap>
    ),
  },
  {
    id: 'thinking-small',
    surface: 'inline · small size',
    state: 'loading',
    preview: (
      <CardWrap>
        <JunoThinking size={20} label="Loading projects" />
      </CardWrap>
    ),
  },
  {
    id: 'thinking-no-label',
    surface: 'button-loading-state · 14px',
    state: 'loading',
    preview: (
      <CardWrap>
        <Button variant="primary" loading>
          Saving
        </Button>
      </CardWrap>
    ),
  },
  {
    id: 'thinking-large-column',
    surface: 'standalone · column layout',
    state: 'loading',
    preview: (
      <CardWrap pad="32px 24px">
        <JunoThinking size={56} direction="column" label="Running portfolio aggregator" />
      </CardWrap>
    ),
  },

  // ── Error states ───────────────────────────────────────────────────────
  {
    id: 'cap-table-sum-invalid',
    surface: '/settings?tab=cap-table',
    state: 'error',
    preview: (
      <CardWrap>
        <p
          role="alert"
          style={{ margin: 0, fontSize: 12, color: 'var(--color-negative, #dc2626)' }}
        >
          Shares must sum to exactly 100% before saving (current: 99.50%).
        </p>
      </CardWrap>
    ),
  },
  {
    id: 'cap-breach',
    surface: '/cashflow (LOC over cap)',
    state: 'error',
    preview: (
      <CardWrap>
        <p
          style={{
            margin: 0,
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
            color: 'var(--color-negative, #dc2626)',
          }}
        >
          ⚠ KPC LOC pool overdrawn in 3 months — true equity required.
        </p>
      </CardWrap>
    ),
  },
  {
    id: 'risks-breach',
    surface: '/projects/:id?tab=risks',
    state: 'error',
    preview: (
      <CardWrap>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12,
            fontWeight: 400,
            color: 'var(--color-negative, #dc2626)',
          }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: 'var(--color-negative, #dc2626)',
            }}
          />
          Breach · Peak equity $14.2M / threshold $10M
        </span>
      </CardWrap>
    ),
  },

  // ── Success states ─────────────────────────────────────────────────────
  {
    id: 'cap-table-saved',
    surface: '/settings?tab=cap-table',
    state: 'success',
    preview: (
      <CardWrap>
        <p
          role="status"
          style={{ margin: 0, fontSize: 12, color: 'var(--color-positive, #16a34a)' }}
        >
          Saved.
        </p>
      </CardWrap>
    ),
  },
  {
    id: 'brand-mark-static',
    surface: 'brand · sign-in lockup',
    state: 'success',
    preview: (
      <CardWrap pad="32px 24px">
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <JunoMark size={56} ariaLabel="Juno" />
          <span style={{ fontSize: 15, fontWeight: 700 }}>Juno Atlas</span>
        </div>
      </CardWrap>
    ),
  },
];

export default async function StatesGalleryPage() {
  // Hard gate: production never serves this route.
  if (process.env.NODE_ENV === 'production') notFound();

  const { profile, user } = await requireAuthOrRedirect('/dev/states');
  const dashboardUser = {
    name: profile.displayName ?? profile.email ?? user.email ?? 'Juno',
    email: profile.email ?? user.email ?? '',
  };

  const sections = (['empty', 'loading', 'error', 'success'] as const).map((kind) => ({
    kind,
    entries: ENTRIES.filter((e) => e.state === kind),
  }));

  return (
    <DashboardShell activeHref="/dev/states" user={dashboardUser}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        <header>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 700,
              margin: 0,
              color: 'var(--color-text-primary)',
            }}
          >
            States gallery
          </h1>
          <p
            style={{
              margin: '4px 0 0 0',
              fontSize: 13,
              color: 'var(--color-text-secondary)',
            }}
          >
            Dev only · {ENTRIES.length} catalogued states across{' '}
            {sections.filter((s) => s.entries.length > 0).length} categories
          </p>
        </header>
        {sections.map((s) => (
          <SectionBlock key={s.kind} kind={s.kind} entries={s.entries} />
        ))}
      </div>
    </DashboardShell>
  );
}

function SectionBlock({
  kind,
  entries,
}: {
  kind: 'empty' | 'loading' | 'error' | 'success';
  entries: StateEntry[];
}) {
  if (entries.length === 0) return null;
  const label =
    kind === 'empty'
      ? 'Empty states'
      : kind === 'loading'
        ? 'Loading states'
        : kind === 'error'
          ? 'Error states'
          : 'Success states';
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2
        style={{
          fontSize: 11,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-text-tertiary)',
          margin: 0,
        }}
      >
        {label} · {entries.length}
      </h2>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: 12,
        }}
      >
        {entries.map((e) => (
          <article
            key={e.id}
            style={{
              border: '1px solid var(--color-border-hairline)',
              borderRadius: 14,
              padding: 12,
              background: 'var(--color-surface-base)',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            <header style={{ display: 'flex', justifyContent: 'space-between' }}>
              <code style={{ fontSize: 11, color: 'var(--color-text-secondary)' }}>{e.id}</code>
              <span style={{ fontSize: 10, color: 'var(--color-text-tertiary)' }}>{e.surface}</span>
            </header>
            <div>{e.preview}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

/** Reusable demo card wrapper so previews look consistent. */
function CardWrap({ children, pad = '24px' }: { children: React.ReactNode; pad?: string }) {
  return (
    <div
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 12,
        padding: pad,
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  );
}
