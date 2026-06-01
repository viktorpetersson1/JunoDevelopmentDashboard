/**
 * Settings → Profile tab. Read-only display of the signed-in user's
 * profile fields. Edit path (display_name + avatar upload) ships when
 * Supabase Storage avatar bucket is wired in the follow-up.
 */

import type { UserProfile } from '@/lib/auth/profile';

const ROLE_LABELS: Record<UserProfile['role'], string> = {
  super_admin: 'Super admin',
  editor: 'Editor',
  viewer: 'Viewer',
  viewer_basic: 'Viewer (basic)',
};

const ROLE_BLURBS: Record<UserProfile['role'], string> = {
  super_admin: 'Full access: edit projects, cap table, owners, and approve capital calls.',
  editor: 'Edit projects + draft snapshots. Cannot approve calls or edit cap table.',
  viewer: 'Read-only portfolio + own capital-call history.',
  viewer_basic: 'Portfolio summary view only (KPIs without per-owner detail).',
};

export function ProfileTab({
  profile,
  authEmail,
}: {
  profile: UserProfile;
  authEmail: string | null;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>
        Read-only. Edit affordance ships in T071 follow-up (avatar bucket + name change flow).
      </p>

      <section
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          padding: 24,
        }}
      >
        <h3
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
            margin: 0,
            marginBottom: 16,
          }}
        >
          Identity
        </h3>
        <dl style={{ margin: 0 }}>
          <KV label="Display name" value={profile.displayName ?? '—'} />
          <KV label="Email" value={profile.email ?? authEmail ?? '—'} />
          <KV label="User ID" value={profile.id} mono />
        </dl>
      </section>

      <section
        style={{
          background: 'var(--color-surface-raised)',
          border: '1px solid var(--color-border-hairline)',
          borderRadius: 14,
          padding: 24,
        }}
      >
        <h3
          style={{
            fontSize: 11,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--color-text-tertiary)',
            margin: 0,
            marginBottom: 16,
          }}
        >
          Role
        </h3>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
          }}
        >
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-text-primary)',
            }}
          >
            {ROLE_LABELS[profile.role]}
          </span>
          <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>
            {ROLE_BLURBS[profile.role]}
          </span>
        </div>
      </section>
    </div>
  );
}

function KV({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '1px solid var(--color-border-subtle)',
        fontSize: 13,
      }}
    >
      <dt style={{ color: 'var(--color-text-secondary)' }}>{label}</dt>
      <dd
        style={{
          margin: 0,
          color: 'var(--color-text-primary)',
          fontFamily: mono ? 'var(--font-mono, ui-monospace)' : 'inherit',
          fontVariantNumeric: mono ? 'tabular-nums' : undefined,
          textAlign: 'right',
        }}
      >
        {value}
      </dd>
    </div>
  );
}
