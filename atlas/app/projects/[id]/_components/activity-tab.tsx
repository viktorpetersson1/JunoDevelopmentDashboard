/**
 * Project Detail — Activity tab.
 *
 * Two sections:
 *
 *   1. Audit feed (NEW in T069) — every mutation that touched this
 *      project: project edits, capital calls, snapshot lifecycle. Joined
 *      against user_profiles for display names.
 *
 *   2. Lifecycle events — date-driven milestones from project metadata
 *      (purchase / listing / under contract / closing). Preserved from
 *      the original placeholder so the timeline is populated even when
 *      no audit rows exist yet.
 *
 * Both Server-renderable.
 */

import type { ProjectInput } from '@/lib/calc/project/types';
import type { AuditEntryView } from '@/lib/repos/audit-log';

interface ActivityRow {
  when: string;
  who: string;
  what: string;
  detail?: string;
}

const CATEGORY_LABEL: Record<string, string> = {
  project: 'Project',
  capital_call: 'Capital call',
  snapshot: 'Snapshot',
  service: 'Service',
  api: 'API',
};

const CATEGORY_COLOR: Record<string, string> = {
  project: 'var(--color-accent-base, #131313)',
  capital_call: 'var(--color-status-warning, #d97706)',
  snapshot: 'var(--color-status-info, #2563eb)',
  service: 'var(--color-text-tertiary)',
  api: 'var(--color-text-tertiary)',
};

export function ActivityTab({
  project,
  auditEntries,
  userDisplayNames,
}: {
  project: ProjectInput;
  auditEntries: AuditEntryView[];
  userDisplayNames: Record<string, string>;
}) {
  const lifecycleEvents = buildLifecycleEvents(project);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <AuditSection entries={auditEntries} userDisplayNames={userDisplayNames} />
      <LifecycleSection events={lifecycleEvents} />
    </div>
  );
}

// ─── Audit section ──────────────────────────────────────────────────────────

function AuditSection({
  entries,
  userDisplayNames,
}: {
  entries: AuditEntryView[];
  userDisplayNames: Record<string, string>;
}) {
  return (
    <section
      style={{
        background: 'var(--ja-card-bg)',
        border: 'var(--ja-card-border)',
        borderRadius: 'var(--ja-card-radius)',
        padding: 'var(--ja-card-padding)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 16,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: 16,
              fontWeight: 700,
              margin: 0,
              color: 'var(--color-text-primary)',
            }}
          >
            Activity feed
          </h2>
          <p
            style={{
              margin: '2px 0 0 0',
              fontSize: 12,
              color: 'var(--color-text-tertiary)',
            }}
          >
            Every mutation touching this project. From <code>atlas.audit_log</code>.
          </p>
        </div>
        <span
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
        </span>
      </header>

      {entries.length > 0 ? (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {entries.map((e, i) => (
            <AuditEntry
              key={e.id}
              entry={e}
              userName={e.userId ? (userDisplayNames[e.userId] ?? e.userId.slice(0, 8)) : 'system'}
              isLast={i === entries.length - 1}
            />
          ))}
        </ol>
      ) : (
        <p
          style={{
            margin: 0,
            padding: '24px 0',
            textAlign: 'center',
            color: 'var(--color-text-tertiary)',
            fontSize: 13,
          }}
        >
          No activity recorded yet. Mutations on this project — capital calls, snapshots, edits —
          appear here.
        </p>
      )}
    </section>
  );
}

/**
 * T114 (V6.1) — compressed vertical timeline entry (GitHub-style).
 * Was: 4-column wide grid. Now: tight 2-line row — label + body + hairline.
 */
function AuditEntry({
  entry,
  userName,
  isLast,
}: {
  entry: AuditEntryView;
  userName: string;
  isLast: boolean;
}) {
  const categoryColor = CATEGORY_COLOR[entry.category] ?? 'var(--color-text-tertiary)';
  const categoryLabel = CATEGORY_LABEL[entry.category] ?? entry.category;
  const isFail = entry.statusCode >= 400;

  return (
    <li
      style={{
        padding: '6px 0',
        borderBottom: isLast ? 'none' : '1px solid var(--color-border-subtle)',
      }}
    >
      {/* Line 1 — timestamp · actor · category */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          alignItems: 'baseline',
          fontSize: 12,
          color: 'var(--color-text-tertiary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>{formatTimestamp(entry.createdAt)}</span>
        <span>·</span>
        <span style={{ fontWeight: 700, color: 'var(--color-text-secondary)' }}>{userName}</span>
        <span>·</span>
        <span
          style={{
            color: categoryColor,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            fontSize: 10,
            fontWeight: 700,
          }}
        >
          {categoryLabel}
        </span>
        {isFail && (
          <span style={{ color: 'var(--color-negative, #b91c1c)', fontSize: 10, fontWeight: 700 }}>
            {entry.statusCode}
          </span>
        )}
      </div>
      {/* Line 2 — action + resource + meta */}
      <div
        style={{
          marginTop: 2,
          fontSize: 13,
          color: 'var(--color-text-primary)',
          display: 'flex',
          gap: 6,
          alignItems: 'baseline',
          flexWrap: 'wrap',
        }}
      >
        <span>{entry.action}</span>
        {entry.resourceId && (
          <code style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {entry.resourceId.length > 12 ? `${entry.resourceId.slice(0, 8)}…` : entry.resourceId}
          </code>
        )}
        {entry.meta && Object.keys(entry.meta).length > 0 && (
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {formatMetaSummary(entry.meta)}
          </span>
        )}
      </div>
    </li>
  );
}

function formatMetaSummary(meta: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(meta)) {
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') {
      parts.push(`${k}=${v}`);
    }
    if (parts.length >= 5) break;
  }
  return parts.join(' · ');
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  // YYYY-MM-DD HH:MM (UTC-ish via toISOString to stay deterministic)
  const date = d.toISOString().slice(0, 10);
  const time = d.toISOString().slice(11, 16);
  return `${date} ${time}`;
}

// ─── Lifecycle section ──────────────────────────────────────────────────────

function buildLifecycleEvents(project: ProjectInput): ActivityRow[] {
  const events: ActivityRow[] = [];
  if (project.purchase_date) {
    events.push({
      when: project.purchase_date,
      who: 'system',
      what: 'Project created',
      detail: `Stage: ${project.stage ?? project.status ?? 'unknown'}`,
    });
  }
  if (project.listing_date) {
    events.push({ when: project.listing_date, who: 'system', what: 'Listing date set' });
  }
  if (project.under_contract_date) {
    events.push({ when: project.under_contract_date, who: 'system', what: 'Under contract' });
  }
  if (project.closing_date) {
    events.push({ when: project.closing_date, who: 'system', what: 'Closing date set' });
  }
  events.sort((a, b) => a.when.localeCompare(b.when));
  return events;
}

function LifecycleSection({ events }: { events: ActivityRow[] }) {
  return (
    <section
      style={{
        background: 'var(--ja-card-bg)',
        border: 'var(--ja-card-border)',
        borderRadius: 'var(--ja-card-radius)',
        padding: 'var(--ja-card-padding)',
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          marginBottom: 16,
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            margin: 0,
            color: 'var(--color-text-primary)',
          }}
        >
          Lifecycle dates
        </h2>
        <span
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
          }}
        >
          {events.length} {events.length === 1 ? 'event' : 'events'}
        </span>
      </header>

      {events.length > 0 ? (
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {events.map((e, i) => (
            <li
              key={`${e.when}-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '120px 80px 1fr',
                gap: 16,
                padding: '12px 0',
                borderBottom:
                  i < events.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                fontSize: 13,
                alignItems: 'baseline',
              }}
            >
              <span
                style={{
                  color: 'var(--color-text-tertiary)',
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {e.when}
              </span>
              <span
                style={{
                  color: 'var(--color-text-secondary)',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {e.who}
              </span>
              <div>
                <div style={{ color: 'var(--color-text-primary)' }}>{e.what}</div>
                {e.detail && (
                  <div
                    style={{
                      color: 'var(--color-text-secondary)',
                      fontSize: 12,
                      marginTop: 2,
                    }}
                  >
                    {e.detail}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p
          style={{
            margin: 0,
            padding: '24px 0',
            textAlign: 'center',
            color: 'var(--color-text-tertiary)',
            fontSize: 13,
          }}
        >
          No lifecycle dates recorded yet.
        </p>
      )}
    </section>
  );
}
