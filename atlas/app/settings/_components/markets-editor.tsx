'use client';

/**
 * V4.11c — Markets editor (INVENTORY §23 markets panel).
 *
 * Editable table of MarketDef rows persisted on atlas.globals.markets
 * (jsonb). Rows can be added, edited inline, or deleted. Save is a
 * one-shot PATCH that replaces the whole markets array — simpler than
 * per-row CRUD given how rarely markets change.
 *
 * "Revert to defaults" clears the override (sets markets=null) and the
 * engine falls back to BASELINE_GLOBALS.markets on next render.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface MarketRow {
  id: string;
  name?: string;
  sale_price_multiplier?: number;
  build_cost_multiplier?: number;
  demand_outlook?: 'soft' | 'stable' | 'strong';
}

interface Props {
  initialMarkets: MarketRow[];
  /** True when no override exists — UI shows the "baseline" indicator. */
  isBaselineMarkets: boolean;
  canEdit: boolean;
}

type DraftMarket = MarketRow & { _key: string };

function withKey(m: MarketRow, i: number): DraftMarket {
  return { ...m, _key: `${m.id}-${i}` };
}

export function MarketsEditor({ initialMarkets, isBaselineMarkets, canEdit }: Props) {
  const router = useRouter();
  const [rows, setRows] = useState<DraftMarket[]>(initialMarkets.map(withKey));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<'save' | 'reset' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = (key: string, patch: Partial<MarketRow>) => {
    setRows((cur) => cur.map((r) => (r._key === key ? { ...r, ...patch } : r)));
    setDirty(true);
    setError(null);
  };

  const remove = (key: string) => {
    setRows((cur) => cur.filter((r) => r._key !== key));
    setDirty(true);
    setError(null);
  };

  const add = () => {
    const id = `market-${Date.now()}`;
    setRows((cur) => [
      ...cur,
      {
        _key: id,
        id,
        name: 'New market',
        sale_price_multiplier: 1.0,
        build_cost_multiplier: 1.0,
        demand_outlook: 'stable',
      },
    ]);
    setDirty(true);
    setError(null);
  };

  const save = async () => {
    if (!canEdit) return;
    // Validate: every row needs a non-empty id. Strip the _key before send.
    const cleaned = rows.map((r) => {
      const { _key, ...rest } = r;
      void _key;
      return rest;
    });
    const blankIds = cleaned.filter((m) => !m.id || m.id.trim() === '');
    if (blankIds.length > 0) {
      setError(
        'Every market needs a non-empty id (use lowercase + underscore, e.g. east_hampton).'
      );
      return;
    }
    const dupes = new Set<string>();
    const seen = new Set<string>();
    for (const m of cleaned) {
      if (seen.has(m.id)) dupes.add(m.id);
      seen.add(m.id);
    }
    if (dupes.size > 0) {
      setError(`Duplicate market ids: ${Array.from(dupes).join(', ')}`);
      return;
    }

    setBusy('save');
    setError(null);
    try {
      const res = await fetch('/api/globals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markets: cleaned }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(e?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      setDirty(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const revertToBaseline = async () => {
    if (!canEdit) return;
    if (!confirm('Revert markets to baseline defaults? Local edits will be lost.')) return;
    setBusy('reset');
    setError(null);
    try {
      const res = await fetch('/api/globals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ markets: null }),
      });
      if (!res.ok) {
        const e = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(e?.error?.message ?? `${res.status} ${res.statusText}`);
      }
      setDirty(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <section
      style={{
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 12,
        padding: 16,
      }}
    >
      <header
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3
            style={{
              margin: 0,
              fontSize: 12,
              fontWeight: 700,
              color: 'var(--color-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
            }}
          >
            Markets
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Per-market sale + build cost multipliers and demand outlook. Engine reads these on every
            calc — saving instantly changes the dashboard.
            {isBaselineMarkets && ' Currently inherited from baseline.'}
          </p>
        </div>
        {canEdit && (
          <div style={{ display: 'flex', gap: 8 }}>
            {!isBaselineMarkets && (
              <SecondaryButton onClick={revertToBaseline} disabled={busy != null}>
                Revert to baseline
              </SecondaryButton>
            )}
            <SecondaryButton onClick={add} disabled={busy != null}>
              + Add market
            </SecondaryButton>
            <PrimaryButton onClick={save} disabled={busy != null || !dirty}>
              Save markets
            </PrimaryButton>
          </div>
        )}
      </header>

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 12,
            padding: '8px 12px',
            background: 'var(--color-negative-soft, #fef2f2)',
            border: '1px solid var(--color-border-hairline)',
            borderLeft: '3px solid var(--color-negative, #b91c1c)',
            borderRadius: 8,
            fontSize: 12,
            color: 'var(--color-negative, #b91c1c)',
          }}
        >
          {error}
        </div>
      )}

      <div style={{ marginTop: 12, overflowX: 'auto' }}>
        {rows.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-tertiary)' }}>
            No markets defined. Engine falls back to project-level &quot;Unspecified&quot; defaults.
            {canEdit && ' Use Add market above to define one.'}
          </p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                <th style={th()}>ID</th>
                <th style={th()}>Display name</th>
                <th style={th('right')}>Sale price ×</th>
                <th style={th('right')}>Build cost ×</th>
                <th style={th()}>Demand outlook</th>
                {canEdit && <th style={th('right')}>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._key} style={{ borderBottom: '1px solid var(--color-border-hairline)' }}>
                  <td style={td()}>
                    <input
                      type="text"
                      value={r.id}
                      onChange={(e) => update(r._key, { id: e.target.value })}
                      disabled={!canEdit}
                      style={{ ...inputStyle, width: 140 }}
                      placeholder="east_hampton"
                    />
                  </td>
                  <td style={td()}>
                    <input
                      type="text"
                      value={r.name ?? ''}
                      onChange={(e) => update(r._key, { name: e.target.value })}
                      disabled={!canEdit}
                      style={{ ...inputStyle, width: 160 }}
                      placeholder="East Hampton"
                    />
                  </td>
                  <td style={td('right')}>
                    <input
                      type="number"
                      step={0.01}
                      value={r.sale_price_multiplier ?? 1}
                      onChange={(e) =>
                        update(r._key, { sale_price_multiplier: Number(e.target.value) })
                      }
                      disabled={!canEdit}
                      style={{ ...inputStyle, width: 80, textAlign: 'right' }}
                    />
                  </td>
                  <td style={td('right')}>
                    <input
                      type="number"
                      step={0.01}
                      value={r.build_cost_multiplier ?? 1}
                      onChange={(e) =>
                        update(r._key, { build_cost_multiplier: Number(e.target.value) })
                      }
                      disabled={!canEdit}
                      style={{ ...inputStyle, width: 80, textAlign: 'right' }}
                    />
                  </td>
                  <td style={td()}>
                    <select
                      value={r.demand_outlook ?? 'stable'}
                      onChange={(e) =>
                        update(r._key, {
                          demand_outlook: e.target.value as MarketRow['demand_outlook'],
                        })
                      }
                      disabled={!canEdit}
                      style={{ ...inputStyle, width: 110 }}
                    >
                      <option value="soft">Soft</option>
                      <option value="stable">Stable</option>
                      <option value="strong">Strong</option>
                    </select>
                  </td>
                  {canEdit && (
                    <td style={td('right')}>
                      <button
                        type="button"
                        onClick={() => remove(r._key)}
                        style={{
                          padding: '3px 10px',
                          fontSize: 12,
                          border: '1px solid var(--color-border-hairline)',
                          background: 'var(--color-surface-base)',
                          borderRadius: 6,
                          cursor: 'pointer',
                          color: 'var(--color-text-secondary)',
                        }}
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function PrimaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 14px',
        background: 'var(--color-accent-base, #131313)',
        color: '#fff',
        border: 'none',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

function SecondaryButton({
  children,
  onClick,
  disabled,
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: '6px 14px',
        background: 'transparent',
        color: 'var(--color-text-primary)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 8,
        fontSize: 12,
        fontWeight: 400,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      {children}
    </button>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '6px 8px',
  fontSize: 12,
  border: '1px solid var(--color-border-hairline)',
  borderRadius: 6,
  background: 'var(--color-surface-base)',
  color: 'var(--color-text-primary)',
};

function th(align: 'left' | 'right' = 'left'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '8px 8px 8px 0',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
  };
}

function td(align: 'left' | 'right' = 'left'): React.CSSProperties {
  return {
    textAlign: align,
    padding: '8px 8px 8px 0',
    fontVariantNumeric: align === 'right' ? 'tabular-nums' : 'normal',
    color: 'var(--color-text-primary)',
  };
}
