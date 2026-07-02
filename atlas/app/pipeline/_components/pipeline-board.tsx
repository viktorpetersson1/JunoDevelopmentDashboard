'use client';
/**
 * Pipeline board — drag-and-drop kanban grid (T112, V6.1).
 *
 * Layout: horizontal scroll on narrow viewports, equal columns on wide.
 * Each column has a sticky header (count + sum value) and a stack of
 * project cards underneath.
 *
 * Drag-and-drop uses native HTML5 only (no dnd-kit, no react-beautiful-dnd).
 * Editor-gated: cards are only draggable when isEditor=true.
 */

import { useState, useCallback } from 'react';
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

interface PipelineBoardProps {
  groups: StageGroup[];
  isEditor: boolean;
}

export function PipelineBoard({ groups: initialGroups, isEditor }: PipelineBoardProps) {
  const [groups, setGroups] = useState<StageGroup[]>(initialGroups);
  // Track which card id is currently in a loading/saving state
  const [loadingCardId, setLoadingCardId] = useState<string | null>(null);
  // Track per-card error messages (cardId → message)
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});

  const handleDrop = useCallback(
    async (targetStageKey: string, cardId: string) => {
      // Find the card and its current stage
      let card: PipelineCard | undefined;
      let sourceStageKey = '';
      for (const g of groups) {
        const found = g.cards.find((c) => c.id === cardId);
        if (found) {
          card = found;
          sourceStageKey = g.key;
          break;
        }
      }
      if (!card || sourceStageKey === targetStageKey) return;

      // Optimistic update: move card in state immediately
      const updatedCard: PipelineCard = { ...card, stage: targetStageKey };
      setGroups((prev) =>
        prev.map((g) => {
          if (g.key === sourceStageKey) {
            const nextCards = g.cards.filter((c) => c.id !== cardId);
            return {
              ...g,
              cards: nextCards,
              count: nextCards.length,
              totalValue: nextCards.reduce((s, c) => s + c.total_sales, 0),
            };
          }
          if (g.key === targetStageKey) {
            const nextCards = [...g.cards, updatedCard];
            return {
              ...g,
              cards: nextCards,
              count: nextCards.length,
              totalValue: nextCards.reduce((s, c) => s + c.total_sales, 0),
            };
          }
          return g;
        })
      );
      setLoadingCardId(cardId);
      setCardErrors((prev) => {
        const next = { ...prev };
        delete next[cardId];
        return next;
      });

      try {
        const res = await fetch(`/api/projects/${cardId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stage: targetStageKey }),
        });
        if (!res.ok) {
          throw new Error(`Server returned ${res.status}`);
        }
      } catch (err) {
        // Revert optimistic update on error
        setGroups((prev) =>
          prev.map((g) => {
            if (g.key === targetStageKey) {
              const nextCards = g.cards.filter((c) => c.id !== cardId);
              return {
                ...g,
                cards: nextCards,
                count: nextCards.length,
                totalValue: nextCards.reduce((s, c) => s + c.total_sales, 0),
              };
            }
            if (g.key === sourceStageKey && card) {
              const nextCards = [...g.cards, card];
              return {
                ...g,
                cards: nextCards,
                count: nextCards.length,
                totalValue: nextCards.reduce((s, c) => s + c.total_sales, 0),
              };
            }
            return g;
          })
        );
        setCardErrors((prev) => ({
          ...prev,
          [cardId]: err instanceof Error ? err.message : 'Move failed',
        }));
      } finally {
        setLoadingCardId(null);
      }
    },
    [groups]
  );

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
        <PipelineColumn
          key={g.key}
          group={g}
          isEditor={isEditor}
          loadingCardId={loadingCardId}
          cardErrors={cardErrors}
          onDrop={handleDrop}
        />
      ))}
    </div>
  );
}

interface PipelineColumnProps {
  group: StageGroup;
  isEditor: boolean;
  loadingCardId: string | null;
  cardErrors: Record<string, string>;
  onDrop: (targetStageKey: string, cardId: string) => void;
}

function PipelineColumn({
  group,
  isEditor,
  loadingCardId,
  cardErrors,
  onDrop,
}: PipelineColumnProps) {
  const [isDragOver, setIsDragOver] = useState(false);

  return (
    <section
      aria-label={`${group.label} column, ${group.count} projects`}
      onDragOver={
        isEditor
          ? (e) => {
              e.preventDefault();
              setIsDragOver(true);
            }
          : undefined
      }
      onDragLeave={isEditor ? () => setIsDragOver(false) : undefined}
      onDrop={
        isEditor
          ? (e) => {
              e.preventDefault();
              setIsDragOver(false);
              const cardId = e.dataTransfer.getData('text/plain');
              if (cardId) onDrop(group.key, cardId);
            }
          : undefined
      }
      style={{
        background: isDragOver
          ? 'var(--color-surface-raised, #f5f5f2)'
          : 'var(--color-surface-sunken)',
        border: isDragOver
          ? '1px dashed var(--color-accent-base, #131313)'
          : 'var(--ja-card-border)',
        borderRadius: 'var(--ja-card-radius)',
        padding: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 280,
        transition: 'background 0.1s, border 0.1s',
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
              fontWeight: 700,
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
              fontWeight: 400,
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
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          {group.cards.map((c) => (
            <li key={c.id}>
              <PipelineCardLink
                card={c}
                isEditor={isEditor}
                isLoading={loadingCardId === c.id}
                error={cardErrors[c.id] ?? null}
              />
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

interface PipelineCardLinkProps {
  card: PipelineCard;
  isEditor: boolean;
  isLoading: boolean;
  error: string | null;
}

function PipelineCardLink({ card, isEditor, isLoading, error }: PipelineCardLinkProps) {
  const subtitle = card.address ?? (card.market && card.market !== 'default' ? card.market : '—');
  return (
    <div
      draggable={isEditor}
      onDragStart={
        isEditor
          ? (e) => {
              e.dataTransfer.setData('text/plain', card.id);
              e.dataTransfer.effectAllowed = 'move';
            }
          : undefined
      }
      style={{
        opacity: isLoading ? 0.5 : 1,
        cursor: isEditor ? 'grab' : 'default',
        transition: 'opacity 0.15s',
      }}
    >
      <Link
        href={`/projects/${card.id}`}
        draggable={false}
        style={{
          display: 'block',
          background: 'var(--color-surface-base)',
          border: error ? '1px solid var(--color-negative, #dc2626)' : 'var(--ja-card-border)',
          borderRadius: 10,
          padding: '10px 12px',
          textDecoration: 'none',
          color: 'inherit',
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
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
        {/* Inline error badge shown when the last drop failed */}
        {error && (
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--color-negative, #dc2626)',
              background: 'var(--color-negative-subtle, #fee2e2)',
              borderRadius: 4,
              padding: '2px 6px',
              display: 'inline-block',
            }}
          >
            Move failed — {error}
          </div>
        )}
        {/* Loading indicator */}
        {isLoading && (
          <div
            style={{
              marginTop: 6,
              fontSize: 10,
              color: 'var(--color-text-tertiary)',
            }}
          >
            Saving…
          </div>
        )}
      </Link>
    </div>
  );
}
