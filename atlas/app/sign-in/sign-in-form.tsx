'use client';

/**
 * Sign-in form (T080 polish sprint v3).
 *
 * Subtasks landed in this file:
 *   - T080.1  auth-size Button + Input
 *   - T080.2  custom inline validation (noValidate + per-field errors)
 *   - T080.3  submit loading state + "Signing in…" + double-submit guard
 *   - T080.4  password show/hide toggle via Input `trailing` slot
 *   - T080.8  forgot-password as a ghost --sm button, not full-width link
 *
 * Out of scope here (handled in T081):
 *   - root-redirect cycle (page.tsx default redirectTo)
 *   - forgot-password email-enumeration copy normalisation
 */

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';

type Mode = 'sign-in' | 'reset';

interface FieldErrors {
  email?: string;
  password?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(initialError ?? null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [resetSent, setResetSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [, startTransition] = useTransition();

  // ── Validation (T080.2) ───────────────────────────────────────────────────
  function validateSignIn(): FieldErrors {
    const errs: FieldErrors = {};
    if (!email.trim()) errs.email = 'Email is required.';
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address.';
    if (!password) errs.password = 'Password is required.';
    return errs;
  }

  function validateReset(): FieldErrors {
    const errs: FieldErrors = {};
    if (!email.trim()) errs.email = 'Email is required.';
    else if (!EMAIL_RE.test(email.trim())) errs.email = 'Enter a valid email address.';
    return errs;
  }

  // ── Sign-in submit (T080.3 loading state + double-submit guard) ──────────
  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setFormError(null);

    const errs = validateSignIn();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    if (submitting) return; // belt + braces over `disabled` on the button
    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) {
        setFormError(signInError.message);
        return;
      }
      startTransition(() => {
        router.push(redirectTo);
        router.refresh();
      });
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * T081.2 — email-enumeration fix.
   *
   * Always show the same success message regardless of whether
   * `resetPasswordForEmail` succeeded or failed (Supabase returns no
   * error for unknown emails today, but a future API change or an
   * upstream rate-limiter response would otherwise leak account
   * existence). UI feedback is invariant; the request still goes
   * through so wall-clock timing stays similar across paths.
   */
  async function handleResetRequest(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    setResetSent(false);

    const errs = validateReset();
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }
    setFieldErrors({});

    if (submitting || resetSent) return;
    setSubmitting(true);
    try {
      try {
        const supabase = createSupabaseBrowserClient();
        await supabase.auth.resetPasswordForEmail(email.trim());
      } catch {
        // Swallow — UI feedback is normalised regardless.
      }
      // Always set sent so the form locks and user sees the same copy.
      setResetSent(true);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Password show/hide trailing toggle (T080.4) ──────────────────────────
  function PasswordToggle() {
    return (
      <button
        type="button"
        onClick={() => setShowPassword((s) => !s)}
        aria-label={showPassword ? 'Hide password' : 'Show password'}
        aria-pressed={showPassword}
        style={{
          background: 'transparent',
          border: 'none',
          padding: '0 4px',
          cursor: 'pointer',
          color: 'var(--color-text-tertiary)',
          display: 'inline-flex',
          alignItems: 'center',
        }}
      >
        {showPassword ? <EyeOffIcon /> : <EyeIcon />}
      </button>
    );
  }

  // ── Reset-password mode ──────────────────────────────────────────────────
  if (mode === 'reset') {
    return (
      <form onSubmit={handleResetRequest} noValidate className="space-y-4">
        <Input
          label="Email"
          type="email"
          autoComplete="email"
          variant="auth"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={fieldErrors.email}
          disabled={submitting || resetSent}
        />

        {formError && (
          <p className="text-sm-juno text-negative" role="alert">
            {formError}
          </p>
        )}
        {resetSent && (
          <p className="text-sm-juno text-positive" role="status">
            If an account exists for that email, we&apos;ve sent a reset link.
          </p>
        )}

        <Button
          type="submit"
          variant="primary"
          size="auth"
          loading={submitting}
          disabled={resetSent}
        >
          {submitting ? 'Sending…' : 'Send reset link'}
        </Button>

        <div style={{ marginTop: 24, textAlign: 'center' }}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              setMode('sign-in');
              setFormError(null);
              setFieldErrors({});
              setResetSent(false);
            }}
          >
            Back to sign in
          </Button>
        </div>
      </form>
    );
  }

  // ── Sign-in mode ─────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSignIn} noValidate className="space-y-4">
      <Input
        label="Email"
        type="email"
        autoComplete="email"
        variant="auth"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={fieldErrors.email}
        disabled={submitting}
      />

      <Input
        label="Password"
        type={showPassword ? 'text' : 'password'}
        autoComplete="current-password"
        variant="auth"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        error={fieldErrors.password}
        disabled={submitting}
        trailing={<PasswordToggle />}
      />

      {formError && (
        <p className="text-sm-juno text-negative" role="alert">
          {formError}
        </p>
      )}

      <Button type="submit" variant="primary" size="auth" loading={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>

      <div style={{ marginTop: 24, textAlign: 'center' }}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            setMode('reset');
            setFormError(null);
            setFieldErrors({});
          }}
        >
          Forgot password?
        </Button>
      </div>
    </form>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Inline SVG icons — matches the existing AppShell convention (16px / 1.5px
// stroke). lucide-react isn't a dependency in this project; staying inline
// avoids adding one for two icons.
// ────────────────────────────────────────────────────────────────────────────

function EyeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 10s3-6 8.5-6 8.5 6 8.5 6-3 6-8.5 6-8.5-6-8.5-6z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 3l14 14" />
      <path d="M6.7 6.7C3.6 8.3 1.5 10 1.5 10s3 6 8.5 6c1.5 0 2.8-.3 3.9-.8" />
      <path d="M13.3 13.3a2.5 2.5 0 1 1-3.6-3.6" />
      <path d="M8.5 4.2c.5-.1 1-.2 1.5-.2 5.5 0 8.5 6 8.5 6-.5.9-1.3 2-2.4 3" />
    </svg>
  );
}
