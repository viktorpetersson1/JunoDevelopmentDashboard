'use client';

/**
 * Inbox renderer + client interactions: mark-as-read + mark-all-read.
 *
 * Optimistic UI: clicking a notification immediately greys it out, then
 * fires the PATCH. On failure the row reverts.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import type { NotificationKind, NotificationView } from '@/lib/repos/notifications';

const KIND_LABEL: Record<NotificationKind, string> = {
  capital_call: 'Capital call',
  snapshot_review: 'Approval snapshot',
  system: 'System',
  project_update: 'Project',
  pricing_run: 'Pricing',
};

const KIND_COLOR: Record<NotificationKind, string> = {
  capital_call: 'var(--color-status-warning, #d97706)',
  snapshot_review: 'var(--color-status-info, #2563eb)',
  system: 'var(--color-text-tertiary)',
  project_update: 'var(--color-accent-base, #131313)',
  pricing_run: 'var(--color-positive, #16a34a)',
};

function relativeTime(iso: string): string {
  const now = Date.now();
  const t = new Date(iso).getTime();
  const diffMs = Math.max(0, now - t);
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return iso.slice(0, 10);
}

export function NotificationsList({
  initialNotifications,
}: {
  initialNotifications: NotificationView[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialNotifications);
  const [isPending, startTransition] = useTransition();

  const anyUnread = items.some((n) => n.readAt === null);

  async function markRead(ids: string[]) {
    if (ids.length === 0) return;
    // Optimistic update
    const stamp = new Date().toISOString();
    setItems((prev) =>
      prev.map((n) => (ids.includes(n.id) && n.readAt === null ? { ...n, readAt: stamp } : n))
    );
    const res = await fetch('/api/notifications/read', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids }),
    });
    if (!res.ok) {
      // Revert
      setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, readAt: null } : n)));
    } else {
      router.refresh();
    }
  }

  async function handleMarkAll() {
    const unreadIds = items.filter((n) => n.readAt === null).map((n) => n.id);
    if (unreadIds.length === 0) return;
    startTransition(() => {
      void markRead(unreadIds);
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {anyUnread && (
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button variant="ghost" size="sm" onClick={handleMarkAll} loading={isPending}>
            Mark all as read
          </Button>
        </div>
      )}

      {items.length === 0 ? (
        <section
          style={{
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 14,
            padding: '48px 24px',
            textAlign: 'center',
          }}
        >
          <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: 13 }}>
            Your inbox is empty.
          </p>
        </section>
      ) : (
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0,
            background: 'var(--color-surface-raised)',
            border: '1px solid var(--color-border-hairline)',
            borderRadius: 14,
            overflow: 'hidden',
          }}
        >
          {items.map((n, i) => (
            <li
              key={n.id}
              style={{
                borderBottom:
                  i < items.length - 1 ? '1px solid var(--color-border-subtle)' : 'none',
                background: n.readAt === null ? 'var(--color-surface-base)' : 'transparent',
              }}
            >
              <NotificationRow notification={n} onActivate={() => markRead([n.id])} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NotificationRow({
  notification,
  onActivate,
}: {
  notification: NotificationView;
  onActivate: () => void;
}) {
  const router = useRouter();
  const isUnread = notification.readAt === null;

  function handleClick() {
    onActivate();
    if (notification.href) router.push(notification.href);
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '8px 1fr auto',
        gap: 12,
        alignItems: 'start',
        width: '100%',
        padding: '16px 20px',
        background: 'transparent',
        border: 'none',
        textAlign: 'left',
        cursor: notification.href ? 'pointer' : 'default',
        color: 'inherit',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: isUnread ? KIND_COLOR[notification.kind] : 'transparent',
          marginTop: 6,
        }}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 10,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: KIND_COLOR[notification.kind],
              fontWeight: 700,
            }}
          >
            {KIND_LABEL[notification.kind]}
          </span>
          <span
            style={{
              fontSize: 14,
              fontWeight: isUnread ? 600 : 500,
              color: 'var(--color-text-primary)',
            }}
          >
            {notification.title}
          </span>
        </div>
        {notification.body && (
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'var(--color-text-secondary)',
              lineHeight: 1.45,
            }}
          >
            {notification.body}
          </p>
        )}
      </div>
      <span
        style={{
          fontSize: 11,
          color: 'var(--color-text-tertiary)',
          whiteSpace: 'nowrap',
          fontVariantNumeric: 'tabular-nums',
          paddingTop: 2,
        }}
      >
        {relativeTime(notification.createdAt)}
      </span>
    </button>
  );
}
