/**
 * D-025b — Location-factors taxonomy.
 *
 * Single source of truth for the property-location attributes that drive
 * Hamptons / East End pricing: waterfront class, water/feature view, and
 * proximity to town. Shared by the new-project wizard, the project Zod
 * schema, the read/write repos, and the AI comp-research + strategy-brief
 * prompts so the enum values, human labels, and premium guidance never drift.
 *
 * `waterfront_type` mirrors atlas.comps.waterfront_type (same 4 values), so a
 * subject project and a researched comp are classified on the same axis and
 * the AI can match like-for-like. `view_premium` + `town_proximity` are
 * project-only context today (atlas.comps does not store them); they sharpen
 * the prompt but are not matched 1:1 against the comp pool.
 */

// ────────────────────────────────────────────────────────────────────────────
// Enum values (the const arrays are the canonical source; types derive from them)
// ────────────────────────────────────────────────────────────────────────────

/** Mirrors the atlas.comps.waterfront_type CHECK constraint. */
export const WATERFRONT_TYPES = ['sound_front_bluff', 'bayfront', 'inlet', 'inland'] as const;
export type WaterfrontType = (typeof WATERFRONT_TYPES)[number];

/** Strength of the water/feature view, independent of physical frontage. */
export const VIEW_PREMIUM_TYPES = ['none', 'partial', 'full'] as const;
export type ViewPremium = (typeof VIEW_PREMIUM_TYPES)[number];

/** Convenience-to-village axis. */
export const TOWN_PROXIMITY_TYPES = ['walkable', 'short_drive', 'remote'] as const;
export type TownProximity = (typeof TOWN_PROXIMITY_TYPES)[number];

// ────────────────────────────────────────────────────────────────────────────
// Human labels
// ────────────────────────────────────────────────────────────────────────────

export const WATERFRONT_LABELS: Record<WaterfrontType, string> = {
  sound_front_bluff: 'Sound-front / bluff',
  bayfront: 'Bayfront',
  inlet: 'Inlet / creek',
  inland: 'Inland (no water)',
};

export const VIEW_PREMIUM_LABELS: Record<ViewPremium, string> = {
  none: 'No water view',
  partial: 'Partial water view',
  full: 'Full / direct water view',
};

export const TOWN_PROXIMITY_LABELS: Record<TownProximity, string> = {
  walkable: 'Walk to village',
  short_drive: 'Short drive to village',
  remote: 'Remote / secluded',
};

// ────────────────────────────────────────────────────────────────────────────
// Select options (with a leading "unset" entry for forms)
// ────────────────────────────────────────────────────────────────────────────

export interface SelectOption {
  value: string;
  label: string;
}

const UNSET: SelectOption = { value: '', label: '— Unknown —' };

export const WATERFRONT_OPTIONS: SelectOption[] = [
  UNSET,
  ...WATERFRONT_TYPES.map((v) => ({ value: v, label: WATERFRONT_LABELS[v] })),
];
export const VIEW_PREMIUM_OPTIONS: SelectOption[] = [
  UNSET,
  ...VIEW_PREMIUM_TYPES.map((v) => ({ value: v, label: VIEW_PREMIUM_LABELS[v] })),
];
export const TOWN_PROXIMITY_OPTIONS: SelectOption[] = [
  UNSET,
  ...TOWN_PROXIMITY_TYPES.map((v) => ({ value: v, label: TOWN_PROXIMITY_LABELS[v] })),
];

// ────────────────────────────────────────────────────────────────────────────
// Coercion + labels (defensive — used when parsing LLM / DB strings)
// ────────────────────────────────────────────────────────────────────────────

export function coerceWaterfrontType(v: unknown): WaterfrontType | null {
  return typeof v === 'string' && (WATERFRONT_TYPES as readonly string[]).includes(v)
    ? (v as WaterfrontType)
    : null;
}
export function coerceViewPremium(v: unknown): ViewPremium | null {
  return typeof v === 'string' && (VIEW_PREMIUM_TYPES as readonly string[]).includes(v)
    ? (v as ViewPremium)
    : null;
}
export function coerceTownProximity(v: unknown): TownProximity | null {
  return typeof v === 'string' && (TOWN_PROXIMITY_TYPES as readonly string[]).includes(v)
    ? (v as TownProximity)
    : null;
}

export function waterfrontLabel(v: WaterfrontType | null | undefined): string {
  return v ? WATERFRONT_LABELS[v] : 'Unknown';
}
export function viewPremiumLabel(v: ViewPremium | null | undefined): string {
  return v ? VIEW_PREMIUM_LABELS[v] : 'Unknown';
}
export function townProximityLabel(v: TownProximity | null | undefined): string {
  return v ? TOWN_PROXIMITY_LABELS[v] : 'Unknown';
}

// ────────────────────────────────────────────────────────────────────────────
// Prompt helpers — keep the brief + comp-research prompts in lockstep
// ────────────────────────────────────────────────────────────────────────────

export interface LocationProfile {
  waterfrontType?: WaterfrontType | null;
  viewPremium?: ViewPremium | null;
  townProximity?: TownProximity | null;
  lotSizeAcres?: number | null;
  yearBuilt?: number | null;
}

/**
 * Render the subject property's known location factors as labeled lines for a
 * prompt. Only emits lines for factors that are set, so an unclassified
 * project doesn't inject misleading "Unknown" anchors.
 */
export function subjectLocationLines(p: LocationProfile): string {
  const lines: string[] = [];
  if (p.waterfrontType)
    lines.push(`Waterfront: ${WATERFRONT_LABELS[p.waterfrontType]} (\`${p.waterfrontType}\`)`);
  if (p.viewPremium) lines.push(`Water view: ${VIEW_PREMIUM_LABELS[p.viewPremium]}`);
  if (p.townProximity) lines.push(`Town proximity: ${TOWN_PROXIMITY_LABELS[p.townProximity]}`);
  if (p.lotSizeAcres != null) lines.push(`Lot size: ${p.lotSizeAcres} acres`);
  if (p.yearBuilt != null) lines.push(`Year built: ${p.yearBuilt}`);
  return lines.join('\n');
}

/** True when at least one location factor is known. */
export function hasAnyLocationFactor(p: LocationProfile): boolean {
  return Boolean(
    p.waterfrontType ||
      p.viewPremium ||
      p.townProximity ||
      p.lotSizeAcres != null ||
      p.yearBuilt != null
  );
}

/**
 * Guidance block injected into AI prompts. Encodes the East-End premium
 * ladder so Claude reasons about cross-class comps explicitly instead of
 * letting a bayfront comp blow out an inland subject's median.
 */
export const LOCATION_PROMPT_GUIDANCE = `LOCATION FACTORS — how they move price per square foot (apply these explicitly, do not ignore):
- Waterfront class is the single largest PSF driver. Rough premium ladder vs an otherwise-identical INLAND lot:
  • sound_front_bluff (Sound frontage / bluff, ocean-grade): +50-90%
  • bayfront (protected bay or harbor frontage): +30-60%
  • inlet (creek / inlet, water access but lesser frontage): +15-30%
  • inland (no water): baseline.
  A comp in a DIFFERENT waterfront class than the subject is NOT directly comparable. Adjust its $/SF toward the subject's class before using it, and NEVER let an off-class comp set the median or the recommended price.
- view_premium stacks on top of frontage: full/direct water view adds ~10-25% over no view; partial ~5-12%. An inland lot can still carry a view premium (reserve / pond / vista).
- town_proximity: walk-to-village commands a convenience premium in Sag Harbor / East Hampton Village (~5-15%). Remote / secluded can CUT or ADD value depending on estate-privacy appeal — treat it as a modifier, not an automatic discount.
- lot_size_acres: larger lots add value with strong diminishing returns; do not scale $/SF linearly with acreage.
- year built / vintage: match new-construction subjects to 2018+ comps; older comps need a condition / recency haircut.`;
