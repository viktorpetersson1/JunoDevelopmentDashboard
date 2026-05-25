/**
 * Pipeline board — server-renderable kanban grid.
 *
 * Layout: horizontal scroll on narrow viewports, equal columns on wide.
 * Each column has a sticky header (count + sum value) and a stack of
 * project cards underneath.
 */

import Link from 'next/link';
import { formatMoney } from '@/lib/utils/money';

export interface PipelineCard {
  id: string;
  name: string;
  address: string | null;
  market: string;
  stage: string;
  status: string;
  total_sales: number;
  profit_margin_pct: number;
  villa_sqft: number;
}

export interface StageGroup {
  key: string;
  label: string;
  description: string;
  count: number;
  totalValue: number;
  cards: PipelineCard[];
}

export function PipelineBoard({ groups }: { groups: StageGroup[] }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${groups.length}, minmax(220px, 1fr))`,
        gap: 12,
        overflowX: 'auto',
        paddingBottom: 8,
      }}
    >
      {groups.map((g) => (
        <PipelineColumn key={g.key} group={g} />
      ))}
    </div>
  );
}

function PipelineColumn({ group }: { group: StageGroup }) {
  return (
    <section
      aria-label={`${group.label} column, ${group.count} projects`}
      style={{
        background: 'var(--color-surface-sunken)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 12,
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 280,
      }}
    >
      <header
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          paddingBottom: 8,
          borderBottom: '1px solid var(--color-border-subtle)',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
          }}
        >
          <h2
            style={{
              fontSize: 13,
              fontWeight: 600,
              margin: 0,
              color: 'var(--color-text-primary)',
              letterSpacing: '-0.01em',
            }}
          >
            {group.label}
          </h2>
          <span
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--color-text-tertiary)',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {group.count}
          </span>
        </div>
        <p
          style={{
            margin: 0,
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
          }}
        >
          {group.description}
        </p>
        <p
          style={{
            margin: '2px 0 0 0',
            fontSize: 11,
            color: 'var(--color-text-secondary)',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {group.totalValue > 0
            ? `${formatMoney(group.totalValue * 100, { compact: true, precision: 1 })} sale value`
            : '—'}
        </p>
      </header>

      {group.cards.length > 0 ? (
        <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {group.cards.map((c) => (
            <li key={c.id}>
              <PipelineCardLink card={c} />
            </li>
          ))}
        </ul>
      ) : (
        <p
          style={{
            margin: 0,
            padding: '16px 0',
            textAlign: 'center',
            fontSize: 11,
            color: 'var(--color-text-tertiary)',
          }}
        >
          Empty column
        </p>
      )}
    </section>
  );
}

function PipelineCardLink({ card }: { card: PipelineCard }) {
  const subtitle =
    card.address ?? (card.market && card.market !== 'default' ? card.market : '—');
  return (
    <Link
      href={`/projects/${card.id}`}
      style={{
        display: 'block',
        background: 'var(--color-surface-base)',
        border: '1px solid var(--color-border-hairline)',
        borderRadius: 10,
        padding: '10px 12px',
        textDecoration: 'none',
        color: 'inherit',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-text-primary)',
          marginBottom: 2,
          letterSpacing: '-0.01em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {card.name}
      </div>
      <div
        style={{
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          marginBottom: 6,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {subtitle}
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 11,
          color: 'var(--color-text-secondary)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>
          {card.total_sales > 0
            ? formatMoney(card.total_sales * 100, { compact: true, precision: 1 })
            : '—'}
        </span>
        <span
          style={{
            color:
              card.profit_margin_pct >= 0.15
                ? 'var(--color-positive, #16a34a)'
                : card.profit_margin_pct >= 0
                  ? 'var(--color-text-secondary)'
                  : 'var(--color-negative, #dc2626)',
          }}
        >
          {(card.profit_margin_pct * 100).toFixed(1)}%
        </span>
      </div>
    </Link>
  );
}
