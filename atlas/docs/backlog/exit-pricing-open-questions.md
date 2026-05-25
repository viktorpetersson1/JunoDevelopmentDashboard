# Exit Pricing Framework v1 — open questions for Viktor

> Captured 2026-05-25. These are questions Atlas has on the spec at
> `./exit-pricing-framework-v1.md` that came up while reading it for
> backlog storage. They are NOT the Part 6 questions in the spec
> itself (those need answers as part of the proposal). They are
> additional ambiguities the proposal writer will need cleared up.

## 1. v1 single-market scope = "East End" umbrella or per-sub-region?

Part 5 says "A single-market config (e.g., East End Long Island) is
acceptable for v1." But the three worked examples span three sub-regions
with distinct sub-cut taxonomies:

- **A — Big Bing:** North Fork (Sound-front / bayfront / inland)
- **B — 6 Great Circle:** Shelter Island (Heights non-WF NC / non-WF / WF)
- **C — 84 Sunset:** Sag Harbor + North Haven + Amagansett (Hamptons family)

Is "East End Long Island" the single v1 market with all three sub-region
sub-cut taxonomies modeled inside it? Or is v1 actually three separate
markets (North Fork, Shelter Island, Hamptons) with shared
infrastructure? The proposal will recommend, but it changes whether
the market config is one record or three.

## 2. Comp library bootstrap — add-during-run UX

Part 5: "Do not build a UI that lets users edit closed comp records
inline. Comps are reference data; they are entered/edited in a
dedicated comp library, not via the pricing run UI."

But the comp library starts empty. For Mode 2 (auto-run on project
creation) and Mode 3 (re-run), the engine needs comps already in the
library or it produces an empty/zero-comp run.

Three options:

- **(a)** Pricing run UI lets users **add new comps to the library** via
  an "add comp" panel that opens a dedicated comp form (still routes
  through the library, not inline edit on the run).
- **(b)** Pricing run can only be initiated after the library has
  reached a threshold of comps for the relevant sub-cut(s); auto-run
  on project creation reports "insufficient comp library" instead of
  producing a result.
- **(c)** Initial seeding: bulk CSV import populates the library
  before Mode 2 ever fires for a real project. Day-1 only.

Recommend (a) + (c) — bulk seed at launch, add-during-run available
but routes through the library. Confirm.

## 3. Auto-run on project creation — sub-cut declaration timing

Part 5 says sub-cut declaration is human-committed ("the engine
suggests; the human commits"). Mode 2 is auto-triggered on project
creation. So either:

- **(a)** Mode 2 runs immediately with engine-suggested sub-cuts and
  the run sits in a "draft" state until the human commits sub-cuts,
  at which point the run finalizes and pushes to the financial model.
- **(b)** Mode 2 doesn't fire until the human has committed sub-cuts
  in a setup step right after project creation.

Which UX does Viktor want? (b) is cleaner conceptually but (a) gives
faster feedback.

## 4. Confidence rating algorithm — explicit spec needed

Spec says "Confidence rating per plot-type output (high / medium /
low — derived from comp density and anchor strength)." No formula
given. The proposal will need to pin one. Suggested first-cut:

- **High:** ≥5 closed in-sub-cut comps in window AND base is within
  ±20% of the strongest in-sub-cut anchor.
- **Medium:** 3–4 closed comps in sub-cut, OR ≥5 but base diverges
  20%–50% from anchor.
- **Low:** <3 closed comps (gap-bridged), OR base diverges >50%.

Confirm or override.

## 5. Financial model exit field — schema extension required

Current `ProjectInput` (lib/calc/project/types.ts) has:

- `sale_price_override_usd?: number | null`
- `sale_price_per_sqft_override?: number | null`
- `target_margin?: number | null`

Single villa per project. To support multi-plot-type Big Bing-style
projects, the schema needs extension. Two options:

- **(a)** Add per-plot-type exit fields as a new structure inside
  `ProjectInput` (e.g., `plot_exits: Array<{plot_type, base_psf,
  override_psf, framework_run_id, applied_at}>`). Calc engine
  consumes per-plot-type and rolls up.
- **(b)** Framework delivers a blended $/sqft for the project and
  the existing single-villa schema stays. Multi-plot detail lives
  only in the pricing run record, not in the calc inputs.

This is one of the Part 6 questions (Q6) but the answer constrains
how much calc-engine surgery is needed. Confirm that it's OK to
extend `ProjectInput` for (a), or that (b) is the v1 path.

## 6. Approval workflow vs. master admin

Spec Q5 asks whether a pricing run needs approval before pushing to
the financial model. Atlas has roles `super_admin | editor | viewer |
viewer_basic` (lib/auth/profile.ts). Two natural shapes:

- **(a)** super_admin always pushes; editor needs super_admin
  approval; viewer can't trigger.
- **(b)** No approval gate. The diff-on-re-run UI in Part 3 already
  gives explicit acceptance — that's the gate.

Recommend (b) for v1 (fewer states, the diff UI already prevents
silent application). Confirm.

## 7. Comp deduplication across projects

Same closed comp can appear in multiple projects' runs (e.g., 1140
Park Ave Mattituck $10M shows up as an ultra-luxury anchor for
several North Fork projects). Confirm comps are a global library
(one record per real address+closing_date), and pricing runs
reference comps by ID. The proposal assumes yes unless told
otherwise.

## 8. Active listings — refresh cadence + decay

Active listings change weekly (re-priced, withdrawn, sold). Part 1
says active listings are "ceiling indicators" and Part 3 Mode 3 is
on-demand re-run. Question:

- Should each pricing run **snapshot** the active listings at run
  time (so re-running surfaces "new active comp at $X since last
  run")?
- Or do pricing runs **reference** the live library record, meaning
  re-rendering a historical run shows whatever the active state is
  today (lossy)?

Recommend snapshot — keeps each run reproducible. Confirm.
