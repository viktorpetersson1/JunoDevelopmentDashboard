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
  /** Days on market (listing → contract/closing). Null when unknown. */
  domDays: number | null;
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
  dom_days: number | null;
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
  'id, address, latitude, longitude, sub_cut_key, waterfront_type, is_nc, status, closing_date, sale_price_cents, ag_sqft, lot_size_acres, year_built, dom_days, broker, source_url, source, notes, is_archived, created_by, created_at, updated_at';

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
    domDays: row.dom_days,
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
  domDays?: number | null;
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
      dom_days: input.domDays ?? null,
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

// ────────────────────────────────────────────────────────────────────────────
// D-026 — Auto-save AI-researched comps (called by strategy brief + quick price)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Insert each comp individually; swallow unique-violation errors so duplicates
 * don't fail the batch. Returns counts so the caller can surface telemetry.
 *
 * Use case: when a brief / quick-price runs, every comp Claude found gets
 * persisted to atlas.comps with source='ai_research'. The partial unique
 * indexes (address+closing_date for closed, address for active) prevent
 * duplicate entries on subsequent runs.
 */
export async function bulkUpsertCompsIgnoreDupes(
  inputs: NewCompInput[]
): Promise<{ inserted: number; skipped: number }> {
  if (inputs.length === 0) return { inserted: 0, skipped: 0 };
  let inserted = 0;
  let skipped = 0;
  for (const input of inputs) {
    try {
      validateNewComp(input);
      await createComp(input);
      inserted++;
    } catch (e) {
      // Unique-violation = duplicate. Anything else we suppress here too — the
      // dashboard would rather be a few rows lighter than fail end-to-end on
      // a malformed AI comp.
      if (e instanceof CompDuplicateError) skipped++;
      else skipped++;
    }
  }
  return { inserted, skipped };
}

// ────────────────────────────────────────────────────────────────────────────
// D-026 — Pricing dashboard aggregations
// ────────────────────────────────────────────────────────────────────────────

export interface MarketKpis {
  windowDays: number;
  avgPsfUsd: number | null;
  medianDomDays: number | null;
  closedCount: number;
  activeCount: number;
  /** Same KPIs for the same-length window ending one year earlier. */
  prior: {
    avgPsfUsd: number | null;
    medianDomDays: number | null;
    closedCount: number;
  };
}

function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid] ?? null;
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
}

function avg(nums: number[]): number | null {
  if (nums.length === 0) return null;
  return nums.reduce((s, n) => s + n, 0) / nums.length;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function compToPsf(row: CompRow): number | null {
  if (row.status !== 'closed') return null;
  if (!row.sale_price_cents || !row.ag_sqft) return null;
  return row.sale_price_cents / 100 / row.ag_sqft;
}

export async function getMarketKpis(windowDays = 90): Promise<MarketKpis> {
  const supabase = createSupabaseServerClient();
  const start = daysAgo(windowDays);
  const priorStart = daysAgo(windowDays + 365);
  const priorEnd = daysAgo(365);

  // Current window: closed
  const closedQ = supabase
    .schema('atlas')
    .from('comps')
    .select('sale_price_cents, ag_sqft, dom_days, status, closing_date')
    .eq('is_archived', false)
    .eq('status', 'closed')
    .gte('closing_date', start);
  // Current window: active count
  const activeQ = supabase
    .schema('atlas')
    .from('comps')
    .select('id', { count: 'exact', head: true })
    .eq('is_archived', false)
    .in('status', ['active', 'pending']);
  // Prior window: closed only
  const priorClosedQ = supabase
    .schema('atlas')
    .from('comps')
    .select('sale_price_cents, ag_sqft, dom_days, status, closing_date')
    .eq('is_archived', false)
    .eq('status', 'closed')
    .gte('closing_date', priorStart)
    .lt('closing_date', priorEnd);

  const [closedRes, activeRes, priorRes] = await Promise.all([closedQ, activeQ, priorClosedQ]);

  if (closedRes.error) throw new Error(`getMarketKpis closed: ${closedRes.error.message}`);
  if (activeRes.error) throw new Error(`getMarketKpis active: ${activeRes.error.message}`);
  if (priorRes.error) throw new Error(`getMarketKpis prior: ${priorRes.error.message}`);

  const closedRows = (closedRes.data ?? []) as unknown as CompRow[];
  const priorRows = (priorRes.data ?? []) as unknown as CompRow[];

  const closedPsfs = closedRows
    .map(compToPsf)
    .filter((n): n is number => n != null && n > 0);
  const closedDoms = closedRows
    .map((r) => r.dom_days)
    .filter((n): n is number => n != null && n >= 0);

  const priorPsfs = priorRows
    .map(compToPsf)
    .filter((n): n is number => n != null && n > 0);
  const priorDoms = priorRows
    .map((r) => r.dom_days)
    .filter((n): n is number => n != null && n >= 0);

  return {
    windowDays,
    avgPsfUsd: closedPsfs.length > 0 ? Math.round(avg(closedPsfs) ?? 0) : null,
    medianDomDays: closedDoms.length > 0 ? Math.round(median(closedDoms) ?? 0) : null,
    closedCount: closedRows.length,
    activeCount: activeRes.count ?? 0,
    prior: {
      avgPsfUsd: priorPsfs.length > 0 ? Math.round(avg(priorPsfs) ?? 0) : null,
      medianDomDays: priorDoms.length > 0 ? Math.round(median(priorDoms) ?? 0) : null,
      closedCount: priorRows.length,
    },
  };
}

export interface SubCutPsf {
  subCutKey: string;
  medianPsfUsd: number | null;
  closedCount: number;
  medianDomDays: number | null;
}

export async function getPsfBySubCut(windowDays = 90): Promise<SubCutPsf[]> {
  const supabase = createSupabaseServerClient();
  const start = daysAgo(windowDays);
  const { data, error } = await supabase
    .schema('atlas')
    .from('comps')
    .select('sale_price_cents, ag_sqft, dom_days, sub_cut_key, status, closing_date')
    .eq('is_archived', false)
    .eq('status', 'closed')
    .gte('closing_date', start);
  if (error) throw new Error(`getPsfBySubCut: ${error.message}`);

  const rows = (data ?? []) as unknown as CompRow[];
  const bySubCut = new Map<string, { psfs: number[]; doms: number[] }>();
  for (const r of rows) {
    const psf = compToPsf(r);
    if (psf == null || psf <= 0) continue;
    const bucket = bySubCut.get(r.sub_cut_key) ?? { psfs: [], doms: [] };
    bucket.psfs.push(psf);
    if (r.dom_days != null && r.dom_days >= 0) bucket.doms.push(r.dom_days);
    bySubCut.set(r.sub_cut_key, bucket);
  }
  return Array.from(bySubCut.entries())
    .map(([subCutKey, { psfs, doms }]) => ({
      subCutKey,
      medianPsfUsd: Math.round(median(psfs) ?? 0),
      closedCount: psfs.length,
      medianDomDays: doms.length > 0 ? Math.round(median(doms) ?? 0) : null,
    }))
    .sort((a, b) => (b.medianPsfUsd ?? 0) - (a.medianPsfUsd ?? 0));
}

/**
 * D-026 (refresh): one-shot fetch for the /pricing dashboard. Returns raw
 * comps for the current window + the same window one year prior + active
 * listings, so a single Client Component can compute filtered KPIs / chart /
 * feed without per-filter round-trips.
 */
export interface DashboardComps {
  windowDays: number;
  closedInWindow: CompView[];
  priorClosedInWindow: CompView[];
  activeAll: CompView[];
}

export async function getCompsForDashboard(
  windowDays = 90
): Promise<DashboardComps> {
  const supabase = createSupabaseServerClient();
  const start = daysAgo(windowDays);
  const priorStart = daysAgo(windowDays + 365);
  const priorEnd = daysAgo(365);

  const closedQ = supabase
    .schema('atlas')
    .from('comps')
    .select(SELECT_COLUMNS)
    .eq('is_archived', false)
    .eq('status', 'closed')
    .gte('closing_date', start)
    .order('closing_date', { ascending: false, nullsFirst: false });

  const priorQ = supabase
    .schema('atlas')
    .from('comps')
    .select(SELECT_COLUMNS)
    .eq('is_archived', false)
    .eq('status', 'closed')
    .gte('closing_date', priorStart)
    .lt('closing_date', priorEnd);

  const activeQ = supabase
    .schema('atlas')
    .from('comps')
    .select(SELECT_COLUMNS)
    .eq('is_archived', false)
    .in('status', ['active', 'pending']);

  const [closedRes, priorRes, activeRes] = await Promise.all([
    closedQ,
    priorQ,
    activeQ,
  ]);

  if (closedRes.error)
    throw new Error(`getCompsForDashboard closed: ${closedRes.error.message}`);
  if (priorRes.error)
    throw new Error(`getCompsForDashboard prior: ${priorRes.error.message}`);
  if (activeRes.error)
    throw new Error(`getCompsForDashboard active: ${activeRes.error.message}`);

  return {
    windowDays,
    closedInWindow: ((closedRes.data as unknown as CompRow[]) ?? []).map(toView),
    priorClosedInWindow: ((priorRes.data as unknown as CompRow[]) ?? []).map(toView),
    activeAll: ((activeRes.data as unknown as CompRow[]) ?? []).map(toView),
  };
}

/** Last N closed comps across all sub-cuts (newest first). */
export async function getRecentClosedComps(limit = 10): Promise<CompView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('comps')
    .select(SELECT_COLUMNS)
    .eq('is_archived', false)
    .eq('status', 'closed')
    .order('closing_date', { ascending: false, nullsFirst: false })
    .limit(limit);
  if (error) throw new Error(`getRecentClosedComps: ${error.message}`);
  return ((data as unknown as CompRow[]) ?? []).map(toView);
}
