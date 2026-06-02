import type { Metadata } from 'next';
import { JunoMark } from '@/components/brand';
import { SignInForm } from './sign-in-form';
import { sanitizeRedirect } from '@/lib/auth/safe-redirect';
import { DotGridBackground } from './_components/dot-grid-background';

export const runtime = 'edge';

export const metadata: Metadata = {
  title: 'Sign in — Juno Atlas',
  description: 'Sign in to Juno Atlas.',
};

// Server component shell. Renders the client-side SignInForm. The form handles
// state, validation, errors, and Supabase auth client interaction.
export default function SignInPage({
  searchParams,
}: {
  searchParams: { redirectTo?: string; error?: string };
}) {
  // T081.3 — default to the canonical post-login surface, not `/`.
  // T085.1 — sanitize against the open-redirect allowlist server-side so
  // a `?redirectTo=https://evil.com` URL never makes it into the RSC
  // payload or the client form's router.push() target.
  const redirectTo = sanitizeRedirect(searchParams.redirectTo);
  const errorParam = searchParams.error;

  return (
    <main className="relative min-h-screen" style={{ background: '#ffffff' }}>
      <DotGridBackground />
      <div className="relative z-10 mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <div className="rounded-xl bg-surface-base p-8 shadow-sm">
          {/* T080.6 — H1 + subtitle copy. Mark down from 56→40 to lighten the
              top of the card; the mark already says "Juno", H1 doesn't need to. */}
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 text-text-primary">
              <JunoMark size={40} ariaLabel="Juno" />
            </div>
            <h1 className="text-2xl font-semibold text-text-primary">Welcome back</h1>
            <p className="mt-2 text-sm text-text-secondary">
              Sign in to your Juno Atlas workspace.
            </p>
          </div>

          <SignInForm redirectTo={redirectTo} initialError={errorParam} />

          {/* text-text-secondary (#6b7280, 4.83:1 on #fff) instead of tertiary
              (#767b84, ~4.26:1) to satisfy WCAG AA 4.5:1 at text-xs (12px). */}
          <p className="mt-6 text-center text-xs text-text-secondary">
            Need an account? Ask a Juno admin to invite you.
          </p>
        </div>
      </div>
    </main>
  );
}
