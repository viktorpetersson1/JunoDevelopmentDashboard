'use client';

/**
 * V7 T139 — "Potential projects": the ranked opportunities table.
 *
 * Default sort = capital efficiency (expected profit ÷ cash needed);
 * click a column header to re-rank. Passed deals render greyed at the
 * bottom (the ranking bands them there). Row click → the opportunity
 * detail page. Add/edit = one small inline form (Rule 5), POSTing the
 * existing /api/opportunities route.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import {
  rankOpportunities,
  capitalEfficiency,
  type OpportunitySortKey,
} from '@/lib/pipeline/opportunity-ranking';
import type { OpportunityView } from '@/lib/repos/opportunities';

function money(usd: number | null): string {
  if (usd === null) return '—';
  const abs = Math.abs(usd);
  if (abs >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `$${(usd / 1_000).toFixed(0)}k`;
  return `$${Math.round(usd)}`;
}

const STATUS_LABEL: Record<OpportunityView['status'], string> = {
  researching: 'Researching',
  contacted: 'Contacted',
  negotiating: 'Negotiating',
  passed: 'Passed',
  promoted: 'Promoted',
};

export function OpportunitiesSection({
  opportunities,
  isEditor,
}: {
  opportunities: OpportunityView[];
  isEditor: boolean;
}) {
  const router = useRouter();
  const [sortKey, setSortKey] = useState<OpportunitySortKey>('efficiency');
  const [adding, setAdding] = useState(false);
  const ranked = rankOpportunities(opportunities, sortKey);

  const header = (label: string, key: OpportunitySortKey, align: 'left' | 'right' = 'right') => (
    <th
      onClick={() => setSortKey(key)}
      style={{
        fontSize: 10.5,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        color: sortKey === key ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
        padding: '6px 8px',
        fontWeight: 700,
        textAlign: align,
        borderBottom: '1px solid var(--color-border-hairline)',
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        userSelect: 'none',
      }}
      title={`Sort by ${label}`}
    >
      {label}
      {sortKey === key ? ' ▾' : ''}
    </th>
  );

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
          marginBottom: 12,
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h2
            style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}
          >
            Potential projects
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--color-text-tertiary)' }}>
            Ranked by capital efficiency (expected profit ÷ cash needed) — click headers to re-rank
          </p>
        </div>
        {isEditor && (
          <Button variant="secondary" size="sm" onClick={() => setAdding((a) => !a)}>
            {adding ? 'Close' : 'Add opportunity'}
          </Button>
        )}
      </header>

      {adding && <AddOpportunityForm onDone={() => setAdding(false)} />}

      {ranked.length === 0 ? (
        <p
          style={{
            margin: 0,
            padding: '16px 0',
            fontSize: 13,
            color: 'var(--color-text-tertiary)',
          }}
        >
          No opportunities logged yet{isEditor ? ' — add the first one above.' : '.'}
        </p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: 13,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <thead>
              <tr>
                {header('Opportunity', 'name', 'left')}
                <th style={thPlain}>Status</th>
                <th style={thPlain}>Owner</th>
                {header('Cash needed', 'cash_needed')}
                {header('Timeline', 'timeline')}
                {header('Expected profit', 'expected_profit')}
                {header('Efficiency', 'efficiency')}
                <th style={thPlain}>Next step</th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((o) => {
                const eff = capitalEfficiency(o);
                const dim = o.status === 'passed';
                return (
                  <tr
                    key={o.id}
                    onClick={() => router.push(`/pipeline/opportunities/${o.id}`)}
                    style={{ cursor: 'pointer', opacity: dim ? 0.45 : 1 }}
                  >
                    <Td align="left" strong>
                      {o.name}
                      {o.market && (
                        <span
                          style={{
                            marginLeft: 8,
                            fontSize: 11,
                            color: 'var(--color-text-tertiary)',
                            fontWeight: 400,
                          }}
                        >
                          {o.market.replaceAll('_', ' ')}
                        </span>
                      )}
                    </Td>
                    <Td align="left" muted>
                      {STATUS_LABEL[o.status]}
                    </Td>
                    <Td align="left" muted>
                      {o.ownerName ?? '—'}
                    </Td>
                    <Td align="right">{money(o.cashNeededUsd)}</Td>
                    <Td align="right">
                      {o.timelineMonths !== null ? `${o.timelineMonths} mo` : '—'}
                    </Td>
                    <Td align="right">{money(o.expectedProfitUsd)}</Td>
                    <Td align="right">{eff !== null ? `${eff.toFixed(2)}×` : '—'}</Td>
                    <Td align="left" muted>
                      <span
                        style={{
                          display: 'inline-block',
                          maxWidth: 260,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                          verticalAlign: 'bottom',
                        }}
                      >
                        {o.nextStep ?? '—'}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

const thPlain: React.CSSProperties = {
  fontSize: 10.5,
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
  color: 'var(--color-text-tertiary)',
  padding: '6px 8px',
  fontWeight: 700,
  textAlign: 'left',
  borderBottom: '1px solid var(--color-border-hairline)',
  whiteSpace: 'nowrap',
};

function Td({
  children,
  align,
  strong,
  muted,
}: {
  children: React.ReactNode;
  align: 'left' | 'right';
  strong?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      style={{
        padding: '8px',
        textAlign: align,
        borderBottom: '1px solid var(--color-border-subtle)',
        color: muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
        fontWeight: strong ? 600 : 400,
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </td>
  );
}

// ── Add form (small, Rule 5) ─────────────────────────────────────────────────

function AddOpportunityForm({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState('');
  const [market, setMarket] = useState('');
  const [owner, setOwner] = useState('');
  const [cash, setCash] = useState('');
  const [months, setMonths] = useState('');
  const [profit, setProfit] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const num = (s: string): number | null => {
    const n = Number(s.replace(/[$,\s]/g, ''));
    return s.trim() !== '' && Number.isFinite(n) ? n : null;
  };

  const save = async () => {
    if (!name.trim()) {
      setError('Name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          market: market.trim() || null,
          owner_name: owner.trim() || null,
          cash_needed_usd: num(cash),
          timeline_months: num(months) !== null ? Math.round(num(months)!) : null,
          expected_profit_usd: num(profit),
          next_step: nextStep.trim() || null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      onDone();
      startTransition(() => router.refresh());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 10,
        padding: 12,
        marginBottom: 14,
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 8,
      }}
    >
      <input
        style={inp}
        placeholder="Name *"
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <input
        style={inp}
        placeholder="Market (e.g. miami)"
        value={market}
        onChange={(e) => setMarket(e.target.value)}
      />
      <input
        style={inp}
        placeholder="Owner"
        value={owner}
        onChange={(e) => setOwner(e.target.value)}
      />
      <input
        style={inp}
        placeholder="Cash needed (USD)"
        inputMode="numeric"
        value={cash}
        onChange={(e) => setCash(e.target.value)}
      />
      <input
        style={inp}
        placeholder="Timeline (months)"
        inputMode="numeric"
        value={months}
        onChange={(e) => setMonths(e.target.value)}
      />
      <input
        style={inp}
        placeholder="Expected profit (USD)"
        inputMode="numeric"
        value={profit}
        onChange={(e) => setProfit(e.target.value)}
      />
      <input
        style={{ ...inp, gridColumn: '1 / -2' }}
        placeholder="Next step"
        value={nextStep}
        onChange={(e) => setNextStep(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'flex-end' }}>
        <Button variant="primary" size="sm" onClick={save} loading={saving}>
          Save
        </Button>
      </div>
      {error && (
        <div
          role="alert"
          style={{ gridColumn: '1 / -1', fontSize: 12, color: 'var(--color-negative, #b91c1c)' }}
        >
          {error}
        </div>
      )}
    </div>
  );
}

const inp: React.CSSProperties = {
  padding: '7px 9px',
  fontSize: 12.5,
  borderRadius: 7,
  border: '1px solid var(--color-border-hairline)',
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-primary)',
};
