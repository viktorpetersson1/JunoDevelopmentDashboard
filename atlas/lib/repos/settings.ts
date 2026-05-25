/**
 * Settings repo — reads owners + cap table + user profiles.
 *
 * Mutations live in services (lib/services/settings.ts) once write paths
 * land; for now this is read-only and feeds the Settings surface (T071).
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

export interface CapTableEntryView {
  ownerId: string;
  ownerKey: string;
  displayName: string;
  email: string | null;
  isSponsor: boolean;
  shareBps: number; // basis points (10000 = 100%)
  effectiveFrom: string; // YYYY-MM-DD
  taxRateBps: number;
}

export interface UserProfileView {
  id: string;
  email: string;
  displayName: string | null;
  role: 'super_admin' | 'editor' | 'viewer' | 'viewer_basic';
  createdAt: string;
}

interface OwnerRow {
  id: string;
  key: string;
  display_name: string;
  email: string | null;
  is_sponsor: boolean;
  tax_rate_bps: number;
}

interface CapTableRow {
  owner_id: string;
  share_bps: number;
  effective_from: string;
}

/**
 * List all current cap-table entries with their owner metadata.
 * Sorted by share_bps DESC so the largest holders appear first.
 */
export async function fetchCapTable(): Promise<CapTableEntryView[]> {
  const supabase = createSupabaseServerClient();

  // Two queries in parallel: cap_table current rows + owners metadata.
  const [{ data: capRows, error: capErr }, { data: ownerRows, error: ownerErr }] =
    await Promise.all([
      supabase
        .schema('atlas')
        .from('cap_table')
        .select('owner_id, share_bps, effective_from')
        .eq('is_current', true)
        .order('share_bps', { ascending: false }),
      supabase
        .schema('atlas')
        .from('owners')
        .select('id, key, display_name, email, is_sponsor, tax_rate_bps')
        .eq('is_archived', false),
    ]);

  if (capErr) throw new Error(`fetchCapTable cap_table: ${capErr.message}`);
  if (ownerErr) throw new Error(`fetchCapTable owners: ${ownerErr.message}`);

  const ownerMap = new Map<string, OwnerRow>();
  for (const o of (ownerRows as unknown as OwnerRow[]) ?? []) ownerMap.set(o.id, o);

  return ((capRows as unknown as CapTableRow[]) ?? []).map((c) => {
    const o = ownerMap.get(c.owner_id);
    return {
      ownerId: c.owner_id,
      ownerKey: o?.key ?? 'unknown',
      displayName: o?.display_name ?? 'Unknown',
      email: o?.email ?? null,
      isSponsor: o?.is_sponsor ?? false,
      shareBps: c.share_bps,
      effectiveFrom: c.effective_from,
      taxRateBps: o?.tax_rate_bps ?? 0,
    };
  });
}

/** List all Supabase auth profiles for the Owners tab. */
export async function fetchAllProfiles(): Promise<UserProfileView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .from('user_profiles')
    .select('id, email, display_name, role, created_at')
    .order('created_at', { ascending: true });

  if (error) throw new Error(`fetchAllProfiles: ${error.message}`);

  return (
    (data as Array<{
      id: string;
      email: string;
      display_name: string | null;
      role: string;
      created_at: string;
    }> | null) ?? []
  ).map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    role: r.role as UserProfileView['role'],
    createdAt: r.created_at,
  }));
}
