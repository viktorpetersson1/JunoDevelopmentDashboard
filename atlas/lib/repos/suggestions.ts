/**
 * Suggestions repo — atlas.suggestions table (V4.8, INVENTORY §25).
 *
 * Persists user-submitted suggestions from the Ask Juno widget and lets
 * editor+ review them via the /suggestions page. Replaces the V4.1
 * audit-log-only stub.
 *
 * Reads are RLS-permissive (any authenticated user); the UI gates
 * editor+ at the route handler / page level.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';

export type SuggestionStatus = 'pending' | 'approved' | 'rejected' | 'applied';

export interface SuggestionView {
  id: string;
  submittedBy: string;
  submittedByEmail: string | null;
  submittedByDisplayName: string | null;
  submittedAt: string;
  prompt: string;
  pathname: string | null;
  assistantSummary: string | null;
  proposedPatch: unknown | null;
  status: SuggestionStatus;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  appliedAt: string | null;
}

interface SuggestionRow {
  id: string;
  submitted_by: string;
  submitted_at: string;
  prompt: string;
  pathname: string | null;
  assistant_summary: string | null;
  proposed_patch: unknown | null;
  status: SuggestionStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
  applied_at: string | null;
}

/** Insert a fresh pending suggestion. Returns the created row's id.
 *  V7 T144: `proposedPatch` carries the structured jsonb patch the generic
 *  apply path executes on approval. */
export async function insertSuggestion(input: {
  submittedBy: string;
  prompt: string;
  pathname: string | null;
  assistantSummary: string | null;
  proposedPatch?: unknown | null;
}): Promise<string> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('suggestions')
    .insert({
      submitted_by: input.submittedBy,
      prompt: input.prompt,
      pathname: input.pathname,
      assistant_summary: input.assistantSummary,
      proposed_patch: input.proposedPatch ?? null,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertSuggestion: ${error.message}`);
  return (data as { id: string }).id;
}

/** List suggestions, newest first. Joins submitter email + display name. */
export async function findManySuggestions(opts: {
  status?: SuggestionStatus | 'all';
  limit?: number;
}): Promise<SuggestionView[]> {
  const supabase = createSupabaseServerClient();
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);

  let query = supabase
    .schema('atlas')
    .from('suggestions')
    .select(
      'id, submitted_by, submitted_at, prompt, pathname, assistant_summary, proposed_patch, status, reviewed_by, reviewed_at, review_note, applied_at'
    )
    .order('submitted_at', { ascending: false })
    .limit(limit);

  if (opts.status && opts.status !== 'all') {
    query = query.eq('status', opts.status);
  }

  const { data: rows, error } = await query;
  if (error) throw new Error(`findManySuggestions: ${error.message}`);

  const raws = (rows as unknown as SuggestionRow[]) ?? [];
  if (raws.length === 0) return [];

  // Resolve submitter identity via public.user_profiles in a single query.
  const ids = Array.from(new Set(raws.map((r) => r.submitted_by).filter(Boolean)));
  const { data: profiles, error: pErr } = await supabase
    .from('user_profiles')
    .select('id, email, display_name')
    .in('id', ids);
  if (pErr) {
    // Non-fatal — surface IDs only if the profile lookup fails.
    return raws.map((r) => normalize(r, null, null));
  }
  const map = new Map<string, { email: string | null; displayName: string | null }>();
  for (const p of (profiles as Array<{
    id: string;
    email: string | null;
    display_name: string | null;
  }>) ?? []) {
    map.set(p.id, { email: p.email, displayName: p.display_name });
  }
  return raws.map((r) => {
    const m = map.get(r.submitted_by);
    return normalize(r, m?.email ?? null, m?.displayName ?? null);
  });
}

/**
 * Mutate a suggestion's status. The transition rules are enforced here:
 *   pending → approved | rejected
 *   approved → applied
 *
 * Editor+ caller is enforced by the API route handler, not here.
 */
export async function updateSuggestionStatus(input: {
  id: string;
  next: SuggestionStatus;
  reviewerId: string;
  note?: string | null;
}): Promise<SuggestionView> {
  const supabase = createSupabaseServerClient();

  // Pull current to validate the transition.
  const { data: current, error: gErr } = await supabase
    .schema('atlas')
    .from('suggestions')
    .select('status')
    .eq('id', input.id)
    .single();
  if (gErr || !current) {
    throw new Error(`updateSuggestionStatus: not found (${gErr?.message ?? 'no row'})`);
  }
  const prev = (current as { status: SuggestionStatus }).status;
  if (!isValidTransition(prev, input.next)) {
    throw new Error(`updateSuggestionStatus: invalid transition ${prev} → ${input.next}`);
  }

  const patch: Record<string, unknown> = {
    status: input.next,
    reviewed_by: input.reviewerId,
    reviewed_at: new Date().toISOString(),
  };
  if (input.note !== undefined) patch.review_note = input.note;
  if (input.next === 'applied') patch.applied_at = new Date().toISOString();

  const { data: updated, error: uErr } = await supabase
    .schema('atlas')
    .from('suggestions')
    .update(patch)
    .eq('id', input.id)
    .select(
      'id, submitted_by, submitted_at, prompt, pathname, assistant_summary, proposed_patch, status, reviewed_by, reviewed_at, review_note, applied_at'
    )
    .single();
  if (uErr || !updated) {
    throw new Error(`updateSuggestionStatus update: ${uErr?.message ?? 'no row'}`);
  }

  // Re-fetch submitter identity for the response.
  const row = updated as unknown as SuggestionRow;
  const { data: prof } = await supabase
    .from('user_profiles')
    .select('email, display_name')
    .eq('id', row.submitted_by)
    .maybeSingle();
  const p = (prof as { email: string | null; display_name: string | null } | null) ?? null;
  return normalize(row, p?.email ?? null, p?.display_name ?? null);
}

/**
 * Whitelist of allowed status transitions. Kept here so the rule is
 * inspectable in one place — the page's button-render logic mirrors it.
 */
function isValidTransition(prev: SuggestionStatus, next: SuggestionStatus): boolean {
  if (prev === next) return false;
  if (prev === 'pending' && (next === 'approved' || next === 'rejected')) return true;
  if (prev === 'approved' && next === 'applied') return true;
  return false;
}

function normalize(
  row: SuggestionRow,
  email: string | null,
  displayName: string | null
): SuggestionView {
  return {
    id: row.id,
    submittedBy: row.submitted_by,
    submittedByEmail: email,
    submittedByDisplayName: displayName,
    submittedAt: row.submitted_at,
    prompt: row.prompt,
    pathname: row.pathname,
    assistantSummary: row.assistant_summary,
    proposedPatch: row.proposed_patch,
    status: row.status,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at,
    reviewNote: row.review_note,
    appliedAt: row.applied_at,
  };
}
