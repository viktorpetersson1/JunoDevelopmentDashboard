'use client';

/**
 * V4.10 — User management client (INVENTORY §26).
 *
 * Table: Name | Email | Joined | Role (editable per row, except self).
 * Role change fires POST /api/users/[id]/role; on success the row reflects
 * the new role + a brief "Updated" pill. Last-admin guard + self-row
 * protection live server-side.
 */

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { UserProfileView } from '@/lib/repos/settings';

const ROLE_OPTS = [
  { value: 'super_admin', label: 'Super admin' },
  { value: 'editor', label: 'Editor' },
  { value: 'viewer', label: 'Viewer' },
  { value: 'viewer_basic', label: 'Basic viewer (no $)' },
] as const;

type Role = (typeof ROLE_OPTS)[number]['value'];

export function UsersClient({
  profiles,
  currentUserId,
}: {
  profiles: UserProfileView[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [rowError, setRowError] = useState<Record<string, string>>({});
  const [rowOk, setRowOk] = useState<Record<string, true>>({});

  function changeRole(userId: string, newRole: Role) {
    setRowError((p) => {
      const { [userId]: _, ...rest } = p;
      return rest;
    });
    setRowOk((p) => {
      const { [userId]: _, ...rest } = p;
      return rest;
    });
    startTransition(async () => {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as {
          error?: { code: string; message: string };
        } | null;
        setRowError((p) => ({
          ...p,
          [userId]: json?.error?.message ?? `HTTP ${res.status}`,
        }));
        return;
      }
      setRowOk((p) => ({ ...p, [userId]: true }));
      router.refresh();
    });
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <header>
        <h1
          style={{ fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--color-text-primary)' }}
        >
          Users
        </h1>
        <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--color-text-secondary)' }}>
          {profiles.length} user{profiles.length === 1 ? '' : 's'} · role changes apply immediately.
          You cannot change your own role.
        </p>
      </header>

      <section
        style={{
          background: 'var(--ja-card-bg)',
          border: 'var(--ja-card-border)',
          borderRadius: 'var(--ja-card-radius)',
          overflow: 'hidden',
        }}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--color-surface-base)' }}>
              <th style={th()}>Name</th>
              <th style={th()}>Email</th>
              <th style={th()}>Joined</th>
              <th style={th()}>Role</th>
            </tr>
          </thead>
          <tbody>
            {profiles.map((p) => {
              const isSelf = p.id === currentUserId;
              const err = rowError[p.id];
              const ok = rowOk[p.id];
              return (
                <tr key={p.id} style={{ borderTop: '1px solid var(--color-border-hairline)' }}>
                  <td style={td()}>
                    {p.displayName ?? '—'}
                    {isSelf && (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10,
                          padding: '1px 6px',
                          borderRadius: 4,
                          background: 'var(--color-accent-lime, #ddec65)',
                          color: 'var(--color-text-on-lime, #0d0d0d)',
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          fontWeight: 700,
                        }}
                      >
                        You
                      </span>
                    )}
                  </td>
                  <td style={td()}>{p.email}</td>
                  <td style={td()}>{p.createdAt.slice(0, 10)}</td>
                  <td style={td()}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <select
                        value={p.role}
                        disabled={isSelf || pending}
                        onChange={(e) => changeRole(p.id, e.target.value as Role)}
                        style={{
                          padding: '6px 10px',
                          fontSize: 13,
                          background: 'var(--color-surface-base)',
                          color: 'var(--color-text-primary)',
                          border: 'var(--ja-card-border)',
                          borderRadius: 6,
                          cursor: isSelf ? 'not-allowed' : 'pointer',
                          opacity: isSelf ? 0.5 : 1,
                          maxWidth: 200,
                        }}
                      >
                        {ROLE_OPTS.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      {err && (
                        <span
                          style={{ fontSize: 11, color: 'var(--color-negative, #b91c1c)' }}
                          role="alert"
                        >
                          {err}
                        </span>
                      )}
                      {ok && !err && (
                        <span
                          style={{ fontSize: 11, color: 'var(--color-positive, #15803d)' }}
                          role="status"
                        >
                          Updated.
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function th(): React.CSSProperties {
  return {
    textAlign: 'left',
    padding: '10px 14px',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    color: 'var(--color-text-tertiary)',
  };
}
function td(): React.CSSProperties {
  return {
    padding: '10px 14px',
    color: 'var(--color-text-primary)',
    verticalAlign: 'top',
  };
}
