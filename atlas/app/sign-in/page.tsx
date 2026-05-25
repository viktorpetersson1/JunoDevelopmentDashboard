import type { Metadata } from 'next';
import { JunoMark } from '@/components/brand';
import { SignInForm } from './sign-in-form';

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
  const redirectTo = searchParams.redirectTo ?? '/';
  const errorParam = searchParams.error;

  return (
    <main className="min-h-screen bg-surface-sunken">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
        <div className="rounded-xl bg-surface-base p-8 shadow-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <div className="mb-4 text-text-primary">
              <JunoMark size={56} ariaLabel="Juno" />
            </div>
            <h1 className="text-2xl font-semibold text-text-primary">Juno Atlas</h1>
            <p className="mt-2 text-sm text-text-secondary">Sign in to continue.</p>
          </div>

          <SignInForm redirectTo={redirectTo} initialError={errorParam} />

          <p className="mt-6 text-center text-xs text-text-tertiary">
            Need an account? Ask a Juno admin to invite you.
          </p>
        </div>
      </div>
    </main>
  );
}
