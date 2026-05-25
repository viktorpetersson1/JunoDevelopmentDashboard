/**
 * Project Detail — Actuals tab. Server-renderable.
 *
 * The actuals_entries table + ingest path land in T060 (W4). Until then,
 * this tab compares the calc engine's planned cash flow against an empty
 * actuals set so the framing/UX is locked in.
 *
 * Rendered: planned vs actual KPI strip (actuals = 0 placeholders) and
 * an empty-state card pointing at T060.
 */

import { KPIStrip } from '@/components/data/KPIStrip';
import { KPITile } from '@/components/data/KPITile';
import { formatMoney } from '@/lib/utils/money';
import type { ProjectResult } from '@/lib/calc/project/types';

export function ActualsTab({ result }: { result: ProjectResult }) {
  const k = result.kpis;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <KPIStrip columns={4}>
        <KPITile
          label="Planned dev cost"
          value={formatMoney(k.total_dev_cost * 100, { compact: true, precision: 2 })}
          hint="from calc engine"
        />
        <KPITile label="Actual dev cost" value="—" hint="awaiting T060" />
        <KPITile
          label="Planned interest"
          value={formatMoney(k.total_interest * 100, { compact: true, precision: 2 })}
        />
        <KPITile label="Actual interest" value="—" hint="awaiting T060" />
      </KPIStrip>

      <section
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          padding: '48px 32px',
          textAlign: 'center',
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
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
            maxWidth: 480,
            marginLeft: 'auto',
            marginRight: 'auto',
          }}
        >
          The <code>actuals_entries</code> table + ingest API land in T060.
          Once invoices &amp; payments flow in, this view will show plan vs
          actual variance per cost category and month.
        </p>
      </section>
    </div>
  );
}
