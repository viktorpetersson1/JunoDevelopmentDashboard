/**
 * Comps repo — global library of comparable properties.
 *
 * Writes:
 *   - createComp:  manual entry (status='closed' OR 'active'/'pending').
 *   - bulkCreateComps: CSV import path (no per-row audit, single batch insert).
 *   - updateComp:  edit a draft comp before its first run-snapshot.
 *   - archiveComp: hide from library; existing pricing_run_comparables
 *     snapshots are unaffected (those are immutable).
 *
 * Reads:
 *   - findCompById
 *   - listComps           — library view, filterable + paginated
 *   - findCompsInWindow   — pricing engine: closed comps in [start,end]
 *                            for one or more sub_cut_keys
 *   - findActiveComps     — active/pending comps for a sub_cut (ceiling)
 *
 * Uniqueness:
 *   - DB enforces partial unique indexes (see comps.ts schema). Repo
 *     surfaces a `CompDuplicateError` for friendly messaging.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  CompStatus,
  CompWaterfrontType,
  CompSource,
} from '@/lib/db/schema/comps';

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export interface CompView {
  id: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  subCutKey: string;
  waterfrontType: CompWaterfrontType | null;
  isNc: boolean;
  status: CompStatus;
  closingDate: string | null; // YYYY-MM-DD
  salePriceCents: number | null;
  agSqft: number;
  lotSizeAcres: number | null;
  yearBuilt: number | null;
  broker: string | null;
  sourceUrl: string | null;
  source: CompSource;
  notes: string | null;
  isArchived: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  /** Derived: sale_price / sqft (USD per sqft, NOT cents). Null when
   * status != 'closed' or any input is missing. */
  psf: number | null;
}

interface CompRow {
  id: string;
  address: string;
  latitude: string | number | null;
  longitude: string | number | null;
  sub_cut_key: string;
  waterfront_type: CompWaterfrontType | null;
  is_nc: boolean;
  status: CompStatus;
  closing_date: string | null;
  sale_price_cents: number | null;
  ag_sqft: number;
  lot_size_acres: string | number | null;
  year_built: number | null;
  broker: string | null;
  source_url: string | null;
  source: CompSource;
  notes: string | null;
  is_archived: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  'id, address, latitude, longitude, sub_cut_key, waterfront_type, is_nc, status, closing_date, sale_price_cents, ag_sqft, lot_size_acres, year_built, broker, source_url, source, notes, is_archived, created_by, created_at, updated_at';

function num(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number.parseFloat(v) : v;
  return Number.isFinite(n) ? n : null;
}

function computePsf(salePriceCents: number | null, agSqft: number, status: CompStatus): number | null {
  if (status !== 'closed') return null;
  if (!salePriceCents || !agSqft) return null;
  return salePriceCents / 100 / agSqft;
}

function toView(row: CompRow): CompView {
  return {
    id: row.id,
    address: row.address,
    latitude: num(row.latitude),
    longitude: num(row.longitude),
    subCutKey: row.sub_cut_key,
    waterfrontType: row.waterfront_type,
    isNc: row.is_nc,
    status: row.status,
    closingDate: row.closing_date,
    salePriceCents: row.sale_price_cents,
    agSqft: row.ag_sqft,
    lotSizeAcres: num(row.lot_size_acres),
    yearBuilt: row.year_built,
    broker: row.broker,
    sourceUrl: row.source_url,
    source: row.source,
    notes: row.notes,
    isArchived: row.is_archived,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    psf: computePsf(row.sale_price_cents, row.ag_sqft, row.status),
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Errors
// ────────────────────────────────────────────────────────────────────────────

export class CompDuplicateError extends Error {
  readonly code = 'COMP_DUPLICATE';
  constructor(message: string) {
    super(message);
    this.name = 'CompDuplicateError';
  }
}

export class CompValidationError extends Error {
  readonly code = 'COMP_VALIDATION';
  constructor(message: string) {
    super(message);
    this.name = 'CompValidationError';
  }
}

function classifyError(e: { code?: string; message?: string }): Error {
  // Postgres unique violation code is 23505; supabase-js surfaces as PostgrestError.
  if (e.code === '23505') {
    return new CompDuplicateError(
      'A comp with this address (and closing_date for closed sales) already exists.'
    );
  }
  return new Error(e.message ?? 'unknown comp repo error');
}

// ────────────────────────────────────────────────────────────────────────────
// Writes
// ────────────────────────────────────────────────────────────────────────────

export interface NewCompInput {
  address: string;
  latitude?: number | null;
  longitude?: number | null;
  subCutKey: string;
  waterfrontType?: CompWaterfrontType | null;
  isNc: boolean;
  status: CompStatus;
  closingDate?: string | null;
  salePriceCents?: number | null;
  agSqft: number;
  lotSizeAcres?: number | null;
  yearBuilt?: number | null;
  broker?: string | null;
  sourceUrl?: string | null;
  source?: CompSource;
  notes?: string | null;
  createdBy?: string | null;
}

function validateNewComp(input: NewCompInput): void {
  if (!input.address?.trim()) throw new CompValidationError('address is required');
  if (!input.subCutKey?.trim()) throw new CompValidationError('subCutKey is required');
  if (!input.agSqft || input.agSqft <= 0) {
    throw new CompValidationError('agSqft must be > 0');
  }
  if (input.status === 'closed') {
    if (!input.closingDate) {
      throw new CompValidationError('closingDate is required for closed comps');
    }
    if (!input.salePriceCents || input.salePriceCents <= 0) {
      throw new CompValidationError('salePriceCents > 0 is required for closed comps');
    }
  }
}

export async function createComp(input: NewCompInput): Promise<CompView> {
  validateNewComp(input);
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('comps')
    .insert({
      address: input.address.trim(),
      latitude: input.latitude ?? null,
      longitude: input.longitude ?? null,
      sub_cut_key: input.subCutKey,
      waterfront_type: input.waterfrontType ?? null,
      is_nc: input.isNc,
      status: input.status,
      closing_date: input.closingDate ?? null,
      sale_price_cents: input.salePriceCents ?? null,
      ag_sqft: input.agSqft,
      lot_size_acres: input.lotSizeAcres ?? null,
      year_built: input.yearBuilt ?? null,
      broker: input.broker ?? null,
      source_url: input.sourceUrl ?? null,
      source: input.source ?? 'manual',
      notes: input.notes ?? null,
      created_by: input.createdBy ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw classifyError(error);
  return toView(data as unknown as CompRow);
}

/**
 * Batch insert. Validates every row first, then inserts in a single call.
 * If ANY row violates a unique constraint, the whole batch fails — callers
 * (CSV importer) get a single CompDuplicateError and should de-dupe upstream.
 */
export async function bulkCreateComps(inputs: NewCompInput[]): Promise<CompView[]> {
  if (inputs.length === 0) return [];
  inputs.forEach(validateNewComp);
  const supabase = createSupabaseServerClient();
  const rows = inputs.map((input) => ({
    address: input.address.trim(),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    sub_cut_key: input.subCutKey,
    waterfront_type: input.waterfrontType ?? null,
    is_nc: input.isNc,
    status: input.status,
    closing_date: input.closingDate ?? null,
    sale_price_cents: input.salePriceCents ?? null,
    ag_sqft: input.agSqft,
    lot_size_acres: input.lotSizeAcres ?? null,
    year_built: input.yearBuilt ?? null,
    broker: input.broker ?? null,
    source_url: input.sourceUrl ?? null,
    source: input.source ?? 'csv',
    notes: input.notes ?? null,
    created_by: input.createdBy ?? null,
  }));
  const { data, error } = await supabase
    .schema('atlas')
    .from('comps')
    .insert(rows)
    .select(SELECT_COLUMNS);
  if (error) throw classifyError(error);
  return ((data as unknown as CompRow[]) ?? []).map(toView);
}

export interface UpdateCompInput {
  // Identity changes are NOT allowed via update — to fix a typo'd address,
  // archive and re-create. This avoids breaking pricing_run_comparable
  // snapshot integrity (FKs are set null on delete, but provenance matters).
  subCutKey?: string;
  waterfrontType?: CompWaterfrontType | null;
  isNc?: boolean;
  status?: CompStatus;
  closingDate?: string | null;
  salePriceCents?: number | null;
  agSqft?: number;
  lotSizeAcres?: number | null;
  yearBuilt?: number | null;
  broker?: string | null;
  sourceUrl?: string | null;
  notes?: string | null;
}

export async function updateComp(id: string, patch: UpdateCompInput): Promise<CompView> {
  const supabase = createSupabaseServerClient();
  const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.subCutKey !== undefined) update.sub_cut_key = patch.subCutKey;
  if (patch.waterfrontType !== undefined) update.waterfront_type = patch.waterfrontType;
  if (patch.isNc !== undefined) update.is_nc = patch.isNc;
  if (patch.status !== undefined) update.status = patch.status;
  if (patch.closingDate !== undefined) update.closing_date = patch.closingDate;
  if (patch.salePriceCents !== undefined) update.sale_price_cents = patch.salePriceCents;
  if (patch.agSqft !== undefined) update.ag_sqft = patch.agSqft;
  if (patch.lotSizeAcres !== undefined) update.lot_size_acres = patch.lotSizeAcres;
  if (patch.yearBuilt !== undefined) update.year_built = patch.yearBuilt;
  if (patch.broker !== undefined) update.broker = patch.broker;
  if (patch.sourceUrl !== undefined) update.source_url = patch.sourceUrl;
  if (patch.notes !== undefined) update.notes = patch.notes;
  const { data, error } = await supabase
    .schema('atlas')
    .from('comps')
    .update(update)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw classifyError(error);
  return toView(data as unknown as CompRow);
}

export async function archiveComp(id: string): Promise<void> {
  const supabase = createSupabaseServerClient();
  const { error } = await supabase
    .schema('atlas')
    .from('comps')
    .update({ is_archived: true, updated_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw new Error(`archiveComp: ${error.message}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Reads
// ────────────────────────────────────────────────────────────────────────────

export async function findCompById(id: string): Promise<CompView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('comps')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`findCompById: ${error.message}`);
  return data ? toView(data as unknown as CompRow) : null;
}

export interface ListCompsFilter {
  subCutKey?: string;
  status?: CompStatus | 'any';
  isNc?: boolean;
  includeArchived?: boolean;
  limit?: number;
  offset?: number;
}

export async function listComps(filter: ListCompsFilter = {}): Promise<CompView[]> {
  const supabase = createSupabaseServerClient();
  let q = supabase
    .schema('atlas')
    .from('comps')
    .select(SELECT_COLUMNS)
    .order('closing_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (!filter.includeArchived) q = q.eq('is_archived', false);
  if (filter.subCutKey) q = q.eq('sub_cut_key', filter.subCutKey);
  if (filter.status && filter.status !== 'any') q = q.eq('status', filter.status);
  if (filter.isNc !== undefined) q = q.eq('is_nc', filter.isNc);
  if (filter.limit) q = q.limit(filter.limit);
  if (filter.offset)
    q = q.range(
      filter.offset,
      filter.offset + (filter.limit ?? 50) - 1
    );
  const { data, error } = await q;
  if (error) throw new Error(`listComps: ${error.message}`);
  return ((data as unknown as CompRow[]) ?? []).map(toView);
}

/**
 * Pricing engine path: closed comps inside the bracket window for one or
 * more sub-cut keys. Used to assemble the candidate pool before the engine
 * picks anchors.
 */
export async function findClosedCompsInWindow(
  subCutKeys: string[],
  windowStart: string,
  windowEnd: string
): Promise<CompView[]> {
  if (subCutKeys.length === 0) return [];
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('comps')
    .select(SELECT_COLUMNS)
    .eq('status', 'closed')
    .eq('is_archived', false)
    .in('sub_cut_key', subCutKeys)
    .gte('closing_date', windowStart)
    .lte('closing_date', windowEnd)
    .order('closing_date', { ascending: false });
  if (error) throw new Error(`findClosedCompsInWindow: ${error.message}`);
  return ((data as unknown as CompRow[]) ?? []).map(toView);
}

/**
 * Live ceiling comps — active/pending listings inside the relevant sub-cuts.
 * No window filter (active listings are unbracketed by definition).
 */
export async function findActiveCompsForSubCuts(subCutKeys: string[]): Promise<CompView[]> {
  if (subCutKeys.length === 0) return [];
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('comps')
    .select(SELECT_COLUMNS)
    .in('status', ['active', 'pending'])
    .eq('is_archived', false)
    .in('sub_cut_key', subCutKeys)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`findActiveCompsForSubCuts: ${error.message}`);
  return ((data as unknown as CompRow[]) ?? []).map(toView);
}

/** Quick library count for the global /pricing/comps header chip. */
export async function countComps(includeArchived = false): Promise<number> {
  const supabase = createSupabaseServerClient();
  let q = supabase
    .schema('atlas')
    .from('comps')
    .select('id', { count: 'exact', head: true });
  if (!includeArchived) q = q.eq('is_archived', false);
  const { count, error } = await q;
  if (error) throw new Error(`countComps: ${error.message}`);
  return count ?? 0;
}
