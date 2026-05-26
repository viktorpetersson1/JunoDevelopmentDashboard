import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SignInForm } from '../sign-in-form';

// Stub the Supabase browser client — these tests verify form behaviour,
// not Supabase Auth itself. Real auth runs in Playwright (deferred to T076).
const signInWithPassword = vi.fn();
const resetPasswordForEmail = vi.fn();

vi.mock('@/lib/supabase/client', () => ({
  createSupabaseBrowserClient: () => ({
    auth: {
      signInWithPassword: (...args: unknown[]) => signInWithPassword(...args),
      resetPasswordForEmail: (...args: unknown[]) => resetPasswordForEmail(...args),
    },
  }),
}));

const push = vi.fn();
const refresh = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, refresh }),
}));

beforeEach(() => {
  signInWithPassword.mockReset();
  resetPasswordForEmail.mockReset();
  push.mockReset();
  refresh.mockReset();
});

describe('SignInForm — sign-in mode', () => {
  it('renders email + password fields + submit button', () => {
    render(<SignInForm redirectTo="/" />);
    expect(screen.getByLabelText('Email')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });

  it('shows initial error from URL param', () => {
    render(<SignInForm redirectTo="/" initialError="Session expired" />);
    expect(screen.getByRole('alert')).toHaveTextContent('Session expired');
  });

  it('blocks submit + shows error when fields are empty', async () => {
    render(<SignInForm redirectTo="/" />);
    // React + HTML5 validation: the form won't actually submit because the
    // inputs are required. Manually call the handler by submitting via
    // requestSubmit on a button click; easier to test via filling one field
    // and clearing it.
    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    // Password still empty — required attribute prevents submit, but to
    // exercise the JS branch we simulate via form submit directly:
    const form = screen.getByLabelText('Email').closest('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });
    // signInWithPassword should NOT have been called
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('calls signInWithPassword + redirects on success', async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    render(<SignInForm redirectTo="/dashboard" />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'pw12345678' } });

    const form = screen.getByLabelText('Email').closest('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(signInWithPassword).toHaveBeenCalledWith({
        email: 'a@b.c',
        password: 'pw12345678',
      });
    });
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('surfaces Supabase error message on failure', async () => {
    signInWithPassword.mockResolvedValue({
      error: { message: 'Invalid login credentials' },
    });
    render(<SignInForm redirectTo="/" />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'wrong' } });
    const form = screen.getByLabelText('Email').closest('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('Invalid login credentials');
    });
    expect(push).not.toHaveBeenCalled();
  });
});

describe('SignInForm — reset-password mode', () => {
  it('toggles to reset mode + back', () => {
    render(<SignInForm redirectTo="/" />);
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));
    expect(screen.getByRole('button', { name: 'Send reset link' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Password')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Back to sign in' }));
    expect(screen.getByLabelText('Password')).toBeInTheDocument();
  });

  it('calls resetPasswordForEmail + shows email-enumeration-safe confirmation', async () => {
    // T081.2: UI feedback is the same whether the email exists or not.
    resetPasswordForEmail.mockResolvedValue({ error: null });
    render(<SignInForm redirectTo="/" />);
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'a@b.c' } });
    const form = screen.getByLabelText('Email').closest('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    await waitFor(() => {
      expect(resetPasswordForEmail).toHaveBeenCalledWith('a@b.c');
    });
    // New invariant-feedback copy — must NOT confirm or deny account existence.
    expect(screen.getByRole('status')).toHaveTextContent(/if an account exists/i);
  });

  it('T081.2: shows the SAME confirmation copy when Supabase rejects (no enumeration)', async () => {
    resetPasswordForEmail.mockRejectedValue(new Error('rate limited'));
    render(<SignInForm redirectTo="/" />);
    fireEvent.click(screen.getByRole('button', { name: 'Forgot password?' }));

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'unknown@nowhere.test' } });
    const form = screen.getByLabelText('Email').closest('form')!;
    await act(async () => {
      fireEvent.submit(form);
    });

    // Same status message as the success path; no `alert` surfacing the error.
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent(/if an account exists/i);
    });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
