/**
 * Project Detail — Timeline tab. Server-renderable.
 *
 * Renders the 4-phase project timeline (Sourcing → Pre-construction →
 * Construction → Sales) as horizontal bars on a month grid, plus a
 * monthly cost burn list driven by `result.monthly`.
 *
 * Per docs/handoff/COMPONENT_BUILD_ORDER.md C5 / INVENTORY.md §9.
 */

import { KPIStrip } from '@/components/data/KPIStrip';
import { KPITile } from '@/components/data/KPITile';
import { formatMoney } from '@/lib/utils/money';
import type { ProjectInput, ProjectResult } from '@/lib/calc/project/types';

interface PhaseSegment {
  id: string;
  label: string;
  months: number;
  color: string;
}

const PHASE_COLORS: Record<string, string> = {
  sourcing: 'var(--color-text-quaternary)',
  permitting: 'var(--color-info)',
  construction: 'var(--color-accent-lime)',
  sales: 'var(--color-positive)',
};

export function TimelineTab({ project, result }: { project: ProjectInput; result: ProjectResult }) {
  const phases: PhaseSegment[] = [
    {
      id: 'sourcing',
      label: 'Sourcing',
      months: project.sourcing_months ?? 0,
      color: PHASE_COLORS.sourcing!,
    },
    {
      id: 'permitting',
      label: 'Permitting',
      months: project.permitting_preconstruction_months ?? 0,
      color: PHASE_COLORS.permitting!,
    },
    {
      id: 'construction',
      label: 'Construction',
      months: project.construction_months ?? 0,
      color: PHASE_COLORS.construction!,
    },
    { id: 'sales', label: 'Sales', months: project.sales_months ?? 0, color: PHASE_COLORS.sales! },
  ].filter((p) => p.months > 0);

  const totalMonths = phases.reduce((s, p) => s + p.months, 0);

  // Monthly burn — sum of all cost categories (positive = outflow). Drop
  // months with zero activity for compactness.
  const burn = result.monthly.dates.map((date, i) => {
    const out =
      -(result.monthly.land_cost[i] ?? 0) -
      (result.monthly.build_cost[i] ?? 0) -
      (result.monthly.kingshaus[i] ?? 0) -
      (result.monthly.soft_cost[i] ?? 0);
    return { date, out };
  });
  const activeBurn = burn.filter((m) => m.out > 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <KPIStrip columns={4}>
        <KPITile label="Program" value={`${totalMonths} mo`} hint="end-to-end" />
        <KPITile
          label="Start"
          value={result.start_date ?? '—'}
          hint={project.purchase_date ?? undefined}
        />
        <KPITile label="Sale" value={result.sale_date ?? '—'} hint="closing target" />
        <KPITile
          label="Total dev cost"
          value={formatMoney(result.kpis.total_dev_cost * 100, { compact: true, precision: 2 })}
          hint="land + build + soft"
        />
      </KPIStrip>

      <section
        style={{
          background: 'var(--ja-card-bg)',
          border: 'var(--ja-card-border)',
          borderRadius: 'var(--ja-card-radius)',
          padding: 'var(--ja-card-padding)',
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            margin: 0,
            marginBottom: 16,
            color: 'var(--color-text-primary)',
          }}
        >
          Phase plan
        </h2>

        <div
          role="img"
          aria-label="Project phase timeline"
          style={{
            display: 'flex',
            width: '100%',
            height: 32,
            borderRadius: 6,
            overflow: 'hidden',
            border: 'var(--ja-card-border)',
          }}
        >
          {phases.map((p) => (
            <div
              key={p.id}
              title={`${p.label} — ${p.months} months`}
              style={{
                flex: p.months,
                background: p.color,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 400,
                color:
                  p.id === 'construction'
                    ? 'var(--color-text-on-lime)'
                    : 'var(--color-text-inverse)',
              }}
            >
              {p.months >= 2 ? p.label : ''}
            </div>
          ))}
        </div>

        <ul
          style={{
            display: 'flex',
            gap: 24,
            listStyle: 'none',
            padding: 0,
            margin: '16px 0 0 0',
            flexWrap: 'wrap',
          }}
        >
          {phases.map((p) => (
            <li
              key={p.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                fontSize: 12,
                color: 'var(--color-text-secondary)',
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  background: p.color,
                  borderRadius: 3,
                  display: 'inline-block',
                }}
              />
              {p.label} · {p.months} mo
            </li>
          ))}
        </ul>
      </section>

      <section
        style={{
          background: 'var(--ja-card-bg)',
          border: 'var(--ja-card-border)',
          borderRadius: 'var(--ja-card-radius)',
          padding: 'var(--ja-card-padding)',
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 700,
            margin: 0,
            marginBottom: 16,
            color: 'var(--color-text-primary)',
          }}
        >
          Monthly burn
        </h2>
        <table
          className="ja-table"
          style={{
            width: '100%',
            borderCollapse: 'collapse',
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: 'left',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-tertiary)',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--color-border-hairline)',
                }}
              >
                Month
              </th>
              <th
                style={{
                  textAlign: 'right',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'var(--color-text-tertiary)',
                  padding: '8px 0',
                  borderBottom: '1px solid var(--color-border-hairline)',
                }}
              >
                Outflow
              </th>
            </tr>
          </thead>
          <tbody>
            {activeBurn.map((m) => (
              <tr key={m.date}>
                <td
                  style={{
                    padding: '6px 0',
                    fontSize: 13,
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {m.date}
                </td>
                <td
                  style={{
                    padding: '6px 0',
                    fontSize: 13,
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--color-text-primary)',
                  }}
                >
                  {formatMoney(m.out * 100, { precision: 0 })}
                </td>
              </tr>
            ))}
            {activeBurn.length === 0 && (
              <tr>
                <td
                  colSpan={2}
                  style={{
                    padding: '24px 0',
                    textAlign: 'center',
                    color: 'var(--color-text-tertiary)',
                    fontSize: 13,
                  }}
                >
                  No active cost months in window.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
