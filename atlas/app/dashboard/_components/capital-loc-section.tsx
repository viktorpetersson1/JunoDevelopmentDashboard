/**
 * V7 T135 — Home "Capital & LOC" section: the /analytics/capital KPI row +
 * LOC drawdown chart, condensed to one Home section. Absorbs the two parked
 * treasury pages (capital + loc); the numbers are the SAME aggregatePortfolio
 * output the rest of Home renders (Rule 1), and every LOC-derived tile is
 * Rule-6 gated on a configured facility.
 */

import { LocDrawdownChart } from '../../analytics/capital/_components/loc-drawdown-chart';
import { formatMoney } from '@/lib/utils/money';
import type { PortfolioMonthlySeries, PortfolioKpis } from '@/lib/calc/portfolio/types';

export function CapitalLocSection({
  monthly,
  kpis,
  locConfigured,
}: {
  monthly: PortfolioMonthlySeries;
  kpis: PortfolioKpis;
  locConfigured: boolean;
}) {
  const locCap = monthly.kpc_loc_config.facility_size_usd;
  const locPeakPct = locCap > 0 ? (monthly.loc_peak_balance / locCap) * 100 : 0;

  const tiles: Array<{
    label: string;
    value: string;
    hint?: string;
    tone?: 'negative' | 'neutral';
  }> = [
    locConfigured
      ? {
          label: 'KPC LOC peak',
          value: formatMoney(monthly.loc_peak_balance * 100, { compact: true, precision: 2 }),
          hint: `${locPeakPct.toFixed(0)}% of $${(locCap / 1_000_000).toFixed(1)}M facility`,
          tone: locPeakPct > 90 ? 'negative' : 'neutral',
        }
      : { label: 'KPC LOC peak', value: '—', hint: 'No capital sources configured' },
    locConfigured
      ? {
          label: 'LOC interest',
          value: formatMoney(monthly.loc_total_interest * 100, { compact: true, precision: 2 }),
          hint: `${(monthly.kpc_loc_config.interest_rate_apr * 100).toFixed(2)}% APR`,
        }
      : { label: 'LOC interest', value: '—', hint: 'No capital sources configured' },
    locConfigured
      ? {
          label: 'Owner equity needed',
          value: formatMoney(monthly.true_equity_total_drawn * 100, {
            compact: true,
            precision: 2,
          }),
          hint:
            monthly.true_equity_total_drawn > 0 ? 'beyond KPC LOC capacity' : 'within LOC capacity',
          tone: monthly.true_equity_total_drawn > 0 ? 'negative' : 'neutral',
        }
      : { label: 'Owner equity needed', value: '—', hint: 'Configure the facility first' },
    locConfigured
      ? {
          label: 'Funding-gap months',
          value: String(monthly.cap_breach_months),
          hint: monthly.cap_breach_months > 0 ? 'months where LOC is over cap' : 'no breach',
          tone: monthly.cap_breach_months > 0 ? 'negative' : 'neutral',
        }
      : { label: 'Funding-gap months', value: '—', hint: 'Configure the facility first' },
    {
      label: 'Senior debt peak',
      value: formatMoney(kpis.max_debt_outstanding * 100, { compact: true, precision: 2 }),
      hint: kpis.max_debt_month ?? 'across pipeline',
    },
    {
      label: 'Total equity called',
      value: formatMoney(kpis.total_equity_called * 100, { compact: true, precision: 2 }),
      hint: 'cumulative through model horizon',
    },
  ];

  return (
    <>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10,
          marginBottom: 16,
        }}
      >
        {tiles.map((t) => (
          <div
            key={t.label}
            style={{
              border: '1px solid var(--color-border-hairline)',
              borderLeft:
                t.tone === 'negative'
                  ? '3px solid var(--color-negative, #dc2626)'
                  : '1px solid var(--color-border-hairline)',
              borderRadius: 8,
              padding: '10px 12px',
            }}
          >
            <div
              style={{
                fontSize: 10,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--color-text-tertiary)',
                fontWeight: 700,
              }}
            >
              {t.label}
            </div>
            <div
              style={{
                fontSize: 18,
                fontWeight: 700,
                marginTop: 4,
                fontVariantNumeric: 'tabular-nums',
                color:
                  t.tone === 'negative'
                    ? 'var(--color-negative, #dc2626)'
                    : 'var(--color-text-primary)',
              }}
            >
              {t.value}
            </div>
            {t.hint && (
              <div style={{ fontSize: 11, color: 'var(--color-text-tertiary)', marginTop: 2 }}>
                {t.hint}
              </div>
            )}
          </div>
        ))}
      </div>
      {locConfigured ? (
        <LocDrawdownChart monthly={monthly} />
      ) : (
        <p
          style={{
            margin: 0,
            padding: '24px 0',
            textAlign: 'center',
            fontSize: 13,
            color: 'var(--color-text-tertiary)',
          }}
        >
          No capital sources configured — add the KPC LOC under Settings → Capital Sources to
          activate the drawdown chart.
        </p>
      )}
    </>
  );
}
