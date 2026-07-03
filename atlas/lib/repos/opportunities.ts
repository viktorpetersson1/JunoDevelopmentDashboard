/**
 * Opportunities repo (V7 T139/T140/T141).
 *
 * Reads + writes for atlas.opportunities — the standardized deal sheet.
 * Simple single-row model (no versioning): pipeline deals are lightweight
 * and short-lived; edits update in place, the audit log records mutations.
 *
 * Reads use the server client (RLS: any authenticated role). Writes go
 * through the routes' editor gate and use the same server client (RLS write
 * policies don't exist — writes are service-role in production via the
 * route handlers' service client).
 */

import { createSupabaseServerClient, createSupabaseServiceRoleClient } from '@/lib/supabase/server';

export type OpportunityStatus = 'researching' | 'contacted' | 'negotiating' | 'passed' | 'promoted';

export interface ResearchLink {
  label: string;
  url: string;
}

export interface DecisionLogEntry {
  /** YYYY-MM-DD. */
  date: string;
  note: string;
}

export interface OpportunityResearch {
  notes_md?: string;
  links?: ResearchLink[];
  decision_log?: DecisionLogEntry[];
}

export interface OpportunityView {
  id: string;
  name: string;
  market: string | null;
  status: OpportunityStatus;
  ownerName: string | null;
  cashNeededUsd: number | null;
  timelineMonths: number | null;
  expectedProfitUsd: number | null;
  expectedMarginPct: number | null;
  nextStep: string | null;
  nextStepOwner: string | null;
  notes: string | null;
  source: string | null;
  research: OpportunityResearch;
  promotedProjectId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface OpportunityRow {
  id: string;
  name: string;
  market: string | null;
  status: string;
  owner_name: string | null;
  cash_needed_usd: string | number | null;
  timeline_months: number | null;
  expected_profit_usd: string | number | null;
  expected_margin_pct: string | number | null;
  next_step: string | null;
  next_step_owner: string | null;
  notes: string | null;
  source: string | null;
  research: OpportunityResearch | null;
  promoted_project_id: string | null;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS = [
  'id',
  'name',
  'market',
  'status',
  'owner_name',
  'cash_needed_usd',
  'timeline_months',
  'expected_profit_usd',
  'expected_margin_pct',
  'next_step',
  'next_step_owner',
  'notes',
  'source',
  'research',
  'promoted_project_id',
  'created_at',
  'updated_at',
].join(',');

const numOrNull = (v: string | number | null | undefined): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? Number(v) : v;
  return Number.isFinite(n) ? n : null;
};

function toView(row: OpportunityRow): OpportunityView {
  return {
    id: row.id,
    name: row.name,
    market: row.market,
    status: row.status as OpportunityStatus,
    ownerName: row.owner_name,
    cashNeededUsd: numOrNull(row.cash_needed_usd),
    timelineMonths: row.timeline_months,
    expectedProfitUsd: numOrNull(row.expected_profit_usd),
    expectedMarginPct: numOrNull(row.expected_margin_pct),
    nextStep: row.next_step,
    nextStepOwner: row.next_step_owner,
    notes: row.notes,
    source: row.source,
    research: row.research ?? {},
    promotedProjectId: row.promoted_project_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listOpportunities(): Promise<OpportunityView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('opportunities')
    .select(SELECT_COLUMNS)
    .order('created_at', { ascending: true });
  if (error) throw new Error(`listOpportunities: ${error.message}`);
  return ((data ?? []) as unknown as OpportunityRow[]).map(toView);
}

export async function findOpportunityById(id: string): Promise<OpportunityView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('opportunities')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`findOpportunityById: ${error.message}`);
  return data ? toView(data as unknown as OpportunityRow) : null;
}

export interface InsertOpportunity {
  name: string;
  market?: string | null;
  status?: OpportunityStatus;
  ownerName?: string | null;
  cashNeededUsd?: number | null;
  timelineMonths?: number | null;
  expectedProfitUsd?: number | null;
  expectedMarginPct?: number | null;
  nextStep?: string | null;
  nextStepOwner?: string | null;
  notes?: string | null;
  source?: string | null;
}

export async function insertOpportunity(input: InsertOpportunity): Promise<OpportunityView> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('opportunities')
    .insert({
      name: input.name,
      market: input.market ?? null,
      status: input.status ?? 'researching',
      owner_name: input.ownerName ?? null,
      cash_needed_usd: input.cashNeededUsd ?? null,
      timeline_months: input.timelineMonths ?? null,
      expected_profit_usd: input.expectedProfitUsd ?? null,
      expected_margin_pct: input.expectedMarginPct ?? null,
      next_step: input.nextStep ?? null,
      next_step_owner: input.nextStepOwner ?? null,
      notes: input.notes ?? null,
      source: input.source ?? null,
    })
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(`insertOpportunity: ${error.message}`);
  return toView(data as unknown as OpportunityRow);
}

export interface PatchOpportunity {
  name?: string;
  market?: string | null;
  status?: OpportunityStatus;
  ownerName?: string | null;
  cashNeededUsd?: number | null;
  timelineMonths?: number | null;
  expectedProfitUsd?: number | null;
  expectedMarginPct?: number | null;
  nextStep?: string | null;
  nextStepOwner?: string | null;
  notes?: string | null;
  source?: string | null;
  research?: OpportunityResearch;
  promotedProjectId?: string | null;
}

export async function patchOpportunity(
  id: string,
  patch: PatchOpportunity
): Promise<OpportunityView> {
  const supabase = createSupabaseServiceRoleClient();
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.name !== undefined) row.name = patch.name;
  if (patch.market !== undefined) row.market = patch.market;
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.ownerName !== undefined) row.owner_name = patch.ownerName;
  if (patch.cashNeededUsd !== undefined) row.cash_needed_usd = patch.cashNeededUsd;
  if (patch.timelineMonths !== undefined) row.timeline_months = patch.timelineMonths;
  if (patch.expectedProfitUsd !== undefined) row.expected_profit_usd = patch.expectedProfitUsd;
  if (patch.expectedMarginPct !== undefined) row.expected_margin_pct = patch.expectedMarginPct;
  if (patch.nextStep !== undefined) row.next_step = patch.nextStep;
  if (patch.nextStepOwner !== undefined) row.next_step_owner = patch.nextStepOwner;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.source !== undefined) row.source = patch.source;
  if (patch.research !== undefined) row.research = patch.research;
  if (patch.promotedProjectId !== undefined) row.promoted_project_id = patch.promotedProjectId;

  const { data, error } = await supabase
    .schema('atlas')
    .from('opportunities')
    .update(row)
    .eq('id', id)
    .select(SELECT_COLUMNS)
    .single();
  if (error) throw new Error(`patchOpportunity: ${error.message}`);
  return toView(data as unknown as OpportunityRow);
}
