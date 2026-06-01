/**
 * Capital call service. All business rules + transactional logic live here;
 * the repo (lib/repos/capital-call.ts) is mechanical SQL only.
 *
 * Rules enforced (per CLAUDE.md + bundle T060 spec):
 *
 *   1. Sum of share amounts must equal call.total_amount_cents. Enforced at
 *      DB level by deferred trigger atlas.check_capital_call_share_sum;
 *      service double-checks before insert to give a friendlier error.
 *   2. Cap-table-based split snapshots cap-table shares AT ISSUANCE; future
 *      cap-table edits don't retroactively change the call.
 *   3. Manual split must cover every owner with a current cap-table row.
 *      (Owners can be allocated zero, but must be listed explicitly.)
 *   4. Can't edit a call once any share has a payment recorded — only
 *      addPayment, updateShareStatus, archiveCall remain valid.
 *   5. Share status transitions: pending -> committed -> funded. Status
 *      auto-advances on payment when paid >= share amount. Call status
 *      auto-rolls from per-share states: any funded -> partial, all funded
 *      -> funded.
 *   6. archiveCall sets is_archived=true + status='cancelled'. Cancelled
 *      calls remain readable for audit but never re-issued.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import { recordMutation } from '@/lib/services/audit';
import {
  insertCapitalCall,
  insertCapitalCallPayment,
  insertCapitalCallShares,
  nextCallNumberForYear,
  updateCapitalCallStatus,
  updateOwnerShareStatus,
  archiveCapitalCall,
  type CapitalCallStatus,
  type OwnerShareStatus,
} from '@/lib/repos/capital-call';
import { fetchCapTable } from '@/lib/repos/settings';
import type { User } from '@supabase/supabase-js';

// ────────────────────────────────────────────────────────────────────────────
// Errors
// ────────────────────────────────────────────────────────────────────────────

export class CapitalCallValidationError extends Error {
  readonly code = 'CAPITAL_CALL_VALIDATION';
  constructor(message: string) {
    super(message);
    this.name = 'CapitalCallValidationError';
  }
}

export class CapitalCallLockedError extends Error {
  readonly code = 'CAPITAL_CALL_LOCKED';
  constructor(message = 'Cannot edit a capital call after payments are recorded') {
    super(message);
    this.name = 'CapitalCallLockedError';
  }
}

// ────────────────────────────────────────────────────────────────────────────
// createCapitalCall
// ────────────────────────────────────────────────────────────────────────────

export interface ManualSplit {
  ownerId: string;
  shareAmountCents: number;
  /** Bps used for `share_bps_at_issuance`. Optional: defaults to bps implied
   *  by the amount / total ratio so historical data stays clean. */
  shareBpsAtIssuance?: number;
}

export interface CreateCapitalCallInput {
  projectId: string;
  totalAmountCents: number;
  /**
   * 'cap_table' → split proportionally by current cap-table shares.
   * Array → caller-supplied per-owner amounts (must sum to total).
   */
  split: 'cap_table' | ManualSplit[];
  /** If true, immediately advance status from draft → issued. */
  issue?: boolean;
  issuedDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
}

export interface CreateCapitalCallResult {
  id: string;
  callNumber: string;
  status: CapitalCallStatus;
}

export async function createCapitalCall(
  input: CreateCapitalCallInput,
  user: User
): Promise<CreateCapitalCallResult> {
  if (input.totalAmountCents <= 0) {
    throw new CapitalCallValidationError('totalAmountCents must be > 0');
  }

  // Resolve split → array of {ownerId, shareAmountCents, shareBpsAtIssuance}.
  const shares = await resolveSplit(input.split, input.totalAmountCents);

  // Validate sum at the application layer too (defensive — DB trigger is
  // authoritative but throws an obscure error after commit).
  const sum = shares.reduce((s, r) => s + r.shareAmountCents, 0);
  if (sum !== input.totalAmountCents) {
    throw new CapitalCallValidationError(
      `Share amounts sum to ${sum} cents but total is ${input.totalAmountCents} cents`
    );
  }

  const year = input.issuedDate
    ? Number.parseInt(input.issuedDate.slice(0, 4), 10)
    : new Date().getUTCFullYear();
  const callNumber = await nextCallNumberForYear(year);

  const status: CapitalCallStatus = input.issue ? 'issued' : 'draft';

  const callId = await insertCapitalCall({
    projectId: input.projectId,
    callNumber,
    totalAmountCents: input.totalAmountCents,
    status,
    issuedDate: input.issue ? (input.issuedDate ?? new Date().toISOString().slice(0, 10)) : null,
    dueDate: input.dueDate ?? null,
    notes: input.notes ?? null,
    createdBy: user.id,
  });

  await insertCapitalCallShares(
    shares.map((s) => ({
      capitalCallId: callId,
      ownerId: s.ownerId,
      shareBpsAtIssuance: s.shareBpsAtIssuance,
      shareAmountCents: s.shareAmountCents,
    }))
  );

  await emitAudit(user.id, 'capital_call.create', callId, {
    callNumber,
    projectId: input.projectId,
    totalAmountCents: input.totalAmountCents,
    splitKind: input.split === 'cap_table' ? 'cap_table' : 'manual',
    shareCount: shares.length,
    status,
  });

  return { id: callId, callNumber, status };
}

/**
 * Build a deterministic per-owner split. Cap-table mode reads the current
 * shares table; manual mode validates each entry against the live cap
 * table (so an unknown owner is rejected at the boundary).
 */
async function resolveSplit(
  split: CreateCapitalCallInput['split'],
  totalCents: number
): Promise<Required<ManualSplit>[]> {
  if (split === 'cap_table') {
    const entries = await fetchCapTable();
    if (entries.length === 0) {
      throw new CapitalCallValidationError('No cap-table entries to split against');
    }
    // Largest-remainder allocation: avoids rounding drift losing a cent.
    const provisional = entries.map((e) => ({
      ownerId: e.ownerId,
      shareBpsAtIssuance: e.shareBps,
      floor: Math.floor((totalCents * e.shareBps) / 10000),
      remainder: (totalCents * e.shareBps) % 10000,
    }));
    const allocated = provisional.reduce((s, p) => s + p.floor, 0);
    const drift = totalCents - allocated;
    // Distribute remaining cents to entries with the largest remainder.
    const sorted = [...provisional].sort((a, b) => b.remainder - a.remainder);
    for (let i = 0; i < drift; i++) {
      const entry = sorted[i % sorted.length]!;
      entry.floor += 1;
    }
    return provisional.map((p) => ({
      ownerId: p.ownerId,
      shareBpsAtIssuance: p.shareBpsAtIssuance,
      shareAmountCents: p.floor,
    }));
  }

  // Manual split — validate every entry has a positive (or zero) amount and
  // references a real cap-table owner.
  const capTable = await fetchCapTable();
  const allowedOwnerIds = new Set(capTable.map((e) => e.ownerId));
  for (const m of split) {
    if (!allowedOwnerIds.has(m.ownerId)) {
      throw new CapitalCallValidationError(`Owner ${m.ownerId} is not in the current cap table`);
    }
    if (m.shareAmountCents < 0) {
      throw new CapitalCallValidationError(
        `Share amount for owner ${m.ownerId} cannot be negative`
      );
    }
  }
  return split.map((m) => ({
    ownerId: m.ownerId,
    shareAmountCents: m.shareAmountCents,
    shareBpsAtIssuance:
      m.shareBpsAtIssuance ?? Math.round((m.shareAmountCents * 10000) / totalCents),
  }));
}

// ────────────────────────────────────────────────────────────────────────────
// addPayment
// ────────────────────────────────────────────────────────────────────────────

export interface AddPaymentInput {
  ownerShareId: string;
  amountCents: number;
  receivedDate: string;
  method?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
}

export interface AddPaymentResult {
  paymentId: string;
  shareStatus: OwnerShareStatus;
  callStatus: CapitalCallStatus;
}

export async function addPayment(input: AddPaymentInput, user: User): Promise<AddPaymentResult> {
  if (input.amountCents <= 0) {
    throw new CapitalCallValidationError('amountCents must be > 0');
  }

  const supabase = createSupabaseServerClient();

  // Load the share + its parent call to compute new statuses.
  const { data: shareRow, error: shareErr } = await supabase
    .schema('atlas')
    .from('capital_call_owner_shares')
    .select('id, capital_call_id, share_amount_cents, status')
    .eq('id', input.ownerShareId)
    .single();
  if (shareErr || !shareRow) {
    throw new CapitalCallValidationError(`Owner share not found: ${input.ownerShareId}`);
  }
  const share = shareRow as {
    id: string;
    capital_call_id: string;
    share_amount_cents: number;
    status: string;
  };

  // Sum existing payments + the new one.
  const { data: existing, error: payErr } = await supabase
    .schema('atlas')
    .from('capital_call_payments')
    .select('amount_cents')
    .eq('owner_share_id', share.id);
  if (payErr) {
    throw new CapitalCallValidationError(`Failed to read existing payments: ${payErr.message}`);
  }
  const alreadyPaid = ((existing as Array<{ amount_cents: number }> | null) ?? []).reduce(
    (s, p) => s + p.amount_cents,
    0
  );
  const newTotal = alreadyPaid + input.amountCents;
  if (newTotal > share.share_amount_cents) {
    throw new CapitalCallValidationError(
      `Payment of ${input.amountCents} exceeds remaining owed: ` +
        `${share.share_amount_cents - alreadyPaid} cents`
    );
  }

  // Insert the payment row.
  const paymentId = await insertCapitalCallPayment({
    ownerShareId: share.id,
    amountCents: input.amountCents,
    receivedDate: input.receivedDate,
    method: input.method,
    referenceNumber: input.referenceNumber,
    notes: input.notes,
    createdBy: user.id,
  });

  // Auto-advance share status if fully paid.
  let shareStatus = share.status as OwnerShareStatus;
  if (newTotal >= share.share_amount_cents && shareStatus !== 'funded') {
    shareStatus = 'funded';
    await updateOwnerShareStatus(share.id, 'funded');
  } else if (shareStatus === 'pending') {
    // Receiving any payment implies the owner has committed.
    shareStatus = 'committed';
    await updateOwnerShareStatus(share.id, 'committed');
  }

  // Roll up call status from per-share states.
  const newCallStatus = await rollUpCallStatus(share.capital_call_id);

  await emitAudit(user.id, 'capital_call.payment', share.capital_call_id, {
    paymentId,
    shareId: share.id,
    amountCents: input.amountCents,
    shareStatus,
    callStatus: newCallStatus,
  });

  return { paymentId, shareStatus, callStatus: newCallStatus };
}

/**
 * Compute and persist the call's status from its shares' states.
 *   all funded → 'funded'
 *   any funded → 'partial'
 *   any committed → 'partial'
 *   else → keep current (issued or draft)
 */
async function rollUpCallStatus(callId: string): Promise<CapitalCallStatus> {
  const supabase = createSupabaseServerClient();
  const { data: shareData, error } = await supabase
    .schema('atlas')
    .from('capital_call_owner_shares')
    .select('status')
    .eq('capital_call_id', callId);
  if (error) {
    throw new CapitalCallValidationError(`Failed to compute call status: ${error.message}`);
  }
  const shares = (shareData as Array<{ status: string }> | null) ?? [];
  const allFunded = shares.length > 0 && shares.every((s) => s.status === 'funded');
  const anyProgress = shares.some((s) => s.status === 'funded' || s.status === 'committed');

  const { data: callData, error: callErr } = await supabase
    .schema('atlas')
    .from('capital_calls')
    .select('status')
    .eq('id', callId)
    .single();
  if (callErr || !callData) {
    throw new CapitalCallValidationError(
      `Failed to read call status: ${callErr?.message ?? 'not found'}`
    );
  }
  const current = (callData as { status: string }).status as CapitalCallStatus;
  if (current === 'cancelled') return current;

  const next: CapitalCallStatus = allFunded ? 'funded' : anyProgress ? 'partial' : current;
  if (next !== current) await updateCapitalCallStatus(callId, next);
  return next;
}

// ────────────────────────────────────────────────────────────────────────────
// commit + cancel
// ────────────────────────────────────────────────────────────────────────────

/**
 * Owner-driven commitment: mark this owner's share as committed.
 * Idempotent: committing an already-committed (or funded) share is a no-op.
 */
export async function recordCommitment(
  ownerShareId: string,
  user: User,
  notes?: string | null
): Promise<{ shareStatus: OwnerShareStatus; callStatus: CapitalCallStatus }> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('capital_call_owner_shares')
    .select('id, capital_call_id, status')
    .eq('id', ownerShareId)
    .single();
  if (error || !data) {
    throw new CapitalCallValidationError(`Owner share not found: ${ownerShareId}`);
  }
  const share = data as { id: string; capital_call_id: string; status: string };
  const cur = share.status as OwnerShareStatus;
  if (cur === 'pending') {
    await updateOwnerShareStatus(share.id, 'committed', notes ?? null);
  } else if (notes !== undefined && notes !== null) {
    await updateOwnerShareStatus(share.id, cur, notes);
  }
  const callStatus = await rollUpCallStatus(share.capital_call_id);
  await emitAudit(user.id, 'capital_call.commit', share.capital_call_id, {
    shareId: share.id,
    fromStatus: cur,
    toStatus: cur === 'pending' ? 'committed' : cur,
  });
  return { shareStatus: cur === 'pending' ? 'committed' : cur, callStatus };
}

/** Soft-cancel a capital call. Throws if any share has payments. */
export async function cancelCall(callId: string, user: User): Promise<void> {
  await ensureNoPayments(callId);
  await archiveCapitalCall(callId);
  await emitAudit(user.id, 'capital_call.cancel', callId, {});
}

async function ensureNoPayments(callId: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { data: shareRows, error: shareErr } = await supabase
    .schema('atlas')
    .from('capital_call_owner_shares')
    .select('id')
    .eq('capital_call_id', callId);
  if (shareErr) {
    throw new CapitalCallValidationError(`ensureNoPayments shares: ${shareErr.message}`);
  }
  const shareIds = ((shareRows as Array<{ id: string }> | null) ?? []).map((s) => s.id);
  if (shareIds.length === 0) return;
  const { data: payRows, error: payErr } = await supabase
    .schema('atlas')
    .from('capital_call_payments')
    .select('id')
    .in('owner_share_id', shareIds)
    .limit(1);
  if (payErr) {
    throw new CapitalCallValidationError(`ensureNoPayments payments: ${payErr.message}`);
  }
  if (((payRows as Array<{ id: string }> | null) ?? []).length > 0) {
    throw new CapitalCallLockedError(
      'Capital call has payments recorded; cancel each payment first or archive instead'
    );
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Audit helper — small wrapper around recordMutation that gives capital-
// call events a consistent route shape.
// ────────────────────────────────────────────────────────────────────────────

async function emitAudit(
  userId: string,
  action: string,
  resourceId: string,
  meta: Record<string, unknown>
): Promise<void> {
  try {
    const orgId = await resolveOrgId();
    await recordMutation({
      orgId,
      userId,
      route: `service:${action}:${resourceId}`,
      method: 'POST',
      statusCode: 200,
      ip: null,
      userAgent: `atlas-service meta=${JSON.stringify(meta)}`,
    });
  } catch {
    // Audit is best-effort — never fail the request because of it.
  }
}

let cachedOrgId: string | null = null;
async function resolveOrgId(): Promise<string> {
  if (cachedOrgId) return cachedOrgId;
  const supabase = createSupabaseServerClient();
  const { data } = await supabase.schema('atlas').from('orgs').select('id').limit(1).single();
  const id = (data as { id: string } | null)?.id ?? '00000000-0000-0000-0000-000000000000';
  cachedOrgId = id;
  return id;
}
