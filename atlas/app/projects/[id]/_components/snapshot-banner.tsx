'use client';

/**
 * T103.2 — Snapshot status chip (replaces the wide persistent banner).
 *
 * A compact pill that lives in the project header. Click-to-expand reveals
 * the full Create / Refresh / Lock / Approve controls without pushing page
 * content down.
 *
 * States:
 *   red dot    · "Snapshot needed"   — no snapshot yet
 *   amber dot  · "Draft v{n}"        — draft in progress
 *   amber dot  · "Pending v{n}"      — locked, waiting on second approver
 *   green dot  · "Approved v{n}"     — locked + 2 approvers
 *
 * Same props as the old BannerShell — no project page changes needed.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { ApprovalSnapshotView } from '@/lib/repos/approval-snapshot';

export interface SnapshotBannerProps {
  projectKey: string;
  latest: ApprovalSnapshotView | null;
  currentUserId: string;
  isEditor: boolean;
  isSuperAdmin: boolean;
  approverNames: Record<string, string>;
  /** T104 E3 — current inputs drifted from the locked snapshot. Overrides the
   *  status chip to "Re-approval needed" (placeholder for the T113 StatusDot). */
  pendingReapproval?: boolean;
  /** lockedAt (ISO) of the snapshot now needing re-approval. */
  lockedSnapshotDate?: string | null;
}

type DotColor = 'red' | 'amber' | 'green';

const DOT: Record<DotColor, string> = {
  red: '#b91c1c',
  amber: '#a16207',
  green: '#15803d',
};

function Dot({ color }: { color: DotColor }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: 7,
        height: 7,
        borderRadius: 999,
        background: DOT[color],
        flexShrink: 0,
      }}
    />
  );
}

function ChipLabel({ color, label }: { color: DotColor; label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 9px',
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        userSelect: 'none',
        color: DOT[color],
        background:
          color === 'green'
            ? 'var(--color-positive-soft, #ecfdf5)'
            : color === 'amber'
              ? 'var(--color-warning-soft, #fefce8)'
              : 'var(--color-negative-soft, #fef2f2)',
        border: `1px solid ${DOT[color]}22`,
      }}
    >
      <Dot color={color} />
      {label}
      <span style={{ marginLeft: 2, opacity: 0.7, fontSize: 10 }}>▾</span>
    </span>
  );
}

function timeAgo(iso: string): string {
  const diffMs = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function SnapshotBanner({
  projectKey,
  latest,
  currentUserId,
  isEditor,
  isSuperAdmin,
  approverNames,
  pendingReapproval = false,
  lockedSnapshotDate = null,
}: SnapshotBannerProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function call(method: 'POST' | 'PATCH', url: string, failPrefix: string) {
    setError(null);
    return new Promise<void>((resolve) => {
      startTransition(async () => {
        const res = await fetch(url, { method });
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as {
            error?: { message: string };
          } | null;
          setError(body?.error?.message ?? `${failPrefix} (HTTP ${res.status})`);
          resolve();
          return;
        }
        router.refresh();
        setOpen(false);
        resolve();
      });
    });
  }

  const handleCreate = () =>
    call('POST', `/api/projects/${projectKey}/approval-snapshots`, 'Create failed');
  const handleLock = (id: string) =>
    call('POST', `/api/approval-snapshots/${id}/lock`, 'Lock failed');
  const handleApprove = (id: string) =>
    call('POST', `/api/approval-snapshots/${id}/approve`, 'Approve failed');
  const handleRefresh = (id: string) =>
    call('PATCH', `/api/approval-snapshots/${id}`, 'Refresh failed');

  // ── Derive chip label + color ───────────────────────────────────────────
  let chipColor: DotColor = 'red';
  let chipLabel = 'Snapshot needed';

  if (latest) {
    const v = latest.snapshotVersion;
    if (latest.status === 'draft') {
      chipColor = 'amber';
      chipLabel = `Draft v${v}`;
    } else if (latest.status === 'locked') {
      const fullyApproved = latest.approvedBy.length >= 2;
      if (fullyApproved) {
        chipColor = 'green';
        chipLabel = `Approved v${v}`;
      } else {
        chipColor = 'amber';
        chipLabel = `Pending v${v}`;
      }
    }
  }

  // T104 E3 — drifted inputs over a locked snapshot trump the status label.
  if (pendingReapproval) {
    chipColor = 'amber';
    chipLabel = 'Re-approval needed';
  }

  // ── Drawer: full controls when expanded ─────────────────────────────────
  const creatorName = latest?.createdBy
    ? (approverNames[latest.createdBy] ?? 'Creator')
    : 'Unknown';
  const creatorIsCaller = latest?.createdBy === currentUserId;
  const callerAlreadyApproved = latest?.approvedBy.includes(currentUserId) ?? false;

  return (
    <div style={{ display: 'inline-block', position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-expanded={open}
        aria-label={`Approval status: ${chipLabel}`}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
      >
        <ChipLabel color={chipColor} label={chipLabel} />
      </button>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            zIndex: 40,
            minWidth: 300,
            maxWidth: 420,
            background: 'var(--color-surface-base)',
            border: 'var(--ja-card-border)',
            borderRadius: 'var(--ja-card-radius)',
            boxShadow: '0 4px 16px rgba(0,0,0,0.10)',
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          {/* ── Pending re-approval (T104 E3) ── */}
          {pendingReapproval && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--color-warning, #a16207)' }}>
              Inputs changed since this project was last locked
              {lockedSnapshotDate ? ` (${timeAgo(lockedSnapshotDate)})` : ''}. Capture a new
              snapshot to send it for re-approval.
            </p>
          )}

          {/* ── No snapshot ── */}
          {!latest && (
            <>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Capturing a snapshot freezes the current inputs + computed model for peer review.
              </p>
              {isEditor && (
                <Button variant="primary" size="sm" onClick={handleCreate} loading={isPending}>
                  Capture draft
                </Button>
              )}
            </>
          )}

          {/* ── Draft ── */}
          {latest?.status === 'draft' && (
            <>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                v{latest.snapshotVersion} · by {creatorName} · {timeAgo(latest.createdAt)}
              </p>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                Editable. Refresh to capture recent changes, then a second admin locks it for peer
                review.
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {isEditor && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRefresh(latest.id)}
                    loading={isPending}
                  >
                    Refresh
                  </Button>
                )}
                {isSuperAdmin && !creatorIsCaller && (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleLock(latest.id)}
                    loading={isPending}
                  >
                    Lock
                  </Button>
                )}
                {isSuperAdmin && creatorIsCaller && (
                  <span
                    style={{
                      fontSize: 12,
                      color: 'var(--color-text-tertiary)',
                      alignSelf: 'center',
                    }}
                  >
                    Awaiting peer to lock
                  </span>
                )}
              </div>
            </>
          )}

          {/* ── Locked ── */}
          {latest?.status === 'locked' &&
            (() => {
              const n = latest.approvedBy.length;
              const fullyApproved = n >= 2;
              return (
                <>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--color-text-tertiary)' }}>
                    v{latest.snapshotVersion} · locked{' '}
                    {latest.lockedAt ? timeAgo(latest.lockedAt) : '—'}
                  </p>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--color-text-secondary)' }}>
                    {fullyApproved
                      ? `Approved by: ${latest.approvedBy.map((id) => approverNames[id] ?? id.slice(0, 8)).join(', ')}`
                      : `${n}/2 approvals · awaiting second approver`}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {isSuperAdmin && !callerAlreadyApproved && (
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() => handleApprove(latest.id)}
                        loading={isPending}
                      >
                        Approve
                      </Button>
                    )}
                    {isEditor && fullyApproved && (
                      <Button variant="ghost" size="sm" onClick={handleCreate} loading={isPending}>
                        New snapshot
                      </Button>
                    )}
                  </div>
                </>
              );
            })()}

          {error && (
            <p
              role="alert"
              style={{ margin: 0, fontSize: 12, color: 'var(--color-negative, #b91c1c)' }}
            >
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
