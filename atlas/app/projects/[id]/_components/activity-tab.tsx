/**
 * Project Detail — Activity tab. Server-renderable.
 *
 * Audit log + activity feed (capital calls, approvals, edits) ships in T069
 * once the audit_log table is populated. For now this surfaces the
 * provenance signals we already have: project version + system-of-record
 * date + Excel baseline snapshot.
 */

import type { ProjectInput } from '@/lib/calc/project/types';

interface ActivityRow {
  when: string;
  who: string;
  what: string;
  detail?: string;
}

export function ActivityTab({ project }: { project: ProjectInput }) {
  // Seeded events. Real entries flow from audit_log once T069 ships.
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
    events.push({
      when: project.listing_date,
      who: 'system',
      what: 'Listing date set',
    });
  }
  if (project.under_contract_date) {
    events.push({
      when: project.under_contract_date,
      who: 'system',
      what: 'Under contract',
    });
  }
  if (project.closing_date) {
    events.push({
      when: project.closing_date,
      who: 'system',
      what: 'Closing date set',
    });
  }
  events.sort((a, b) => a.when.localeCompare(b.when));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <section
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          padding: 24,
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
              fontWeight: 600,
              margin: 0,
              color: 'var(--color-text-primary)',
            }}
          >
            Lifecycle events
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

      <section
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          padding: '32px 24px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            margin: 0,
            color: 'var(--color-text-secondary)',
            fontSize: 13,
            maxWidth: 480,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          Full audit-log feed (edits, approvals, capital calls) wires up in
          T069 once the <code>audit_log</code> table starts collecting rows.
        </p>
      </section>
    </div>
  );
}
