# Exit Pricing Framework v1 — Proposal

> **Status:** Awaiting Viktor approval before coding
> **Companion docs:**
>
> - Spec: `./exit-pricing-framework-v1.md`
> - Open questions: `./exit-pricing-open-questions.md` (8 captured + 8 added; answers proposed below)
>   **Author:** Atlas agent, 2026-05-25
>
> **Reading order:** §1 (placement) → §5 (v1 scope) → §3 (UX) → §2 (data model) → §4 (Q answers) → §6 (test plan).
> Push back on anything; no code starts until you say go.

---

## §1. Information architecture + feature placement

**Decision: per-project tab + global pricing module.**

```
/pricing                  — landing + cross-project run dashboard
/pricing/comps            — global comp library (browse / add / edit / archive)
/pricing/comps/import     — CSV import with dry-run + validation
/pricing/markets          — per-market config (sub-cuts, thresholds) — super_admin only
/projects/[id]?tab=pricing — per-project run history + commit + apply UI
```

**Reasoning:**

- **Comps are global reference data.** Same comp (e.g. 1140 Park Ave) appears in multiple projects' runs. A standalone library is the right home. Pattern matches the per-project Capital tab (T062) reading from global cap-table data (T071).
- **Per-project tab is where the run lives.** Each pricing run is bound to a project. The Pricing tab inherits the same pattern as Capital, Actuals, Sales, Risks, Activity — tabs on `/projects/[id]`.
- **Top-level `/pricing` is for cross-project work** + admin: market config, comp library, recent runs across portfolio. Used by Research / pricing-committee personas, not the project lead doing day-to-day underwriting.
- **Mode 1 screening is OUT of v1** (per my Q16). When you need it: it lives at `/pricing/screen` later, takes address+plot-type, runs without a project record. For v1, screening = create a "scratch" project, archive it after.

**Sidebar entry:** add `Pricing` to the **WORKSPACE** section (between Projects and Pipeline) so it sits with the operational tools, not portfolio analytics.

---

## §2. Data model

### Existing (T023 schemas — verify before extending)

`atlas.pricing_runs` and `atlas.pricing_run_comparables` exist. v1 likely needs schema additions; will reconcile before migration.

### New entities

```
markets                         (global; v1 seeds 1 row: "East End")
  id (uuid, pk)
  key (text, unique)             — "east_end"
  name (text)                    — "East End Long Island"
  default_comp_window_months (int) — default 24
  rider_threshold_pct (int)        — default 15
  stretch_threshold_pct (int)      — default 30
  sub_cuts (jsonb)                 — see below
  reference_market_ids (uuid[])    — empty for v1 single-market

# sub_cuts JSON shape (lives on market for v1; promotes to its own
# table in v2 when we need per-sub-cut admin):
[
  { "key": "nf_sound_front",       "label": "North Fork — Sound-front",
    "waterfront_type": "sound_front_bluff", "region": "north_fork" },
  { "key": "nf_bayfront",          "label": "North Fork — Bayfront",
    "waterfront_type": "bayfront", "region": "north_fork" },
  { "key": "nf_inland",            "label": "North Fork — Inland",
    "waterfront_type": "inland", "region": "north_fork" },
  { "key": "si_heights_non_wf",    "label": "Shelter Island Heights non-WF",
    "waterfront_type": "inland", "region": "shelter_island" },
  { "key": "hamptons_sag_non_wf",  "label": "Sag Harbor / N Haven non-WF",
    "waterfront_type": "inland", "region": "hamptons" },
  ...
]

comps                            (global library)
  id (uuid, pk)
  address (text, required)
  latitude / longitude (numeric, nullable)
  sub_cut_key (text)             — references markets.sub_cuts[].key
  waterfront_type (text)         — sound_front_bluff | bayfront | inlet | inland
  is_nc (bool)                   — new construction flag
  status (text)                  — closed | active | withdrawn | pending
  closing_date (date, nullable)  — required when status=closed
  sale_price_cents (bigint, nullable) — null for unpriced/withdrawn
  ag_sqft (int, required)
  lot_size_acres (numeric, nullable)
  year_built (int, nullable)
  broker (text, nullable)
  source_url (text)
  source (text)                  — "manual" | "csv" | "mls_onekey" (v2) | etc.
  notes (text)
  is_archived (bool, default false)
  created_by, created_at, updated_at
  -- Computed at query time: psf = (sale_price_cents / 100) / ag_sqft

pricing_runs                     (per-project, append-only after commit)
  id (uuid, pk)
  project_id (uuid, FK projects)
  version (int)                  — monotonic per project
  mode (text)                    — "auto" | "on_demand" | "screening" (v2)
  trigger_source (text)          — "system" | "user"
  triggered_by_user_id (uuid)
  status (text)                  — "draft" | "committed" | "archived"
  comp_window_start (date)
  comp_window_end (date)
  narrative_summary (text)       — broker chatter + sentiment + sources
  buyer_migration_thesis (text)  — Step 4 outcome prose
  reconciliation_table (jsonb)   — [{question, partner_a, partner_b, verdict}]
                                   nullable; only when partners disagree
  -- Application tracking:
  applied_at (timestamptz, nullable)
  applied_by_user_id (uuid, nullable)
  -- Audit:
  committed_at (timestamptz, nullable)
  committed_by_user_id (uuid, nullable)
  created_at (timestamptz)

pricing_run_plot_outputs         (one row per plot type in a run)
  id (uuid, pk)
  pricing_run_id (uuid, FK)
  plot_type_key (text)           — "sound_front", "inland", etc.
  plot_type_label (text)
  sub_cut_key (text)             — which sub-cut this plot type uses
  plot_count (int)               — number of villas of this type
  sqft_per_unit (int)            — for the financial-model push

  -- L/B/H — human-committed numbers + anchors:
  low_psf (numeric)
  base_psf (numeric)
  high_psf (numeric)
  low_anchor_comp_snapshot_id (uuid, FK pricing_run_comparables)
  base_anchor_comp_snapshot_id (uuid, FK pricing_run_comparables)
  high_anchor_comp_snapshot_id (uuid, FK pricing_run_comparables)
  low_premium_pct (numeric, nullable)   — optional structured premium
  base_premium_pct (numeric, nullable)
  high_premium_pct (numeric, nullable)
  low_derivation (text)          — required prose
  base_derivation (text)         — required prose
  high_derivation (text)         — required prose

  -- Engine-derived:
  data_gap_flag (bool)           — true if <3 closed comps in sub-cut + window
  triangulation_reasoning (text, nullable) — required IFF data_gap_flag
  classification (text)          — "rider" | "stretch_rider" | "maker"
  confidence (text)              — "high" | "medium" | "low"
  strongest_in_sub_cut_psf (numeric, nullable) — anchor for classification math

pricing_run_comparables          (snapshot of comps used in a run)
  id (uuid, pk)
  pricing_run_id (uuid, FK)
  comp_id (uuid, FK comps)       — cross-ref to live record
  -- Snapshot fields (frozen at run time):
  snapshot_address, snapshot_sub_cut_key, snapshot_waterfront_type,
  snapshot_is_nc, snapshot_status, snapshot_closing_date,
  snapshot_sale_price_cents, snapshot_ag_sqft, snapshot_lot_size_acres,
  snapshot_source_url, snapshot_psf  (denormalized for quick render)
  -- Role within the run:
  role (text)                    — "anchor" | "reference" | "ceiling" | "floor" | "context"
  used_for_plot_type_keys (text[]) — which plot outputs cite this comp
  is_primary_in_sub_cut (bool)   — flags the strongest-closed used for classification
  created_at
```

### Why this shape

1. **Snapshot-on-run** (my Q13) — historical runs immune to later comp corrections. Matches the approval-snapshot pattern (T063).
2. **Plot-type outputs as separate rows** (Spec Q6) — Big Bing has 2 plot types → 2 `pricing_run_plot_outputs` rows. Single-plot projects have 1.
3. **Structured + prose for premium** (my Q10) — `base_premium_pct` optional; if set, engine asserts `anchor.psf × (1 + premium) ≈ base_psf` within tolerance. Falls back to "any number, any prose" when not set.
4. **Append-only after commit** — DRAFT can mutate freely; COMMITTED can't (DB trigger like approval-snapshot).
5. **Reconciliation as JSONB** — fine for v1; promote to a table when it has tabular query needs.

### Multi-plot-type on the financial model (Spec Q6)

Extend `atlas.projects` with `plot_types JSONB`:

```
[
  {
    "key": "sound_front",
    "label": "Sound-front (3 villas)",
    "count": 3,
    "sqft_per_unit_ag": 5000,
    "sale_price_per_sqft_override_cents": null,
    "applied_pricing_run_id": null
  },
  { "key": "inland", "label": "Inland (4 villas)", "count": 4, ... }
]
```

Calc engine roll-up:

- When `plot_types` is null → existing single-villa logic (back-compat for all 11 baseline projects, no migration needed).
- When `plot_types` is set → sum each plot type's contribution: `total_sales = Σ (count × sqft_per_unit_ag × psf)` where psf = override or applied pricing run base.

---

## §3. UX flow for the 3 modes

### Mode 2 — Auto-run on project creation

1. User completes `/projects/new` wizard (T065). Submits.
2. Service hook: after `createProject`, fire `createDraftPricingRun(projectId)` async (don't block redirect to project page).
3. Engine:
   - Queries `comps` table for market + (suggested) sub-cuts + window (24 mo ending today)
   - Detects waterfront_type from project metadata (extension: project gets a `waterfront_type` text field; user picks in wizard)
   - Suggests sub-cuts based on project location + waterfront_type
   - Pre-creates one `pricing_run_plot_outputs` row per suggested plot type (count=1 if single-plot project, else multi)
   - Lands run in DRAFT state with all L/B/H = null, anchors = null, data_gap_flag computed
4. User lands on `/projects/[id]` → sees Pricing tab badge "1 draft" → clicks → sees the Draft Editor:
   - Top section: comp window + narrative + buyer-migration thesis (free text)
   - Per plot-type card:
     - Sub-cut dropdown (engine pre-selected, human can change)
     - Comp picker grouped by closed-in-sub-cut / closed-substitute / active-ceiling / land-floor
     - L/B/H inputs with anchor comp dropdown + derivation textarea
     - Optional `premium_pct` field beside each number
     - Live readout: classification + confidence + data-gap flag (recomputed as inputs change)
   - Bottom: reconciliation table editor (optional, expand-on-click)
   - "Commit run" button (validates all required fields)
5. After commit: run row → status=committed, version=1.
6. UI shows "Apply base to financial model" button (if no current applied run, or to overwrite).
7. After Apply: `projects.plot_types[i].sale_price_per_sqft_override_cents` updated + `applied_pricing_run_id` set; project's calc engine re-runs with new exit prices.

### Mode 3 — Re-run on existing project

1. User on `/projects/[id]?tab=pricing` clicks "Re-run pricing".
2. Same flow as Mode 2 step 3 onward (engine pulls fresh comps, lands as draft, version+1).
3. After commit, compare base vs currently-applied:
   - If delta ≤ 10%: "Apply" button is primary CTA, no warning
   - If delta > 10%: **warning banner** + **notification** (atlas.notifications inbox) per my Q14
   - Banner text: "Pricing framework re-ran [date]. New base = $X/sqft (Δ +Y% vs current $Z/sqft from run v(N-1)). [Apply] [Dismiss]"
4. Apply or Dismiss is an explicit action. No silent update.
5. Diff view: pick any two runs from history → side-by-side comparison of L/B/H per plot type + classification + confidence + which comps changed.

### Mode 1 — Screening

**Deferred to v2.** v1 workaround: create a "scratch" project via `/projects/new`, run pricing, archive the project. The 1-click screening UI lands when there's real pre-acquisition volume to justify it.

### Financial model integration (constant across modes)

On `/projects/[id]?tab=summary` and `?tab=sales`:

- "Sale price" field shows: `$1,213/sqft AG (from pricing run v3, applied 2026-05-25 by Viktor)`
- If user has manually overridden `sale_price_per_sqft_override` to differ from latest applied run base by > 10% → small warning chip: "Manual override differs from pricing framework by +X%"
- Hovering / clicking deep-links to `/projects/[id]?tab=pricing&run=<id>`

---

## §4. Answers to open questions

### Spec Part 6 questions

**Spec Q1 — Comp data source strategy.**
v1: **manual entry + CSV import**. v2: single MLS/Compass endpoint behind a `ComparableSource` adapter interface. v1 data model already supports the migration: `comps.source` text field tags each row's origin; adding `mls_onekey` is a tag, not a schema change.

CSV format: `address, sub_cut_key, waterfront_type, is_nc, status, closing_date, sale_price_usd, ag_sqft, lot_size_acres, year_built, broker, source_url, notes`. Dry-run validates each row before commit.

**Spec Q2 — Per-market config + market detection.**
v1: **single "East End" market** with rich sub_cuts JSON modeling North Fork / Shelter Island / Hamptons taxonomies. v2: multi-market. Market picked via wizard dropdown (already exists in T065). No geocoding for v1 (my Q15).

**Spec Q3 — Versioning.**

- Each commit = a new immutable `pricing_runs` row, `version = N+1` per project.
- `projects.applied_pricing_run_id` points to the currently-applied run.
- All runs visible in a timeline UI; side-by-side diff between any two.
- No auto-archive after N versions (audit value > storage cost).
- Re-run that doesn't get applied = a new row but no financial-model touch.

**Spec Q4 — Autonomous vs assisted steps.**
| Step | Mode | Why |
|---|---|---|
| 1. Comp window | Engine default 24mo; human can override | Reproducible default; per-project flexibility |
| 2. Pull comps | Engine autonomous | Pure data fetch |
| 3. Data gap flag + triangulation | Engine flags; human writes prose | Auto-detect, human-justify |
| 4. Buyer-migration thesis | Human-driven; engine surfaces broker quotes from narrative records | Judgement, not computable |
| 5. Commit L/B/H | Human commits numbers + anchor; engine validates + classifies + computes confidence | **My Q9 answer: engine never derives the number** |
| 6. Reconcile partner disagreement | Optional; human-driven; engine stores | Rare path, no automation gain |

**Spec Q5 — Approval workflow.**
**No formal approval gate for v1.** The explicit "Apply" button on the project page IS the gate. Re-runs that change base by > 10% from currently-applied fire a notification + banner; user must click Apply. Per my Q6, this avoids duplicating the approval-snapshot ceremony when the diff-on-apply UI already prevents silent updates.

**Spec Q6 — Multi-plot-type projects.**
**Per-plot-type exit fields on the project.** Extend `projects.plot_types` JSONB. Calc engine sums across plot types for total_sales when plot_types is set; falls back to single-villa logic when null. No migration needed for existing 11 baseline projects.

### My 16 additional questions — proposed answers

| #   | Question                             | Proposed answer                                                                                                                                                                            |
| --- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | East End single market vs three?     | **Single East End market** with sub-cuts modeling all three regions                                                                                                                        |
| 2   | Comp library bootstrap               | **Manual + CSV** with bulk seed at launch; "Add comp" panel reachable from pricing run draft routes through library                                                                        |
| 3   | Mode 2 sub-cut timing                | **(a) — lands as DRAFT** with engine-suggested sub-cuts; human commits in the editor                                                                                                       |
| 4   | Confidence formula                   | **High** = ≥5 closed in-sub-cut + base within ±20% of anchor; **Medium** = 3-4 OR ≥5 but 20-50% gap; **Low** = <3 (gap-bridged) OR >50% gap                                                |
| 5   | Multi-plot financial model           | **(a) — extend ProjectInput** with `plot_types` JSONB; back-compat by null check                                                                                                           |
| 6   | Approval gate                        | **(b) — no gate; diff banner is the gate**                                                                                                                                                 |
| 7   | Comps global library                 | **Yes** — one record per (address + closing_date); unique constraint to enforce                                                                                                            |
| 8   | Active listing snapshot vs reference | **Snapshot** at run time (matches approval-snapshot pattern, integrity over time)                                                                                                          |
| 9   | Engine vs human on pricing           | **Engine never derives the L/B/H numbers.** Human commits all three; engine validates anchor + auto-classifies + computes confidence + flags gaps. (CRITICAL — this shapes the entire UX.) |
| 10  | Premium structured or prose?         | **Optional structured field** (`base_premium_pct`). When set, engine validates `anchor × (1+pct) ≈ base` within ±0.5% tolerance; otherwise prose-only                                      |
| 11  | Single anchor vs reference set       | **Primary anchor (1) + reference comps (N) per L/B/H**. `pricing_run_comparables.role` tags each comp's purpose                                                                            |
| 12  | Market-maker rule precedence         | **Absence-of-comp wins.** Zero in-sub-cut closed comps → market-maker even if substitute-sub-cut math says rider. Literal spec read                                                        |
| 13  | Comp snapshot integrity              | **Snapshot** (matches T063 approval snapshots; consistent platform pattern)                                                                                                                |
| 14  | Notification channel                 | **Both** — `atlas.notifications` inbox + dedicated banner on Pricing tab + Summary tab                                                                                                     |
| 15  | Geocoding for market detection       | **None v1.** Market picked in New Project Wizard dropdown (already exists). Geocoding is a v2 nice-to-have                                                                                 |
| 16  | Mode 1 in v1?                        | **Deferred to v2.** Workaround = scratch project. Saves ~2 days of dedicated UI work                                                                                                       |

---

## §5. v1 scope — what ships in one focused build

### IN

- **Schema:** `markets` table seeded with 1 East End row; `comps` global library; `pricing_runs` + `pricing_run_plot_outputs` + `pricing_run_comparables`; `projects.plot_types` extension.
- **Comp library UI** at `/pricing/comps`: list + filter by sub-cut/status/year + add single comp + CSV bulk import + archive (no delete).
- **Per-project Pricing tab** at `/projects/[id]?tab=pricing`:
  - Run history timeline with version + status + applied-or-not pill
  - Draft editor (sub-cut + plot type + L/B/H + anchor + derivation + narrative + reconciliation)
  - Commit + Apply flow with diff banner on > 10% deltas
  - Side-by-side diff between any two runs
- **Mode 2** — auto-fires on project creation, lands as draft
- **Mode 3** — manual re-run from Pricing tab
- **Engine:**
  - Data-gap flag (<3 closed in sub-cut + window)
  - Auto-classification (rider / stretch / maker)
  - Confidence rating
  - Structured premium validation (when supplied)
- **Multi-plot-type support** end-to-end (calc engine, UI, financial model push)
- **Notifications + diff UI** for re-run with > 10% delta vs applied
- **3 regression tests** reproducing the worked examples

### OUT (v2 backlog)

- Mode 1 screening as a dedicated UI
- MLS / Compass / OutEast automated comp ingest
- Multi-market expansion beyond East End
- Geocoding for market auto-detection
- Reconciliation table dedicated editor (v1 stores JSONB; raw textarea editor only)
- Batch re-run across all projects
- Cross-project pricing analytics dashboard
- Comp deduplication tooling (v1 = unique index on address + closing_date; conflicts surface as DB errors)

### Estimate

~2-3 days of focused work for the full v1. Breakable into:

1. DB migrations + repo + service + API (1 day)
2. Comp library UI (½ day)
3. Per-project Pricing tab — draft editor + history + apply flow (1 day)
4. Multi-plot extension to calc engine + project page render (½ day)
5. Regression tests + smoke (¼ day)

---

## §6. Regression test plan

Each worked example → fixture JSON in `atlas/tests/fixtures/pricing-framework/`:

```
A_big_bing.json
  project: { ... market=east_end, plot_types=[sound_front×3, inland×4] }
  comps: [ ... full Big Bing comp set per spec Part 2 ]
  human_inputs: {
    sound_front_plot: { low: 1100, base: 1450, high: 1800, anchors: [...] },
    inland_plot:      { low: 650,  base: 850,  high: 1200, anchors: [...] }
  }
  expected:
    sound_front: classification="maker", data_gap_flag=true, confidence="low"
    inland:      classification="stretch_rider", data_gap_flag=false, confidence="medium"

B_6_great_circle.json
  human_inputs: { base: 1213, anchor: 16 Osprey Way ($1000/sqft) }
  expected:
    classification="stretch_rider" (base = +21.3% above $1000 anchor)
    base_premium_pct=21.3 (engine-derived from anchor + base)

C_84_sunset.json
  human_inputs: { base_psf_for_7.5M_at_~4000_ag = ~1875 }
  expected:
    classification="rider" (within Amagansett SoH / N Haven non-WF NC range)
```

Test file: `atlas/tests/golden/pricing-framework.golden.test.ts`. Same pattern as the project + portfolio golden tests we already have.

**Tolerance:**

- L/B/H numbers — exact match (human-committed; no math drift)
- Classification, data_gap_flag, confidence — exact match (string equality)
- Premium pct (when structured) — within ±0.5%

The engine has small surface: classification + confidence + data-gap. These 3 worked examples cover every classification path + the no-comp data-gap branch.

---

## What I need from you to start coding

**Approve** (or push back per-section). Two specific decisions worth confirming:

1. **§4 my Q9** — confirming the engine NEVER derives L/B/H. (If wrong, the whole UX inverts: the engine proposes numbers and the human approves.)
2. **§4 my Q16** — Mode 1 screening deferred to v2.

Once approved, I'll plan the build in commits:

1. Schema migrations (markets, comps, pricing*run*\*, projects.plot_types extension)
2. Repo + service layer
3. APIs (REST routes following the existing pattern)
4. Comp library UI
5. Per-project Pricing tab
6. Calc engine multi-plot extension
7. Regression tests

Each as its own commit so you can review one bite at a time.
