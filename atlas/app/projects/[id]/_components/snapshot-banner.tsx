'use client';

/**
 * Snapshot banner — sits at the top of project detail. Surfaces the
 * latest non-archived snapshot's status (draft / locked / pending review /
 * fully approved) and offers create / lock / approve / refresh actions
 * scoped to the caller's role.
 *
 * Roles:
 *   - editor / super_admin: can create draft + refresh draft
 *   - super_admin: can lock (must differ from creator) + approve
 *   - viewer: read-only banner; sees latest status only
 *
 * UX shorthand:
 *   - No snapshots yet → "Underwrite this project" CTA (editor+)
 *   - Draft exists → status + lock CTA (super_admin)
 *   - Locked, 1 approver → "Awaiting second approver" + approve CTA
 *   - Locked, 2+ approvers → "Approved by N admins" + approver names
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import type { ApprovalSnapshotView } from '@/lib/repos/approval-snapshot';

export interface SnapshotBannerProps {
  projectKey: string;
  /** Latest non-archived snapshot. null if none exists yet. */
  latest: ApprovalSnapshotView | null;
  /** auth.users.id of caller — for the "can I lock?" peer-review gate. */
  currentUserId: string;
  isEditor: boolean;
  isSuperAdmin: boolean;
  /** Map of approverId → displayName for rendering. */
  approverNames: Record<string, string>;
}

export function SnapshotBanner({
  projectKey,
  latest,
  currentUserId,
  isEditor,
  isSuperAdmin,
  approverNames,
}: SnapshotBannerProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function call(method: 'POST' | 'PATCH' | 'DELETE', url: string, failPrefix: string) {
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

  // ─── Empty state ────────────────────────────────────────────────────────
  if (!latest) {
    return (
      <BannerShell tone="neutral">
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
            No approval snapshot
          </strong>
          <p
            style={{
              margin: '2px 0 0 0',
              fontSize: 12,
              color: 'var(--color-text-secondary)',
            }}
          >
            Capturing a snapshot freezes the current inputs + computed model for peer review.
          </p>
        </div>
        {isEditor && (
          <Button variant="primary" size="sm" onClick={handleCreate} loading={isPending}>
            Capture draft
          </Button>
        )}
        {error && <BannerError message={error} />}
      </BannerShell>
    );
  }

  const creatorName = latest.createdBy ? (approverNames[latest.createdBy] ?? 'Creator') : 'Unknown';
  const creatorIsCaller = latest.createdBy === currentUserId;
  const callerAlreadyApproved = latest.approvedBy.includes(currentUserId);

  // ─── Draft ──────────────────────────────────────────────────────────────
  if (latest.status === 'draft') {
    return (
      <BannerShell tone="draft">
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
            Draft snapshot {latest.snapshotVersion}
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              by {creatorName} · {timeAgo(latest.createdAt)}
            </span>
          </strong>
          <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Editable. Refresh to capture recent input changes, then a second admin can lock for peer
            review.
          </p>
        </div>
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
        {isSuperAdmin &&
          (creatorIsCaller ? (
            <span
              style={{
                fontSize: 11,
                color: 'var(--color-text-tertiary)',
                alignSelf: 'center',
                fontStyle: 'italic',
              }}
              title="A different admin must lock — peer review"
            >
              Awaiting peer to lock
            </span>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={() => handleLock(latest.id)}
              loading={isPending}
            >
              Lock
            </Button>
          ))}
        {error && <BannerError message={error} />}
      </BannerShell>
    );
  }

  // ─── Locked ─────────────────────────────────────────────────────────────
  if (latest.status === 'locked') {
    const approverCount = latest.approvedBy.length;
    const fullyApproved = approverCount >= 2;
    return (
      <BannerShell tone={fullyApproved ? 'approved' : 'pending'}>
        <div style={{ flex: 1 }}>
          <strong style={{ fontSize: 13, color: 'var(--color-text-primary)' }}>
            {fullyApproved
              ? `Approved snapshot ${latest.snapshotVersion}`
              : `Locked snapshot ${latest.snapshotVersion} — awaiting second approver`}
            <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--color-text-tertiary)' }}>
              by {creatorName} · locked {latest.lockedAt ? timeAgo(latest.lockedAt) : '—'}
            </span>
          </strong>
          <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--color-text-secondary)' }}>
            Approvers:{' '}
            {approverCount === 0
              ? '—'
              : latest.approvedBy.map((id) => approverNames[id] ?? id.slice(0, 8)).join(', ')}
          </p>
        </div>
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
        {error && <BannerError message={error} />}
      </BannerShell>
    );
  }

  // ─── Archived ───────────────────────────────────────────────────────────
  return (
    <BannerShell tone="neutral">
      <div style={{ flex: 1 }}>
        <strong style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
          Latest snapshot {latest.snapshotVersion} archived
        </strong>
      </div>
      {isEditor && (
        <Button variant="primary" size="sm" onClick={handleCreate} loading={isPending}>
          Capture new draft
        </Button>
      )}
      {error && <BannerError message={error} />}
    </BannerShell>
  );
}

// ─── Tone tokens ────────────────────────────────────────────────────────────

type Tone = 'neutral' | 'draft' | 'pending' | 'approved';

const TONE_BORDER: Record<Tone, string> = {
  neutral: 'var(--color-border-hairline)',
  draft: 'var(--color-status-info, #2563eb)',
  pending: 'var(--color-status-warning, #d97706)',
  approved: 'var(--color-positive, #16a34a)',
};

function BannerShell({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <section
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        background: 'var(--color-surface-raised)',
        border: '1px solid var(--color-border-hairline)',
        borderLeft: `3px solid ${TONE_BORDER[tone]}`,
        borderRadius: 12,
        flexWrap: 'wrap',
      }}
    >
      {children}
    </section>
  );
}

function BannerError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      style={{
        margin: 0,
        width: '100%',
        fontSize: 12,
        color: 'var(--color-negative, #dc2626)',
      }}
    >
      {message}
    </p>
  );
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  const diffMs = Math.max(0, Date.now() - t);
  const min = Math.round(diffMs / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  return iso.slice(0, 10);
}
