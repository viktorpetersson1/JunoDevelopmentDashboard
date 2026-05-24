/**
 * Role-gating helpers. Use after requireAuth() to enforce per-role access.
 *
 *   const { user, profile } = await requireAuth();
 *   requireRole(profile, ['super_admin', 'editor']);
 */
import { ForbiddenError } from './requireAuth';
import type { UserProfile, UserRole } from './profile';

/** Throws ForbiddenError if profile.role is not in the allowed set. */
export function requireRole(profile: UserProfile, allowed: UserRole[]): void {
  if (!allowed.includes(profile.role)) {
    throw new ForbiddenError(
      `Role '${profile.role}' is not in allowed roles: ${allowed.join(', ')}`
    );
  }
}

/** Boolean check — does NOT throw. */
export function hasRole(profile: UserProfile, allowed: UserRole[]): boolean {
  return allowed.includes(profile.role);
}

/** Convenience: super_admin only. */
export function requireSuperAdmin(profile: UserProfile): void {
  requireRole(profile, ['super_admin']);
}

/** Convenience: super_admin or editor (write access). */
export function requireEditor(profile: UserProfile): void {
  requireRole(profile, ['super_admin', 'editor']);
}
