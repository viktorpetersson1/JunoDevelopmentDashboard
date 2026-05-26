/**
 * Markets repo. Read-only in v1 (no UI to edit thresholds yet — admins
 * tweak via migration if needed). One row per market; v1 ships with a
 * single 'east_end_li' row seeded in migration `atlas_seed_east_end_market`.
 *
 * `sub_cuts` is JSONB; consumers should map through `MarketView` to get
 * the typed `MarketSubCut[]` shape.
 */

import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { MarketSubCut } from '@/lib/db/schema/markets';

export interface MarketView {
  id: string;
  key: string;
  name: string;
  defaultCompWindowMonths: number;
  riderThresholdPct: number;
  stretchThresholdPct: number;
  subCuts: MarketSubCut[];
  referenceMarketIds: string[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
}

interface MarketRow {
  id: string;
  key: string;
  name: string;
  default_comp_window_months: number;
  rider_threshold_pct: number;
  stretch_threshold_pct: number;
  sub_cuts: MarketSubCut[] | null;
  reference_market_ids: string[] | null;
  is_archived: boolean;
  created_at: string;
  updated_at: string;
}

const SELECT_COLUMNS =
  'id, key, name, default_comp_window_months, rider_threshold_pct, stretch_threshold_pct, sub_cuts, reference_market_ids, is_archived, created_at, updated_at';

function toView(row: MarketRow): MarketView {
  const subCuts = Array.isArray(row.sub_cuts) ? row.sub_cuts : [];
  // Stable sort by `order` so the UI always sees a deterministic taxonomy.
  subCuts.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    defaultCompWindowMonths: row.default_comp_window_months,
    riderThresholdPct: row.rider_threshold_pct,
    stretchThresholdPct: row.stretch_threshold_pct,
    subCuts,
    referenceMarketIds: row.reference_market_ids ?? [],
    isArchived: row.is_archived,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Fetch a market by stable string key (e.g. 'east_end_li'). */
export async function findMarketByKey(key: string): Promise<MarketView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('markets')
    .select(SELECT_COLUMNS)
    .eq('key', key)
    .eq('is_archived', false)
    .maybeSingle();
  if (error) throw new Error(`findMarketByKey(${key}): ${error.message}`);
  return data ? toView(data as unknown as MarketRow) : null;
}

/** Fetch a market by uuid. */
export async function findMarketById(id: string): Promise<MarketView | null> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('markets')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`findMarketById(${id}): ${error.message}`);
  return data ? toView(data as unknown as MarketRow) : null;
}

/** List all live markets, sorted by name. */
export async function listMarkets(): Promise<MarketView[]> {
  const supabase = createSupabaseServerClient();
  const { data, error } = await supabase
    .schema('atlas')
    .from('markets')
    .select(SELECT_COLUMNS)
    .eq('is_archived', false)
    .order('name', { ascending: true });
  if (error) throw new Error(`listMarkets: ${error.message}`);
  return ((data as unknown as MarketRow[]) ?? []).map(toView);
}

/**
 * Look up a single sub-cut by key inside a market. Throws if the key
 * doesn't exist — callers that need a non-throwing variant should use
 * `findMarketByKey` and look it up themselves.
 */
export function getSubCutOrThrow(market: MarketView, subCutKey: string): MarketSubCut {
  const sc = market.subCuts.find((s) => s.key === subCutKey);
  if (!sc) {
    throw new Error(
      `Sub-cut '${subCutKey}' not found in market '${market.key}'. ` +
        `Known sub-cuts: ${market.subCuts.map((s) => s.key).join(', ')}`
    );
  }
  return sc;
}
