/**
 * Capital call repo. Reads + raw inserts for the three-table family:
 *   atlas.capital_calls
 *   atlas.capital_call_owner_shares
 *   atlas.capital_call_payments
 *
 * Per CLAUDE.md §5, services call repos; routes call services. Business
 * rules live in `lib/services/capital-call.ts` — this file is mechanical
 * SQL only.
 *
 * Sum invariant (shares.amount = call.total) is enforced by a deferred
 * trigger `atlas.check_capital_call_share_sum`, so multi-row inserts
 * inside a transaction stay valid until commit.
 */

import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';

// ────────────────────────────────────────────────────────────────────────────
// View types — what the service + UI consume.
// ────────────────────────────────────────────────────────────────────────────

export type CapitalCallStatus = 'draft' | 'issued' | 'partial' | 'funded' | 'cancelled';
export type OwnerShareStatus = 'pending' | 'committed' | 'funded';

export interface CapitalCallPaymentView {
  id: string;
  amountCents: number;
  receivedDate: string;
  method: string | null;
  referenceNumber: string | null;
  notes: string | null;
  createdAt: string;
}

export interface CapitalCallShareView {
  id: string;
  ownerId: string;
  ownerKey: string;
  ownerName: string;
  shareBpsAtIssuance: number;
  shareAmountCents: number;
  status: OwnerShareStatus;
  notes: string | null;
  paidCents: number;
  payments: CapitalCallPaymentView[];
}

export interface CapitalCallView {
  id: string;
  projectId: string;
  callNumber: string;
  status: CapitalCallStatus;
  totalAmountCents: number;
  issuedDate: string | null;
  dueDate: string | null;
  notes: string | null;
  isArchived: boolean;
  createdAt: string;
  createdBy: string | null;
  shares: CapitalCallShareView[];
}

interface CallRow {
  id: string;
  project_id: string;
  call_number: string;
  status: string;
  total_amount_cents: number;
  issued_date: string | null;
  due_date: string | null;
  notes: string | null;
  is_archived: boolean;
  created_at: string;
  created_by: string | null;
}

interface ShareRow {
  id: string;
  capital_call_id: string;
  owner_id: string;
  share_bps_at_issuance: number;
  share_amount_cents: number;
  status: string;
  notes: string | null;
}

interface PaymentRow {
  id: string;
  owner_share_id: string;
  amount_cents: number;
  received_date: string;
  method: string | null;
  reference_number: string | null;
  notes: string | null;
  created_at: string;
}

interface OwnerRow {
  id: string;
  key: string;
  display_name: string;
}

// ────────────────────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────────────────────

/**
 * List capital calls for one project, newest first, with full share +
 * payment detail hydrated. Use for the Capital tab on a project page.
 *
 * Optionally filter by ownerId — only returns calls where the owner has a
 * share. Use this to enforce D-011 tier 2 (owners see only their own).
 */
export async function findCapitalCallsByProject(
  projectId: string,
  opts: { includeArchived?: boolean; ownerId?: string } = {}
): Promise<CapitalCallView[]> {
  const supabase = createSupabaseServerClient();

  // 1. Calls
  let callsQ = supabase
    .schema('atlas')
    .from('capital_calls')
    .select(
      'id, project_id, call_number, status, total_amount_cents, issued_date, due_date, notes, is_archived, created_at, created_by'
    )
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (!opts.includeArchived) callsQ = callsQ.eq('is_archived', false);

  const { data: callRows, error: callErr } = await callsQ;
  if (callErr) throw new Error(`findCapitalCallsByProject calls: ${callErr.message}`);
  const calls = (callRows as unknown as CallRow[]) ?? [];
  if (calls.length === 0) return [];

  const callIds = calls.map((c) => c.id);

  // 2. Shares for those calls
  let sharesQ = supabase
    .schema('atlas')
    .from('capital_call_owner_shares')
    .select(
      'id, capital_call_id, owner_id, share_bps_at_issuance, share_amount_cents, status, notes'
    )
    .in('capital_call_id', callIds);
  if (opts.ownerId) sharesQ = sharesQ.eq('owner_id', opts.ownerId);

  const { data: shareRows, error: shareErr } = await sharesQ;
  if (shareErr) throw new Error(`findCapitalCallsByProject shares: ${shareErr.message}`);
  const shares = (shareRows as unknown as ShareRow[]) ?? [];

  // 3. Owners (for display name + key)
  const ownerIds = Array.from(new Set(shares.map((s) => s.owner_id)));
  const { data: ownerRows, error: ownerErr } = ownerIds.length
    ? await supabase
        .schema('atlas')
        .from('owners')
        .select('id, key, display_name')
        .in('id', ownerIds)
    : { data: [], error: null };
  if (ownerErr) throw new Error(`findCapitalCallsByProject owners: ${ownerErr.message}`);
  const ownerById = new Map<string, OwnerRow>();
  for (const o of (ownerRows as unknown as OwnerRow[]) ?? []) ownerById.set(o.id, o);

  // 4. Payments for those shares
  const shareIds = shares.map((s) => s.id);
  const { data: payRows, error: payErr } = shareIds.length
    ? await supabase
        .schema('atlas')
        .from('capital_call_payments')
        .select(
          'id, owner_share_id, amount_cents, received_date, method, reference_number, notes, created_at'
        )
        .in('owner_share_id', shareIds)
        .order('received_date', { ascending: true })
    : { data: [], error: null };
  if (payErr) throw new Error(`findCapitalCallsByProject payments: ${payErr.message}`);
  const payments = (payRows as unknown as PaymentRow[]) ?? [];

  const paymentsByShare = new Map<string, PaymentRow[]>();
  for (const p of payments) {
    const list = paymentsByShare.get(p.owner_share_id) ?? [];
    list.push(p);
    paymentsByShare.set(p.owner_share_id, list);
  }

  // 5. Compose views
  const sharesByCall = new Map<string, ShareRow[]>();
  for (const s of shares) {
    const list = sharesByCall.get(s.capital_call_id) ?? [];
    list.push(s);
    sharesByCall.set(s.capital_call_id, list);
  }

  return calls
    .filter((c) => !opts.ownerId || (sharesByCall.get(c.id)?.length ?? 0) > 0)
    .map((c) => {
      const callShares = (sharesByCall.get(c.id) ?? []).map((s): CapitalCallShareView => {
        const pays = paymentsByShare.get(s.id) ?? [];
        const owner = ownerById.get(s.owner_id);
        const paidCents = pays.reduce((sum, p) => sum + p.amount_cents, 0);
        return {
          id: s.id,
          ownerId: s.owner_id,
          ownerKey: owner?.key ?? 'unknown',
          ownerName: owner?.display_name ?? 'Unknown',
          shareBpsAtIssuance: s.share_bps_at_issuance,
          shareAmountCents: s.share_amount_cents,
          status: s.status as OwnerShareStatus,
          notes: s.notes,
          paidCents,
          payments: pays.map((p) => ({
            id: p.id,
            amountCents: p.amount_cents,
            receivedDate: p.received_date,
            method: p.method,
            referenceNumber: p.reference_number,
            notes: p.notes,
            createdAt: p.created_at,
          })),
        };
      });

      return {
        id: c.id,
        projectId: c.project_id,
        callNumber: c.call_number,
        status: c.status as CapitalCallStatus,
        totalAmountCents: c.total_amount_cents,
        issuedDate: c.issued_date,
        dueDate: c.due_date,
        notes: c.notes,
        isArchived: c.is_archived,
        createdAt: c.created_at,
        createdBy: c.created_by,
        shares: callShares,
      };
    });
}

/** Fetch one capital call by id with all shares + payments. */
export async function findCapitalCallById(callId: string): Promise<CapitalCallView | null> {
  const supabase = createSupabaseServerClient();
  const { data: row, error } = await supabase
    .schema('atlas')
    .from('capital_calls')
    .select(
      'id, project_id, call_number, status, total_amount_cents, issued_date, due_date, notes, is_archived, created_at, created_by'
    )
    .eq('id', callId)
    .maybeSingle();
  if (error) throw new Error(`findCapitalCallById: ${error.message}`);
  if (!row) return null;

  // Re-use the project query to hydrate the same call; the filter on call id
  // gives us exactly one item.
  const all = await findCapitalCallsByProject((row as unknown as CallRow).project_id, {
    includeArchived: true,
  });
  return all.find((c) => c.id === callId) ?? null;
}

// ────────────────────────────────────────────────────────────────────────────
// Raw inserts — services compose these inside a transaction.
// ────────────────────────────────────────────────────────────────────────────

export interface InsertCallRow {
  projectId: string;
  callNumber: string;
  totalAmountCents: number;
  status: CapitalCallStatus;
  issuedDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  createdBy: string;
}

export interface InsertShareRow {
  capitalCallId: string;
  ownerId: string;
  shareBpsAtIssuance: number;
  shareAmountCents: number;
  status?: OwnerShareStatus;
  notes?: string | null;
}

export interface InsertPaymentRow {
  ownerShareId: string;
  amountCents: number;
  receivedDate: string;
  method?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  createdBy: string;
}

export async function insertCapitalCall(row: InsertCallRow): Promise<string> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('capital_calls')
    .insert({
      project_id: row.projectId,
      call_number: row.callNumber,
      total_amount_cents: row.totalAmountCents,
      status: row.status,
      issued_date: row.issuedDate ?? null,
      due_date: row.dueDate ?? null,
      notes: row.notes ?? null,
      created_by: row.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertCapitalCall: ${error.message}`);
  return data.id as string;
}

export async function insertCapitalCallShares(rows: InsertShareRow[]): Promise<void> {
  if (rows.length === 0) return;
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .schema('atlas')
    .from('capital_call_owner_shares')
    .insert(
      rows.map((r) => ({
        capital_call_id: r.capitalCallId,
        owner_id: r.ownerId,
        share_bps_at_issuance: r.shareBpsAtIssuance,
        share_amount_cents: r.shareAmountCents,
        status: r.status ?? 'pending',
        notes: r.notes ?? null,
      }))
    );
  if (error) throw new Error(`insertCapitalCallShares: ${error.message}`);
}

export async function insertCapitalCallPayment(row: InsertPaymentRow): Promise<string> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('capital_call_payments')
    .insert({
      owner_share_id: row.ownerShareId,
      amount_cents: row.amountCents,
      received_date: row.receivedDate,
      method: row.method ?? null,
      reference_number: row.referenceNumber ?? null,
      notes: row.notes ?? null,
      created_by: row.createdBy,
    })
    .select('id')
    .single();
  if (error) throw new Error(`insertCapitalCallPayment: ${error.message}`);
  return data.id as string;
}

export async function updateCapitalCallStatus(
  callId: string,
  status: CapitalCallStatus
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .schema('atlas')
    .from('capital_calls')
    .update({ status })
    .eq('id', callId);
  if (error) throw new Error(`updateCapitalCallStatus: ${error.message}`);
}

export async function updateOwnerShareStatus(
  shareId: string,
  status: OwnerShareStatus,
  notes?: string | null
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const patch: Record<string, unknown> = { status };
  if (notes !== undefined) patch.notes = notes;
  const { error } = await supabase
    .schema('atlas')
    .from('capital_call_owner_shares')
    .update(patch)
    .eq('id', shareId);
  if (error) throw new Error(`updateOwnerShareStatus: ${error.message}`);
}

export async function archiveCapitalCall(callId: string): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .schema('atlas')
    .from('capital_calls')
    .update({ is_archived: true, status: 'cancelled' })
    .eq('id', callId);
  if (error) throw new Error(`archiveCapitalCall: ${error.message}`);
}

/**
 * Generate the next CC-YYYY-NNN call number for the given year. Uses a
 * read-then-write pattern; the call_number unique index catches the rare
 * race where two issuers grab the same number simultaneously.
 */
export async function nextCallNumberForYear(year: number): Promise<string> {
  const supabase = createSupabaseServerClient();
  const prefix = `CC-${year}-`;
  const { data, error } = await supabase
    .schema('atlas')
    .from('capital_calls')
    .select('call_number')
    .like('call_number', `${prefix}%`)
    .order('call_number', { ascending: false })
    .limit(1);
  if (error) throw new Error(`nextCallNumberForYear: ${error.message}`);
  const rows = (data as Array<{ call_number: string }> | null) ?? [];
  if (rows.length === 0) return `${prefix}001`;
  const last = rows[0]!.call_number;
  const seq = Number.parseInt(last.slice(prefix.length), 10);
  const next = Number.isFinite(seq) ? seq + 1 : 1;
  return `${prefix}${String(next).padStart(3, '0')}`;
}
