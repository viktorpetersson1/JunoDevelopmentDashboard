/**
 * Settings → Owners tab. Read-only list of all Supabase auth users + their
 * role + display name. Invite flow + role-edit ship in T071 follow-up
 * (needs Supabase Auth admin API).
 */

import type { UserProfileView } from '@/lib/repos/settings';

const ROLE_LABEL: Record<UserProfileView['role'], string> = {
  super_admin: 'Super admin',
  editor: 'Editor',
  viewer: 'Viewer',
  viewer_basic: 'Viewer (basic)',
};

const ROLE_COLOR: Record<UserProfileView['role'], string> = {
  super_admin: 'var(--color-accent-base, #131313)',
  editor: 'var(--color-status-info, #2563eb)',
  viewer: 'var(--color-text-secondary)',
  viewer_basic: 'var(--color-text-tertiary)',
};

export function OwnersTab({
  profiles,
  currentUserId,
}: {
  profiles: UserProfileView[];
  currentUserId: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <p style={{ fontSize: 12, color: 'var(--color-text-tertiary)', margin: 0 }}>
        Read-only. Invite-by-email + role edit ship in T071 follow-up (needs Supabase Auth admin
        endpoint).
      </p>

      <section
        style={{
          background: 'var(--ja-card-bg)',
          border: 'var(--ja-card-border)',
          borderRadius: 'var(--ja-card-radius)',
          padding: 24,
          overflowX: 'auto',
        }}
      >
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'baseline',
            marginBottom: 16,
          }}
        >
          <h3
            style={{
              fontSize: 11,
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: 'var(--color-text-tertiary)',
              margin: 0,
            }}
          >
            All accounts
          </h3>
          <span style={{ fontSize: 11, color: 'var(--color-text-tertiary)' }}>
            {profiles.length} {profiles.length === 1 ? 'user' : 'users'}
          </span>
        </header>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <Th align="left">Name</Th>
              <Th align="left">Email</Th>
              <Th align="left">Role</Th>
              <Th align="left">Added</Th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const isYou = p.id === currentUserId;
              return (
                <tr key={p.id}>
                  <Td>
                    {p.displayName ?? '—'}
                    {isYou && (
                      <span
                        style={{
                          marginLeft: 8,
                          fontSize: 10,
                          padding: '2px 6px',
                          background: 'var(--color-surface-sunken)',
                          color: 'var(--color-text-tertiary)',
                          borderRadius: 4,
                          letterSpacing: '0.05em',
                          textTransform: 'uppercase',
                        }}
                      >
                        you
                      </span>
                    )}
                  </Td>
                  <Td muted>{p.email}</Td>
                  <Td>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 400,
                        color: ROLE_COLOR[p.role],
                      }}
                    >
                      {ROLE_LABEL[p.role]}
                    </span>
                  </Td>
                  <Td muted>{p.createdAt.slice(0, 10)}</Td>
                </tr>
              );
            })}
            {profiles.length === 0 && (
              <tr>
                <td
                  colSpan={4}
                  style={{
                    padding: '24px 0',
                    textAlign: 'center',
                    color: 'var(--color-text-tertiary)',
                    fontSize: 13,
                  }}
                >
                  No accounts yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align: 'left' | 'right' }) {
  return (
    <th
      style={{
        textAlign: align,
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: 'var(--color-text-tertiary)',
        padding: '8px 12px 8px 0',
        borderBottom: '1px solid var(--color-border-hairline)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <td
      style={{
        padding: '10px 12px 10px 0',
        fontSize: 13,
        color: muted ? 'var(--color-text-secondary)' : 'var(--color-text-primary)',
        borderBottom: '1px solid var(--color-border-subtle)',
      }}
    >
      {children}
    </td>
  );
}
