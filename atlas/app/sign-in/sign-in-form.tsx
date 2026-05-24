'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Mode = 'sign-in' | 'reset';

export function SignInForm({
  redirectTo,
  initialError,
}: {
  redirectTo: string;
  initialError?: string;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('sign-in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [resetSent, setResetSent] = useState(false);
  const [isPending, startTransition] = useTransition();

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!email || !password) {
      setError('Email and password are required.');
      return;
    }

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (signInError) {
        setError(signInError.message);
        return;
      }

      // Server middleware will pick up the new cookies on the next nav.
      router.push(redirectTo);
      router.refresh();
    });
  }

  async function handleResetRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResetSent(false);

    if (!email) {
      setError('Enter your email to receive a reset link.');
      return;
    }

    startTransition(async () => {
      const supabase = createSupabaseBrowserClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email);

      if (resetError) {
        setError(resetError.message);
        return;
      }

      setResetSent(true);
    });
  }

  if (mode === 'reset') {
    return (
      <form onSubmit={handleResetRequest} className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        {error && (
          <p className="text-sm-juno text-negative" role="alert">
            {error}
          </p>
        )}
        {resetSent && (
          <p className="text-sm-juno text-positive" role="status">
            Reset link sent. Check your email.
          </p>
        )}

        <Button type="submit" variant="primary" fullWidth loading={isPending}>
          Send reset link
        </Button>

        <button
          type="button"
          onClick={() => {
            setMode('sign-in');
            setError(null);
            setResetSent(false);
          }}
          className="block w-full text-center text-sm text-text-secondary hover:text-text-primary"
        >
          Back to sign in
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSignIn} className="space-y-4">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
      />

      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        required
        minLength={8}
      />

      {error && (
        <p className="text-sm-juno text-negative" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" variant="primary" fullWidth loading={isPending}>
        Sign in
      </Button>

      <button
        type="button"
        onClick={() => {
          setMode('reset');
          setError(null);
        }}
        className="block w-full text-center text-sm text-text-secondary hover:text-text-primary"
      >
        Forgot password?
      </button>
    </form>
  );
}
