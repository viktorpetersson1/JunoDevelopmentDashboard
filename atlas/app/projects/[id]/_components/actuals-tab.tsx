/**
 * Project Detail — Actuals tab (T066).
 *
 * Sections:
 *   1. KPI strip — planned (calc engine total) vs actual to-date with
 *      variance + % complete.
 *   2. Plan-vs-actual per category — table comparing calc engine totals
 *      to summed actuals_entries by category.
 *   3. Entries client (with admin "Add entry" modal).
 */

import type { ProjectResult } from '@/lib/calc/project/types';
import { KPIStrip } from '@/components/data/KPIStrip';
import { KPITile } from '@/components/data/KPITile';
import { formatMoney } from '@/lib/utils/money';
import { ActualsClient } from './actuals-client';
import type { ActualsByCategory } from '@/lib/services/actuals';
import type { ActualsCategory } from '@/lib/repos/actuals';

const CATEGORY_LABELS: Record<ActualsCategory, string> = {
  land: 'Land',
  build: 'Build',
  soft: 'Soft costs',
  kingshaus: 'Superstructure',
  financing: 'Financing',
  other: 'Other',
};

/**
 * The calc engine emits monthly cost streams as NEGATIVE dollars (cash
 * out). Sum the absolute values so plan totals are positive and
 * comparable to actual invoices.
 */
function planByCategory(result: ProjectResult): Record<ActualsCategory, number> {
  const m = result.monthly;
  const sumAbs = (arr: number[]): number => arr.reduce((s, v) => s + (v < 0 ? -v : v), 0);
  return {
    land: sumAbs(m.land_cost),
    build: sumAbs(m.build_cost),
    soft: sumAbs(m.soft_cost),
    kingshaus: sumAbs(m.kingshaus),
    financing: sumAbs(m.interest),
    other: 0,
  };
}

export function ActualsTab({
  result,
  projectUuid,
  projectKey,
  byCategory,
  totalCents,
  isEditor,
}: {
  result: ProjectResult;
  projectUuid: string | null;
  projectKey: string;
  byCategory: ActualsByCategory[];
  totalCents: number;
  isEditor: boolean;
}) {
  const plan = planByCategory(result);
  const planTotalCents = Object.values(plan).reduce((s, v) => s + Math.round(v * 100), 0);
  const varianceCents = totalCents - planTotalCents;
  const variancePct = planTotalCents > 0 ? varianceCents / planTotalCents : 0;
  const entriesTotal = byCategory.reduce((s, g) => s + g.entries.length, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* T103.3 — empty-state banner. When no actuals exist the variance
          column would show red numbers vs plan — that looks like overruns but
          is really just "nothing booked yet". Show a muted informational
          banner instead so the reader doesn't misread it. */}
      {entriesTotal === 0 && (
        <div
          role="status"
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            border: '1px solid var(--color-border-hairline)',
            background: 'var(--color-surface-muted)',
            fontSize: 13,
            color: 'var(--color-text-secondary)',
          }}
        >
          No cost entries yet — variances will appear once invoices are logged.
          {isEditor && (
            <span style={{ marginLeft: 6, color: 'var(--color-text-tertiary)' }}>
              Use the Add entry button below to record the first cost.
            </span>
          )}
        </div>
      )}
      <KPIStrip columns={4}>
        <KPITile
          label="Planned (calc)"
          value={formatMoney(planTotalCents, { compact: true, precision: 2 })}
          hint="dev cost total"
        />
        <KPITile
          label="Actual to date"
          value={formatMoney(totalCents, { compact: true, precision: 2 })}
          hint={`${entriesTotal} ${entriesTotal === 1 ? 'entry' : 'entries'}`}
        />
        <KPITile
          label="Variance"
          value={
            totalCents === 0 ? '—' : formatMoney(varianceCents, { compact: true, precision: 2 })
          }
          hint={totalCents === 0 ? 'no actuals yet' : `${(variancePct * 100).toFixed(1)}% vs plan`}
        />
        <KPITile
          label="% complete"
          value={
            planTotalCents > 0
              ? `${Math.min(100, (totalCents / planTotalCents) * 100).toFixed(0)}%`
              : '—'
          }
          hint="dollars billed / dollars planned"
        />
      </KPIStrip>

      <section
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          padding: 24,
          overflowX: 'auto',
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
          Plan vs actual by category
        </h2>
        <table className="ja-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th align="left">Category</Th>
              <Th align="right">Planned</Th>
              <Th align="right">Actual</Th>
              <Th align="right">Variance</Th>
              <Th align="right">% of plan</Th>
              <Th align="right">Entries</Th>
            </tr>
          </thead>
          <tbody>
            {byCategory.map((g) => {
              const planCents = Math.round((plan[g.category] ?? 0) * 100);
              const variance = g.totalCents - planCents;
              const pct = planCents > 0 ? g.totalCents / planCents : 0;
              const varianceColor =
                planCents === 0 && g.totalCents === 0
                  ? 'var(--color-text-tertiary)'
                  : variance > 0
                    ? 'var(--color-negative, #dc2626)'
                    : variance < 0
                      ? 'var(--color-positive, #16a34a)'
                      : 'var(--color-text-tertiary)';
              return (
                <tr key={g.category}>
                  <Td>{CATEGORY_LABELS[g.category]}</Td>
                  <TdMoney cents={planCents} muted={planCents === 0} />
                  <TdMoney cents={g.totalCents} muted={g.totalCents === 0} />
                  <td
                    style={{
                      padding: '8px 12px 8px 0',
                      fontSize: 13,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color: varianceColor,
                      borderBottom: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    {g.totalCents === 0 && planCents === 0
                      ? '—'
                      : (variance > 0 ? '+' : '') +
                        formatMoney(variance, { compact: true, precision: 1 })}
                  </td>
                  <td
                    style={{
                      padding: '8px 12px 8px 0',
                      fontSize: 13,
                      textAlign: 'right',
                      fontVariantNumeric: 'tabular-nums',
                      color:
                        planCents > 0 ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                      borderBottom: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    {planCents > 0 ? `${(pct * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td
                    style={{
                      padding: '8px 0',
                      textAlign: 'right',
                      fontSize: 12,
                      color: 'var(--color-text-tertiary)',
                      borderBottom: '1px solid var(--color-border-subtle)',
                    }}
                  >
                    {g.entries.length}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>

      <ActualsClient
        projectKey={projectKey}
        projectUuid={projectUuid}
        byCategory={byCategory}
        isEditor={isEditor}
      />
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-text-tertiary)',
        padding: '8px 12px 8px 0',
        borderBottom: '1px solid var(--color-border-hairline)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: '8px 12px 8px 0',
        fontSize: 13,
        color: 'var(--color-text-primary)',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      {children}
    </td>
  );
}

function TdMoney({ cents, muted = false }: { cents: number; muted?: boolean }) {
  return (
    <td
      style={{
        padding: '8px 12px 8px 0',
        fontSize: 13,
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        color: muted ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      {cents === 0 ? '—' : formatMoney(cents, { compact: true, precision: 2 })}
    </td>
  );
}
