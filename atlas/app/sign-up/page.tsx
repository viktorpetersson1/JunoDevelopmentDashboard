/**
 * T081.1 — Branded /sign-up page (invite-only model).
 *
 * Today there's no public sign-up; account creation is admin-driven (see
 * DECISIONS.md D-008 owner convention). Previously /sign-up 307'd to
 * /sign-in with no explanation — that confused visitors. This page makes
 * the invite-only stance explicit.
 *
 * Public route — added to PUBLIC_ROUTES in lib/supabase/middleware.ts so
 * unauthenticated visitors can read it without bouncing through sign-in.
 */

import type { Metadata } from 'next';
import Link from 'next/link';
import { JunoMark } from '@/components/brand';

export const runtime = 'edge';

export const metadata: Metadata = {
  title: 'Sign up — Juno Atlas',
  description: 'Juno Atlas is invite-only. Contact your Juno administrator for access.',
};

export default function SignUpPage() {
  return (
    <main className="min-h-screen bg-surface-sunken">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <div className="rounded-xl bg-surface-base p-8 shadow-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 text-text-primary">
              <JunoMark size={40} ariaLabel="Juno" />
            </div>
            <h1 className="text-2xl font-semibold text-text-primary">Invite only</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Juno Atlas is currently available to Juno owners and admins only. To request access,
              contact your Juno administrator.
            </p>
          </div>

          <Link
            href="/sign-in"
            className="ja-button ja-button--primary ja-button--auth"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              textDecoration: 'none',
            }}
          >
            Back to sign in
          </Link>
        </div>
      </div>
    </main>
  );
}
