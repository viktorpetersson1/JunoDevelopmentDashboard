/**
 * Server-side auth helpers for use in Server Components, Route Handlers,
 * and Server Actions.
 *
 * Translation of the bundle's Clerk `auth()` / `currentUser()` helpers to
 * Supabase. Throws `UnauthorizedError` / `ForbiddenError` with conventional
 * HTTP-aligned codes so Route Handlers can map them to 401 / 403.
 */
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { User } from '@supabase/supabase-js';
import { fetchUserProfile, type UserProfile } from './profile';

export class UnauthorizedError extends Error {
  readonly status = 401;
  readonly code = 'UNAUTHENTICATED';
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  readonly status = 403;
  readonly code = 'FORBIDDEN';
  constructor(message = 'Insufficient role') {
    super(message);
    this.name = 'ForbiddenError';
  }
}

export interface AuthContext {
  user: User;
  profile: UserProfile;
}

/**
 * Returns the authenticated user + their profile (display name, role, etc.)
 * Throws UnauthorizedError if not signed in.
 *
 * Safe to call from any server-side context with cookie access.
 */
export async function requireAuth(): Promise<AuthContext> {
  const supabase = createSupabaseServerClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new UnauthorizedError();
  }

  const profile = await fetchUserProfile(user.id);
  if (!profile) {
    // User exists in auth.users but has no public.user_profiles row — this
    // shouldn't happen post-handle_new_user trigger, but if it does we
    // treat the user as half-onboarded and deny access.
    throw new UnauthorizedError('Profile not found');
  }

  return { user, profile };
}

/**
 * Like requireAuth() but returns null instead of throwing. Use in Server
 * Components that want to render a public landing page if no user.
 */
export async function getAuth(): Promise<AuthContext | null> {
  try {
    return await requireAuth();
  } catch {
    return null;
  }
}

/**
 * Server-Component-friendly auth gate: redirect to /sign-in?redirectTo=...
 * instead of throwing UnauthorizedError (which bubbles to error.tsx and
 * shows a generic "Something went wrong" page).
 *
 * Use this in page.tsx files; reserve `requireAuth` for API route handlers
 * where the throw → 401 mapping is the right pattern.
 *
 * Middleware should always catch unauth before this fires, but on Cloudflare
 * a stale or partially-refreshed cookie can occasionally slip past — the
 * redirect here is the user-friendly fallback.
 */
export async function requireAuthOrRedirect(currentPath = '/'): Promise<AuthContext> {
  const { redirect } = await import('next/navigation');
  try {
    return await requireAuth();
  } catch {
    const target = `/sign-in?redirectTo=${encodeURIComponent(currentPath)}`;
    redirect(target);
    // redirect() throws an internal NEXT_REDIRECT error, but TS doesn't
    // know it's `never`-returning. Throw explicitly so this function's
    // return type stays Promise<AuthContext>.
    throw new Error('unreachable: redirect threw');
  }
}
