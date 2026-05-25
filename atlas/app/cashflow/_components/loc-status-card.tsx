/**
 * KPC LOC status card — summarises the line-of-credit pool the portfolio
 * draws from. Reads the LOC scalar fields aggregatePortfolio attaches
 * to PortfolioMonthlySeries.
 */

import { formatMoney } from '@/lib/utils/money';
import type { PortfolioMonthlySeries } from '@/lib/calc/portfolio/types';

export function LocStatusCard({ monthly }: { monthly: PortfolioMonthlySeries }) {
  const cfg = monthly.kpc_loc_config;
  const peakPct = monthly.loc_peak_drawn_pct;
  const utilization =
    peakPct >= 0.85 ? 'critical' : peakPct >= 0.6 ? 'elevated' : 'comfortable';

  const utilColor =
    utilization === 'critical'
      ? 'var(--color-negative, #dc2626)'
      : utilization === 'elevated'
        ? 'var(--color-status-warning, #d97706)'
        : 'var(--color-positive, #16a34a)';

  return (
    <aside
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 14,
        padding: 24,
      }}
    >
      <header style={{ marginBottom: 16 }}>
        <h3
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
            margin: 0,
            marginBottom: 4,
          }}
        >
          KPC LOC pool
        </h3>
        <p
          style={{
            fontSize: 13,
            color: 'var(--color-text-secondary)',
            margin: 0,
          }}
        >
          {cfg.provider ?? 'KPC'} ·{' '}
          {formatMoney(cfg.facility_size_usd * 100, { compact: true, precision: 0 })} ·{' '}
          {(cfg.interest_rate_apr * 100).toFixed(2)}% APR
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <KV
          label="Peak drawn"
          value={formatMoney(monthly.loc_peak_balance * 100, { compact: true, precision: 2 })}
          accent
        />
        <KV
          label="Peak utilization"
          value={`${(peakPct * 100).toFixed(1)}%`}
          color={utilColor}
        />
        <KV
          label="Total interest"
          value={formatMoney(monthly.loc_total_interest * 100, { compact: true, precision: 2 })}
        />
        <KV
          label="True equity needed"
          value={formatMoney(monthly.true_equity_total_drawn * 100, {
            compact: true,
            precision: 2,
          })}
          hint="above LOC cap"
        />
        <KV
          label="Cap-breach months"
          value={String(monthly.cap_breach_months)}
          color={
            monthly.cap_breach_months > 0
              ? 'var(--color-negative, #dc2626)'
              : 'var(--color-positive, #16a34a)'
          }
        />
      </div>

      <p
        style={{
          marginTop: 16,
          paddingTop: 12,
          borderTop: '1px solid var(--color-border-subtle)',
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          margin: '16px 0 0 0',
        }}
      >
        Capitalize interest: {cfg.capitalize_interest ? 'yes' : 'no'} ·{' '}
        Seniority: {cfg.seniority ?? '—'}
      </p>
    </aside>
  );
}

function KV({
  label,
  value,
  accent = false,
  color,
  hint,
}: {
  label: string;
  value: string;
  accent?: boolean;
  color?: string;
  hint?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        fontSize: 13,
      }}
    >
      <span style={{ color: 'var(--color-text-secondary)' }}>
        {label}
        {hint && (
          <span
            style={{
              marginLeft: 6,
              fontSize: 11,
              color: 'var(--color-text-tertiary)',
            }}
          >
            {hint}
          </span>
        )}
      </span>
      <span
        style={{
          fontWeight: accent ? 600 : 400,
          fontVariantNumeric: 'tabular-nums',
          color: color ?? 'var(--color-text-primary)',
        }}
      >
        {value}
      </span>
    </div>
  );
}
