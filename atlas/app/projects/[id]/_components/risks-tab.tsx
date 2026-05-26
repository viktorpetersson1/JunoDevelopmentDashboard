/**
 * Project Detail — Risks tab. Server-renderable.
 *
 * Compares project KPIs against the same thresholds used in
 * `public/engine.js::riskFlags`. Thresholds are hard-coded here pending
 * Globals.risk_* fields being added to the typed Globals contract (deferred
 * to follow-up — they live in BASELINE_GLOBALS today but aren't on the
 * interface).
 *
 * T068 adds an approval-snapshot-freshness row so a project running on a
 * stale or missing locked snapshot surfaces as a governance risk, not
 * just a financial one.
 */

import { KPIStrip } from '@/components/data/KPIStrip';
import { KPITile } from '@/components/data/KPITile';
import { formatMoney } from '@/lib/utils/money';
import type { ProjectResult } from '@/lib/calc/project/types';
import type { ApprovalSnapshotView } from '@/lib/repos/approval-snapshot';

// Thresholds mirror public/data.js::BASELINE_GLOBALS risk_* keys (snapshot
// 2026-05-10). Hard-coded until Globals interface adds them — see header.
const THRESHOLDS = {
  peak_equity_max: 10_000_000,
  peak_debt_max: 25_000_000,
  moic_min: 1.3,
  irr_annual_min: 0.2,
  margin_min: 0.15,
} as const;

type Status = 'ok' | 'warn' | 'breach';

interface RiskRow {
  label: string;
  status: Status;
  actual: string;
  threshold: string;
  note: string;
}

function statusFor(actual: number, threshold: number, dir: 'min' | 'max'): Status {
  if (dir === 'min') {
    if (actual >= threshold) return 'ok';
    if (actual >= threshold * 0.85) return 'warn';
    return 'breach';
  }
  if (actual <= threshold) return 'ok';
  if (actual <= threshold * 1.15) return 'warn';
  return 'breach';
}

const STATUS_COLOR: Record<Status, string> = {
  ok: 'var(--color-positive)',
  warn: 'var(--color-status-warning, #d97706)',
  breach: 'var(--color-negative)',
};

const STATUS_LABEL: Record<Status, string> = {
  ok: 'OK',
  warn: 'Watch',
  breach: 'Breach',
};

const SNAPSHOT_FRESH_DAYS = 30;
const SNAPSHOT_WARN_DAYS = 60;

function snapshotAgeRow(latestLocked: ApprovalSnapshotView | null): RiskRow {
  if (!latestLocked || !latestLocked.lockedAt) {
    return {
      label: 'Approval snapshot',
      status: 'breach',
      actual: 'None',
      threshold: `≤ ${SNAPSHOT_FRESH_DAYS}d old`,
      note: 'No locked snapshot — gate for permitting → construction',
    };
  }
  const ageMs = Date.now() - new Date(latestLocked.lockedAt).getTime();
  const ageDays = Math.max(0, Math.floor(ageMs / 86_400_000));
  const status: Status =
    ageDays <= SNAPSHOT_FRESH_DAYS ? 'ok' : ageDays <= SNAPSHOT_WARN_DAYS ? 'warn' : 'breach';
  const approvers = latestLocked.approvedBy.length;
  const fullyApproved = approvers >= 2;
  return {
    label: 'Approval snapshot',
    status,
    actual: `${ageDays}d old · ${latestLocked.snapshotVersion}`,
    threshold: `≤ ${SNAPSHOT_FRESH_DAYS}d`,
    note: fullyApproved
      ? `${approvers} approvers · last locked ${latestLocked.lockedAt.slice(0, 10)}`
      : 'Locked but awaiting second approver',
  };
}

export function RisksTab({
  result,
  latestLockedSnapshot = null,
}: {
  result: ProjectResult;
  latestLockedSnapshot?: ApprovalSnapshotView | null;
}) {
  const k = result.kpis;
  const irrAnnual = k.irr_annual ?? 0;

  const rows: RiskRow[] = [
    {
      label: 'Peak equity',
      status: statusFor(k.peak_equity, THRESHOLDS.peak_equity_max, 'max'),
      actual: formatMoney(k.peak_equity * 100, { compact: true, precision: 2 }),
      threshold: `≤ ${formatMoney(THRESHOLDS.peak_equity_max * 100, { compact: true, precision: 0 })}`,
      note: 'Cap on LOC + true equity per project',
    },
    {
      label: 'Peak debt',
      status: statusFor(k.peak_debt, THRESHOLDS.peak_debt_max, 'max'),
      actual: formatMoney(k.peak_debt * 100, { compact: true, precision: 2 }),
      threshold: `≤ ${formatMoney(THRESHOLDS.peak_debt_max * 100, { compact: true, precision: 0 })}`,
      note: 'Senior facility ceiling',
    },
    {
      label: 'MOIC',
      status: statusFor(k.moic, THRESHOLDS.moic_min, 'min'),
      actual: `${k.moic.toFixed(2)}×`,
      threshold: `≥ ${THRESHOLDS.moic_min.toFixed(2)}×`,
      note: 'Equity multiple, gross of tax',
    },
    {
      label: 'IRR (annual)',
      status:
        k.irr_annual === null
          ? 'warn'
          : statusFor(irrAnnual, THRESHOLDS.irr_annual_min, 'min'),
      actual: k.irr_annual === null ? '—' : `${(irrAnnual * 100).toFixed(1)}%`,
      threshold: `≥ ${(THRESHOLDS.irr_annual_min * 100).toFixed(0)}%`,
      note: k.irr_annual === null ? 'Insufficient cash flow signal' : 'Annualized IRR',
    },
    {
      label: 'Margin',
      status: statusFor(k.profit_margin_pct, THRESHOLDS.margin_min, 'min'),
      actual: `${(k.profit_margin_pct * 100).toFixed(1)}%`,
      threshold: `≥ ${(THRESHOLDS.margin_min * 100).toFixed(0)}%`,
      note: 'Profit / total sale value',
    },
    snapshotAgeRow(latestLockedSnapshot),
  ];

  const breachCount = rows.filter((r) => r.status === 'breach').length;
  const watchCount = rows.filter((r) => r.status === 'warn').length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <KPIStrip columns={3}>
        <KPITile
          label="Breaches"
          value={String(breachCount)}
          delta={
            breachCount > 0
              ? { value: 'review', direction: 'down' }
              : { value: 'clear', direction: 'up' }
          }
        />
        <KPITile label="Watch" value={String(watchCount)} hint="within 15% of threshold" />
        <KPITile
          label="Margin headroom"
          value={`${((k.profit_margin_pct - THRESHOLDS.margin_min) * 100).toFixed(1)}%`}
          hint={`floor ${(THRESHOLDS.margin_min * 100).toFixed(0)}%`}
        />
      </KPIStrip>

      <section
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          padding: 24,
        }}
      >
        <h2
          style={{
            fontSize: 16,
            fontWeight: 600,
            margin: 0,
            marginBottom: 16,
            color: 'var(--color-text-primary)',
          }}
        >
          Risk checks
        </h2>
        <table className="ja-table" style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <ThL>Metric</ThL>
              <ThL>Status</ThL>
              <ThR>Actual</ThR>
              <ThR>Threshold</ThR>
              <ThL>Note</ThL>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <Td>{r.label}</Td>
                <Td>
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      color: STATUS_COLOR[r.status],
                    }}
                  >
                    <span
                      style={{
                        width: 8,
                        height: 8,
                        borderRadius: '50%',
                        background: STATUS_COLOR[r.status],
                        display: 'inline-block',
                      }}
                    />
                    {STATUS_LABEL[r.status]}
                  </span>
                </Td>
                <TdN>{r.actual}</TdN>
                <TdN>{r.threshold}</TdN>
                <Td muted>{r.note}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function ThL({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'left',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-text-tertiary)',
        padding: '8px 12px 8px 0',
        borderBottom: '1px solid var(--color-border-hairline)',
      }}
    >
      {children}
    </th>
  );
}

function ThR({ children }: { children: React.ReactNode }) {
  return (
    <th
      style={{
        textAlign: 'right',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-text-tertiary)',
        padding: '8px 12px 8px 0',
        borderBottom: '1px solid var(--color-border-hairline)',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td
      style={{
        padding: '8px 12px 8px 0',
        fontSize: 13,
        color: muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
      }}
    >
      {children}
    </td>
  );
}

function TdN({ children }: { children: React.ReactNode }) {
  return (
    <td
      style={{
        padding: '8px 12px 8px 0',
        fontSize: 13,
        textAlign: 'right',
        fontVariantNumeric: 'tabular-nums',
        color: 'var(--color-text-primary)',
      }}
    >
      {children}
    </td>
  );
}
