'use client';

/**
 * V4.11 — Settings → General tab placeholder (INVENTORY §23).
 *
 * The full panel ships separately as V4.11b. INVENTORY §23 enumerates 23
 * financial-assumption knobs + 6 risk thresholds + data-export actions +
 * theme + markets editor + shareholders editor + hypothetical LP — that's
 * a sprint of its own.
 *
 * For now: explain what's coming, point at the underlying tokens in code,
 * and surface the 4 most-impactful globals (read-only) so admins can at
 * least SEE current defaults.
 */

import { BASELINE_GLOBALS } from '@/lib/calc/baselines';

export function GeneralTab() {
  const g = BASELINE_GLOBALS;
  const summary = [
    { label: 'Interest rate (APR)', value: `${(g.interest_rate_apr * 100).toFixed(2)}%` },
    { label: 'LTC (build / soft)', value: `${(g.ltc_pct * 100).toFixed(0)}%` },
    { label: 'Default build $/sqft', value: `$${g.default_build_cost_per_sqft.toFixed(0)}` },
    { label: 'Target margin', value: `${(g.target_margin * 100).toFixed(0)}%` },
    { label: 'Horizon (months)', value: String(g.horizon_months) },
    { label: 'Fiscal year mode', value: g.fiscal_year_mode ?? 'juno13' },
    {
      label: 'KPC LOC facility',
      value: `$${(((g as { kpc_loc?: { facility_size_usd?: number } }).kpc_loc?.facility_size_usd ?? 6_000_000) / 1_000_000).toFixed(1)}M`,
    },
    {
      label: 'KPC LOC rate (APR)',
      value: `${(((g as { kpc_loc?: { interest_rate_apr?: number } }).kpc_loc?.interest_rate_apr ?? 0.06) * 100).toFixed(2)}%`,
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div
        role="status"
        style={{
          padding: '12px 16px',
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderLeft: '3px solid var(--color-warning, #a16207)',
          borderRadius: 10,
        }}
      >
        <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
          General settings panel coming in V4.11b.
        </strong>
        <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
          Today these values are baked into <code>lib/calc/baselines.ts</code> and apply
          to every project. The interactive editor (23 financial-assumption knobs + 6 risk
          thresholds + markets + shareholders + LP) ships next.
        </p>
      </div>

      <section
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 12,
          padding: 16,
        }}
      >
        <h2 style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--color-text-primary)' }}>
          Current globals (read-only)
        </h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, marginTop: 8 }}>
          <tbody>
            {summary.map((row) => (
              <tr key={row.label} style={{ borderTop: '1px solid var(--color-border-hairline)' }}>
                <td style={{ padding: '8px 0', color: 'var(--color-text-secondary)' }}>{row.label}</td>
                <td
                  style={{
                    padding: '8px 0',
                    textAlign: 'right',
                    fontVariantNumeric: 'tabular-nums',
                    color: 'var(--color-text-primary)',
                    fontWeight: 500,
                  }}
                >
                  {row.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
