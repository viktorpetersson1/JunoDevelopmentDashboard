/**
 * User profile data fetched from public.user_profiles (vanilla-owned table).
 * Atlas reads role + display_name from here.
 */
import { createSupabaseServerClient } from '@/lib/supabase/server';

export type UserRole = 'super_admin' | 'editor' | 'viewer' | 'viewer_basic';

export interface UserProfile {
  id: string;
  email: string;
  displayName: string | null;
  role: UserRole;
}

/**
 * Look up a user's profile by their auth.users.id.
 * Returns null when no profile row exists yet (transient post-signup state).
 */
export async function fetchUserProfile(userId: string): Promise<UserProfile | null> {
  const supabase = createSupabaseServerClient();

  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, display_name, role')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to fetch user profile: ${error.message}`);
  }

  if (!data) return null;

  return {
    id: data.id as string,
    email: data.email as string,
    displayName: data.display_name as string | null,
    role: data.role as UserRole,
  };
}
