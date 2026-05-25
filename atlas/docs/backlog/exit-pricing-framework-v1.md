# Exit Pricing Framework — v1 spec

> **Status:** Backlog · captured 2026-05-25 · awaiting proposal phase
> **Owner:** Viktor (review) · TBD (build)
> **Discipline:** New module — feeds the financial model, must not be folded into it
> **Do not start coding before a written proposal is approved.**

This is the verbatim spec Viktor handed off. **Do not summarise, reinterpret, or "improve" the contents below** when writing the proposal — raise ambiguities as open questions instead.

The proposal (information architecture, data model, UX, open-question answers, v1 scope, regression plan) must be delivered for review before any code is written.

Open questions Atlas has on this spec are tracked in `./exit-pricing-open-questions.md` so they don't get lost when the next agent picks it up.

---

# BUILD: Juno Exit Pricing Framework — v1 feature

## Read this entire prompt before writing any code

You are extending the Juno platform with a new feature called the **Exit Pricing Framework**. This is a methodology for setting defensible exit prices on luxury residential developments, designed to separate evidence from narrative and to commit to a number rather than hedge.

Before you write any code:

1. **Read the existing Juno codebase.** Familiarise yourself with the current architecture, naming conventions, module layout, persistence layer, financial model module, and project lifecycle. Read `REVIEWER_AGENT.md` end-to-end — the scope, contracts, and patterns described there are authoritative. Your recommendations must be consistent with how Juno is already architected, not a parallel structure bolted on the side.

2. **Produce a written proposal** (no code yet) covering: recommended information architecture and feature placement; data model for a pricing run; UX flow for the three modes; answers to the open questions below; and the v1 scope you can ship in one focused build. I will review and approve before you write code.

3. **Treat the framework, regression examples, and constraints below as the specification.** Do not summarise, reinterpret, or "improve" them in your proposal. If something is ambiguous, raise it as an open question — do not paper over it.

---

## PART 1 — THE FRAMEWORK (do not reinterpret)

The framework was developed for Juno (a design-driven luxury residential developer in the US Tri-State area, primarily East End Long Island, Hamptons, North Fork, Shelter Island). It produces a defensible exit price in $/sqft above-grade (AG) per plot type, with a low / base / high range, anchored to specific named closed comparables, and classified as either "market-rider" (pricing follows existing evidence) or "market-maker" (pricing establishes new evidence).

### The four principles

1. **Closed sales weigh more than active listings.** Active listings tell you what sellers hope for; closed sales tell you what buyers actually paid. Active listings are usable only as (a) ceiling indicators — what has not sold — and (b) sentiment signals. Active listings must never be averaged with closed comps or used to derive a base price.

2. **Sub-cut comps by physical attribute, not by hamlet alone.** A Sound-front bluff lot is a different product from a bayfront lot is a different product from an interior lot — even in the same town. Mixing them produces meaningless averages. Each sub-cut needs its own comp set and its own anchor.

3. **New construction (NC) is the primary lens.** Resales contain idiosyncratic adjustments (vintage, condition, renovations, off-market deals). Where NC comps are absent or thin, resale comps are used as ceiling / floor reference and must be explicitly flagged. Resale and NC comps must be tagged separately in the data model and never blended into a single $/sqft AG average.

4. **Distinguish facts, judgement, and narrative.** Facts = closed transaction data with confirmed price, AG sqft, and lot size. Judgement = our interpretation of what those facts mean for the subject project. Narrative = broker quotes, seller framing, market commentary. The framework keeps these in separate fields. Narrative may inform judgement; narrative must never drive a price number.

### The six-step method

**Step 1 — Define the comp window.** Default is the last 24 months. Older comps are reference only. The window is configurable per project but must be explicit in the persisted run.

**Step 2 — Pull every closed sale in each sub-cut within the window.** Required fields per comp: address, closing date, sale price, AG sqft, lot size in acres, waterfront type (Sound-front bluff / bayfront / inlet / inland), NC vs resale flag, year built, broker, source URL. For each comp the system records $/sqft AG = price / AG sqft. Active listings are recorded in the same structure with a status flag of "active" or "withdrawn" — never merged with closed.

**Step 3 — Identify the data gap.** If a sub-cut has fewer than 3 closed comps in the window, name the gap explicitly in the persisted run and bridge it via documented triangulation: closest-substitute closed NC (e.g., bayfront NC as a proxy for Sound-front NC), active listings as ceiling indicators, adjacent land-only trades as a floor, and resale comps as additional reference. The triangulation reasoning must be recorded in prose alongside the numeric output.

**Step 4 — Test the buyer-migration / market-narrative thesis at the transaction level.** Many luxury markets have a broker narrative (e.g., "Hamptons buyers are migrating to the North Fork"). Test it by asking: is there a named or confirmed buyer who transacted in the subject market who came from the higher-priced reference market? If the only evidence is broker quotes, the narrative is direction-of-travel evidence — it supports steady premium expansion, not sudden tier convergence. The narrative is recorded in its own field; it must not be used to set a number.

**Step 5 — Commit to a low / base / high range per plot type, each anchored to a specific named comp.** The convention:

- **Low** = bear case (the community / brand premium fails to deliver; pricing trades on isolated land + structure value). Anchored to a closed inland or sub-substitute comp.
- **Base** = the case we underwrite (community premium delivered, but unproven on this site). Anchored to the closest closed NC comp + a documented premium adjustment.
- **High** = bull case (full migration thesis or brand premium validates; this is the market-making case). Anchored to the highest defensible closed evidence in the broader reference set (e.g., Hamptons NC closed peak).

Each level requires a named anchor comp and a one-paragraph explanation of how the number was derived from that anchor.

**Step 6 — Reconcile internal disagreement using a structured table.** When partners disagree on exit price, the framework supports a reconciliation table with columns: question, partner A's position, partner B's position, evidence-led verdict. The verdict commits — it does not split the difference. This is an optional artefact on a pricing run and must be persisted with the run when used.

### Outputs of a pricing run

Per plot type:

- Low / base / high $/sqft AG (three numbers)
- Anchor comp for each (named, with link to source)
- Sub-cut declaration (Sound-front / bayfront / inland / etc.)
- Data-gap flag (true if <3 closed comps in sub-cut + window)
- Market-rider vs market-maker classification (see below)
- Triangulation reasoning (prose, when gap-bridged)
- Optional partner-reconciliation table

Run-level metadata:

- Comp window dates
- Total comps pulled (closed and active, counted separately)
- Last refreshed timestamp
- Narrative summary field (broker chatter, market sentiment, identified by source)
- Confidence rating per plot-type output (high / medium / low — derived from comp density and anchor strength)

### Market-rider vs market-maker classification

This is auto-derived from the gap between the base price and the strongest in-sub-cut closed comp:

- **Market-rider:** base price ≤ +15% above the strongest closed NC comp in the same sub-cut and window. Pricing follows existing evidence.
- **Stretch market-rider:** base price +15% to +30% above strongest closed comp. Pricing requires community premium or brand premium delivery.
- **Market-maker:** base price +30% above strongest closed comp, OR no closed comp exists in the sub-cut within the window. Pricing establishes new evidence; burden of proof shifts to execution + anchor sale.

The thresholds (15%, 30%) are configurable in the per-market config but must default to these values. Propose your own thresholds in the proposal if you disagree, with reasoning.

---

## PART 2 — WORKED EXAMPLES (regression suite)

If the engine does not reproduce these outputs when fed the same inputs, it is wrong. These are the regression tests for v1.

### Example A — Big Bing / North Fork 8-Plots (Oregon Road, Cutchogue)

**Inputs:**

- Comp window: May 2024 – May 2026
- Plot types declared by user: 3 Sound-front (LI Sound bluff) + 4 inland
- Sub-cuts: Sound-front NC; bayfront NC (Peconic Bay / Nassau Point); inland NC Cutchogue / Mattituck / Southold; Hamptons NC + Shelter Island NC as upper-bound reference only

**Comp set — Sound-front NC closed:** zero comps in window (data gap flag = true). Triangulation via:

- Bayfront NC closed: 3745 Nassau Point Rd Cutchogue, Jun 2025, $8.0M, 5,500 AG, $1,455/sqft AG. Source: Compass listing record.
- Active Sound-front listings (ceiling): 470 Lloyds Ln Mattituck $5.45M / 4,929 AG = $1,106/sqft (active 114+ DOM); 4105 Soundview Ave Mattituck $4.25M / 3,348 AG = $1,269/sqft. Both unsold.
- Adjacent Sound-front land-only trades (floor): 6121 Oregon Rd Cutchogue 2.72 ac SF land active $3.5M (sold 2022 for $1.35M); 7908 Oregon Rd #6 and #8, 5 ac SF land active $3.75M and $3.95M.

**Comp set — Inland NC closed:**

- 5235 Bridge Ln Cutchogue, Mar 2025, $1.775M, 3,400 AG, $522/sqft AG (Cutchogue interior NC).
- 625 Park Ave Mattituck, Dec 2025, $3.25M, 3,100 AG, $1,048/sqft AG (Mattituck off-water NC; current NF off-water NC $/sqft record).
- 1355 Little Peconic Bay Rd Cutchogue, active, $4.095M / 7,885 AG = $519/sqft AG (NC 2025, not WF).
- 19620 Soundview Ave Southold, active, $4.395M / 7,300 AG = $602/sqft AG (NC 2025, near-Sound not direct frontage).

**Ultra-luxury anchors ($5M+ closed, all bayfront resale, not used as primary anchors — context only):** 1140 Park Ave Mattituck Oct 2024 $10.0M / 4,500 AG = $2,222/sqft; undisclosed Q3 2024 $7.2M; 3745 Nassau Point Cutchogue Jun 2025 $8.0M (also a bayfront NC anchor above); 12120 New Suffolk Ave Cutchogue Oct 2025 $11.2M / 7,500 AG = $1,493/sqft (resale, NF record); 59600 Main Rd Southold Jan 2026 $12.35M (21.4 ac vineyard estate, $/sqft distorted by ag land); 2100 Park Ave Mattituck Mar 2026 $5.75M / 4,419 AG = $1,301/sqft (resale).

**Upper-bound reference (Hamptons NC closed peak):** Sag Harbor NC 2024, $10.125M / 5,869 AG = $1,725/sqft AG (closed Q4 2024).

**Buyer-migration thesis result:** broker narrative strong (Principi/Corcoran, Naddell/Elliman, Elkin/Compass all assert Hamptons-overflow). Transaction-level proof weak — the one confirmed identity at $10M (1140 Park Ave) was Florida-based, not a Hamptons defector. Verdict recorded as "direction-of-travel only; supports premium expansion not tier convergence."

**Expected outputs:**

| Plot type | Low | Base | High | Classification |
|---|---|---|---|---|
| Sound-front | $1,100 | $1,450 | $1,800 | Market-maker (zero closed NC in sub-cut) |
| Inland | $650 | $850 | $1,200 | Stretch market-rider (base = +63% above Cutchogue interior NC $522, but anchored to Mattituck NC $1,048) |

Sound-front anchors: Low → active SF listings $1,100–$1,269. Base → bayfront NC closed $1,455 with implicit modest discount for unproven Sound-front market. High → Hamptons NC closed peak $1,725–$1,800; explicitly market-making.

Inland anchors: Low → Cutchogue interior NC $522 + ~25% community premium. Base → blended Cutchogue interior + Mattituck NC tier with community premium. High → Mattituck NC $1,048 + brand premium uplift.

### Example B — 6 Great Circle Drive / Shelter Island Heights

**Inputs:**

- Comp window: 24 months ending May 2026
- Plot type: Shelter Island Heights non-WF NC
- Active ceiling indicators tracked weekly: 11 Sunnyside Ave (re-listed $5.5M Apr 24 2026, third attempt, MLS 990118 / 931250); 9 Margarets Drive ($5.395M listed May 7 2026, MLS 395140, 4,248 AG, AIA-award Sean Murphy + James Merrell architecture)

**Closed comp anchor:** 16 Osprey Way Shelter Island, $1,000/sqft AG (Shelter Island non-WF NC range $889–$1,225/sqft AG).

**Expected outputs:**

- Base $/sqft AG = $1,213 (the v5.2 launch price = $4.85M / ~4,000 AG)
- Anchor: Shelter Island non-WF NC $1,000/sqft + ~21% community / design premium
- Classification: stretch market-rider (base +21% above closed anchor, within stretch threshold)
- Active ceilings: 11 Sunnyside Ave + 9 Margarets Drive both flagged in run

### Example C — 84 Sunset Beach Road / Sag Harbor (North Haven)

**Inputs:**

- Comp window: 24 months ending May 2026
- Plot type: Sag Harbor / North Haven non-WF NC, with bayfront/Sound-shore upper-bound reference
- Sub-cuts: Sag Harbor non-WF NC; North Haven WF NC; Amagansett SoH non-WF NC (broader reference, same buyer pool)

**Closed comp anchors:**

- 63 Hand Lane Amagansett (closed Dec 2025): $10.675M, $1,779/sqft GIA, $1,792/sqft AG comp band
- 29 Barclay Drive North Haven (recent inclusion as a comp)
- Amagansett SoH non-WF NC range: $1,800–$2,200/sqft AG
- Amagansett SoH with views: $2,300–$3,500/sqft AG
- North Haven WF NC range: $1,400–$1,650/sqft AG (5 Widow Coopers $1,582)
- North Haven non-WF NC range: $1,100–$1,350/sqft AG

**Expected outputs:**

- Path A recommended exit: $7.5M base spec configuration
- Classification: market-rider (anchored within Amagansett SoH / North Haven non-WF NC closed band)

(Use this example as a regression test of the system's ability to handle multiple sub-cuts — Sag Harbor proper vs North Haven vs Amagansett — for the same project's buyer pool.)

---

## PART 3 — WHAT TO BUILD

### Three operating modes

**Mode 1 — Screening (pre-acquisition).** Used to quickly evaluate a prospect address before Juno acquires the site. Inputs: address + Google Maps link + declared plot type(s). Lighter comp pull (last 12 months sufficient), narrower sub-cut depth. Output: low/base/high range with explicit "screening confidence" flag. Run time target: under 60 seconds.

**Mode 2 — Auto-run on project creation (deep mode).** Triggered when a new project is created in Juno with an address and Google Maps link populated. Full 24-month comp pull, all sub-cuts, all reference markets, full reconciliation table support. Output persisted, surfaced on the project page, and pushed into the financial model exit price field — see integration rules below.

**Mode 3 — Re-run on demand.** Available on any project at any time. Same depth as Mode 2. Triggerable for a single project or a batch (all active projects, or a filtered set). Each re-run creates a new versioned pricing run record; prior runs remain queryable.

### Integration with the financial model — never silent

When a pricing run completes (Mode 2 or Mode 3) and produces a base case $/sqft AG, the engine pushes it to the financial model's exit price field as an **overridable input with explicit attribution**. The financial model must:

- Show the framework-derived base $/sqft AG alongside any manual override
- Flag in the UI when the override differs from the framework number by more than ±10%
- Persist the timestamp + run ID of the framework value that was applied
- Never silently overwrite a manual override on a re-run — instead, present a diff and require explicit acceptance

If the user has manually overridden the exit price, a re-run produces a new pricing run record but does NOT auto-update the financial model. It surfaces a notification: "Pricing framework re-ran on [date]; new base = $X (delta vs your override Y%). Apply?"

### Persistence — every run, fully traceable

Each pricing run persists:

- Run ID, project ID, mode (screening / auto / on-demand), trigger source (system / user), timestamp
- Comp window dates, all comps used (with NC/resale tag, closed/active status, full source link)
- Per-plot-type outputs (low/base/high, anchor comp ID, derivation prose, classification, confidence)
- Data-gap flags, triangulation reasoning
- Narrative field (broker chatter, market sentiment summary, source attributions)
- Optional reconciliation table (partner positions + verdict) if used
- User who triggered the run; user who approved (if approval workflow is in scope for v1 — your call)

Past runs are queryable per project — the project page should show a timeline / version history of pricing runs with a diff view between versions.

---

## PART 4 — ENFORCED CONSTRAINTS (non-negotiables)

These are not opinions. The engine must enforce them and refuse to produce an output that violates any of them.

1. **Closed sales and active listings never blend into a single average.** They are stored in separate fields, used for separate purposes (anchor vs ceiling), and rendered separately in any UI.

2. **Every output number traces to a named comp.** Low, base, and high each cite at least one comp by address + closing date. If no comp exists in the sub-cut (market-maker case), the triangulation source comps must be named.

3. **NC and resale comps are tagged separately.** They are never averaged together for an anchor. A resale comp may inform a market-maker triangulation but is flagged as such.

4. **Broker narrative lives in its own field, never drives the number.** The number is derived from closed evidence + judgement. Narrative supplements, never substitutes.

5. **Data gaps under 3 closed comps in a sub-cut must be flagged.** The flag surfaces in the UI; the triangulation reasoning is mandatory before an output can be saved.

6. **Market-rider vs market-maker classification is auto-derived** from the gap between base and the strongest in-sub-cut closed comp, per the thresholds in Part 1. It is not editable by the user.

7. **Pricing changes never propagate silently to the financial model.** Manual overrides are preserved; re-runs surface diffs; explicit user acceptance is required to apply a new base.

---

## PART 5 — WHAT NOT TO DO

1. **Do not automate the judgement steps.** These remain human-driven and engine-assisted:
   - Declaring the sub-cuts for a project (the engine suggests; the human commits)
   - Separating narrative from fact (the engine surfaces broker quotes with sources; the human decides what to weight)
   - The market-making call when the engine flags a wide gap (the engine classifies; the human commits to underwriting)

2. **Do not produce a single "AI number" without traceability.** No black-box pricing. Every number renders alongside its anchor comp(s) and derivation.

3. **Do not over-engineer v1.** Ship a focused build. Manual comp entry is acceptable for v1; automated comp scraping is a v2 roadmap item. A single-market config (e.g., East End Long Island) is acceptable for v1 if multi-market config is a clean v2 extension.

4. **Do not blend this feature into the financial model module.** It is its own module that feeds the financial model — see Part 6 placement question.

5. **Do not build a UI that lets users edit closed comp records inline.** Comps are reference data; they are entered/edited in a dedicated comp library, not via the pricing run UI.

---

## PART 6 — OPEN QUESTIONS YOU MUST ANSWER IN YOUR PROPOSAL

Do not skip these. Each affects scope and architecture.

1. **Comp data source strategy.** For v1, what's the entry mechanism — manual entry only, CSV import, lightweight integration with a single MLS / Compass / OutEast endpoint, or a hybrid? What's the v2 roadmap for automation, and how should v1 be structured so v2 is a clean extension rather than a rebuild?

2. **Per-market configuration model.** Sub-cuts and reference comps differ by market: North Fork has Sound-front / bayfront / inland; Shelter Island has Heights / Center / waterfront; Hamptons has SoH / NoH / village / waterfront variants. How should we model market configurations? A single per-market config record with the available sub-cuts, reference markets, and default thresholds? How does the user pick a market for a new project — geocode from the address, manual selection, or both?

3. **Versioning.** A project's pricing changes over time. How does the user see history — a timeline with diff view between any two runs? A "current" pointer? Are old runs archived after N versions? How does this interact with the financial model's persistence of which run it last applied?

4. **Autonomous vs assisted steps.** For each of the six steps in Part 1, declare in your proposal which run autonomously, which are engine-assisted (engine drafts, human approves), and which are fully human-driven. Justify each.

5. **Approval workflow.** Should a pricing run require explicit approval (e.g., from the project lead or head of research) before its base can be pushed to the financial model? Or is creation + traceability sufficient? Propose the right balance for v1.

6. **Multi-plot-type projects.** Big Bing has 7 buildable lots across 2 plot types. The output must support multiple plot-type outputs per project. How does the financial model consume a multi-plot project — does it have separate exit fields per plot type, or does the framework deliver a weighted blended $/sqft that the financial model applies uniformly? Propose the cleanest model.

---

## PART 7 — DELIVERABLE BEFORE YOU WRITE CODE

Send back, in this order:

1. **Information architecture and feature placement.** Where does the Exit Pricing Framework sit in Juno? Standalone "Pricing" top-level module? Per-project embedded tab? Both, with a screening entry point for prospects that are not yet projects? Recommend, with reasoning grounded in the existing Juno IA you read in `REVIEWER_AGENT.md` and the codebase. If you propose a parallel structure, justify it explicitly.

2. **Data model for a pricing run.** Entities, fields, relationships. Include: project, pricing run, comp record, sub-cut declaration, narrative entry, reconciliation entry, market config. Note which entities are global reference data (comps, market configs) and which are per-project / per-run.

3. **UX flow for the three modes.** A screen-by-screen walkthrough of: (a) auto-run on project creation, (b) on-demand re-run from project page, (c) screening mode entry for a prospect address. Include the financial model integration touchpoints — how the base value is presented, how the override and diff UI works.

4. **Answers to the six open questions in Part 6.**

5. **v1 scope you can ship in one focused build.** Be explicit about what's in and what's out. Identify the smallest version that delivers the framework's value end-to-end (single market, manual comp entry, multi-plot-type support, financial-model push) and defers everything else to v2.

6. **A regression test plan** that feeds the three worked examples in Part 2 through the engine and asserts the expected outputs are produced. If your design cannot reproduce them, redesign before coding.

I will review your proposal, push back where needed, and approve before code is written. Treat this as a high-signal architecture review — the framework's defensibility depends on the engine implementing it correctly. Do not start writing code until I have explicitly approved your proposal.
