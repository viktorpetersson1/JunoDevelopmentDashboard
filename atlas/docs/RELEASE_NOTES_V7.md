# Atlas v7.0.0 — The Simplification

**Positioning (D-066 → this release):** Atlas is Juno's **executive dashboard**, not a
system of record. Melissa's Excel models remain the source of truth for project
economics; Atlas answers the exec questions fast, from real data, with ≤ 15 minutes
of upkeep per week.

Plan: `CLAUDE_CODE_INSTRUCTIONS_V7.md` · tracker: `V7_TRACKER.md` (T130–T145 all
shipped) · live: https://juno-atlas.pages.dev

## What v7 is

Four surfaces. Everything else is parked behind `ATLAS_FEATURE_FLAGS` (restorable,
never deleted):

| Surface      | What it answers                                                                                               |
| ------------ | ------------------------------------------------------------------------------------------------------------- |
| **Home**     | Cash needed & when · KPC LOC position · next capital call / distribution · annual P&L · suggestions to review |
| **Projects** | Per-project Program · Cash flow · Cash requirements · P&L (plan vs actuals) · top risks                       |
| **Pipeline** | Ranked potential deals (cash needed · timeline · potential profit) · in-flight · goal tracker                 |
| **Ask Juno** | Multi-step Q&A over projects, meetings, and deals · meeting sync + review → suggestions                       |

One number, one owner: every figure traces to `buildCashSchedule` /
`aggregatePortfolio` (Rule-1 test suite: capital-position, cash-requirements,
project-blocks-parity — all green).

## The 5 cold-start questions (< 2 minutes)

1. **How much cash do we need in the next 90 days?** → Home → Boardroom strip →
   _Cash requirement 90d_ (click → the month-by-month table).
2. **Which project needs it?** → same table's _Project draws_ column, or
   Projects → the project's _Cash requirements_ block.
3. **What's our margin per active project?** → Projects → open a project →
   _P&L_ block (NPAT + margin hero figures).
4. **Which opportunity should we chase next?** → Pipeline → _Potential projects_
   (default sort = capital efficiency; passed deals greyed at the bottom).
5. **What did we decide last Wednesday?** → Ask Juno → "What did we decide about
   \<topic\>?" (routes to the synced meeting transcripts, cites title + date).

## Weekly upkeep — the 15-minute script

| Min   | Step                                                                                                                        |
| ----- | --------------------------------------------------------------------------------------------------------------------------- |
| 0–3   | **/agent → Sync meetings** (pulls the week's Juno calls from Fathom) → **Review latest meeting**.                           |
| 3–7   | **Home → Suggestions** — approve/reject each item (evidence quote shown; approve applies through the same validated forms). |
| 7–11  | **Pipeline** — update deal statuses / next steps inline; add anything new (one small form). Promote anything that signed.   |
| 11–14 | **Projects** — for any project with news: _Edit assumptions_ drawer (target price, months); book invoices when they exist.  |
| 14–15 | **Home** — glance the strip: 90d requirement, LOC position, pending calls. Done.                                            |

No other maintenance exists: no kanban grooming, no scenario library, no pricing
refresh loop (all parked).

## Reconciliation vs Melissa's master — ⚠ [MELISSA-RECONCILE]

Atlas per-project inputs as shipped (seeded from the 17 Jun exec-meeting record +
the V7 doc — **best-known drafts, pending Melissa's confirmation**). Protocol:
in one working session, fill the _Melissa_ columns from her master, read the
_Atlas_ revenue/cost/profit off each project page's P&L block (they are pure
functions of the inputs below + globals), and explain every delta > 2% — then
correct Atlas via the edit-assumptions drawer (every edit is audited + flagged
for re-approval).

| Project (key)             | Stage            | AG/BG sqft  | Land (Atlas) | Build $/sqft (Atlas) | Target sale (Atlas) | Land (Melissa) | Build (Melissa) | Sale (Melissa) | Δ explained? |
| ------------------------- | ---------------- | ----------- | ------------ | -------------------- | ------------------- | -------------- | --------------- | -------------- | ------------ |
| 6 Great Circle (p1)       | sales            | 4,000/1,000 | $1,350,000   | $485                 | $4,850,000          |                |                 |                |              |
| 84 Sunset Beach Road (p2) | pre-construction | 5,317/2,479 | $2,200,000   | $437                 | $8,009,893          |                |                 |                |              |
| 540 Hands Creek (p4)      | permitting       | 6,200/1,300 | $1,750,000   | $470                 | $7,387,790          |                |                 |                |              |
| North Haven (p12)         | permitting       | 5,000/1,500 | $2,100,000   | $437                 | — (engine-derived)  |                |                 |                |              |

Capital: KPC Family Office LOC **$6.0M @ 6%** (atlas.capital_sources — confirm
facility terms). Opportunities seeded (72 South Ferry Rd $900k down · Miami lot
$1.4M · Hudson Valley · Aspen/Carbondale · North Fork Oregon Rd passed) — confirm
values against the meeting record.

## Open items (blocked on Viktor)

- **[MELISSA-RECONCILE]** — the table above + LOC terms + opportunity economics.
- **FATHOM_API_KEY** — set in the Cloudflare Pages dashboard (never the repo),
  then run the first live _Sync meetings_ and confirm the two most recent Juno
  Executive Meetings ingest with transcripts.
- **Scenario preset deltas** (T137) — Pessimistic build ×1.10 / sale ×0.90 /
  +100 bps / +3 mo and Optimistic ×0.95 / ×1.05 / −50 bps are code-owned defaults
  in `lib/calc/baselines.ts`; tune in one place if you want different stress.
- **Seeded test user** — unlocks the skipped authed Playwright flows (scenario
  figure-change, pipeline CRUD/promote, meeting review E2E).

## Post-release QA/QC pass (3 Jul, commits dafd273 + d43a2b0)

Full audit after tagging: fresh gates, two independent adversarial code
reviews over the whole V7 diff, Supabase advisors, dependency audit, and the
complete Playwright suite. Found + fixed:

- **Privilege escalation (critical):** the suggestions approve→apply path let
  an editor mutate capital sources (super_admin-only per D-076). Gated at the
  route (pre-transition, suggestion stays pending) AND inside the apply path.
- **DB policy:** `atlas.suggestions` UPDATE tightened from any-authenticated
  to editor+ (mig 0043) — pending patches are no longer tamperable below the
  reviewer role.
- **next 14.2.18 → 14.2.35** — clears the critical middleware authorization
  bypass (GHSA-f82v-jwr5-mffw) + 3 further Next advisories.
- **Double-approve race:** suggestion transitions are now compare-and-swap —
  concurrent approvals can never double-apply.
- 3 review findings in V7 code: a `0 || null` footgun faking a research gap
  (draft metrics), promote pre-filling cash-needed as land cost (removed —
  materially different figures), an Enter-key save race in the research panel.
- Sign-in now surfaces thrown failures (offline etc.) — previously silent.
- **Test debt:** ~9 e2e specs had rotted invisibly (CI never ran Playwright).
  All repaired; a new `e2e` CI job runs the full no-auth suite every push.
  Suite: 87 passed / 0 failed / 39 auth-skipped.

Documented for a later pass: drizzle-orm upgrade (advisory not runtime-
reachable — schema-only usage), dev-tooling advisories (playwright/esbuild/
babel), pre-existing Supabase advisor warnings (public-schema SECURITY
DEFINER fns, V4-era permissive policies, leaked-password protection off).

## Ask Juno v3 — the working pane (5 Jul)

Ask Juno is now a right-docked WORKING PANE (topbar "Ask Juno" button; content
shifts left on wide screens; conversation survives navigation + refresh via
sessionStorage; the floating bubble is gone).

What it can do:

- **Answer from live data** — projects, KPIs, pipeline deals, meetings,
  actuals (READ tools run inline in a real agentic loop, up to 10 chained
  steps per turn, cost-capped + fully ledgered in agent_llm_calls).
- **Carry out work** — update figures, create projects/opportunities, log
  actuals/risks, and **archive ("delete") a project** (new reversible
  soft-archive service). Every non-trivial write shows a confirmation card;
  Approve executes through the same validated services + audit log as the
  UI forms, and Juno KEEPS WORKING after the approval (v1 stopped dead).
  Role gates enforced server-side on every execution (editor+; viewers get
  read-only answers).
- **Ask clarifying questions** — the ask_user protocol renders 2–4 clickable
  options (with a free-text fallback), Claude-style, instead of guessing.
- **Ingest Excel/CSV** — attach .xlsx or .csv (2 MB / 500 rows); a NEW
  zero-dependency xlsx reader (ZIP + DecompressionStream — no vulnerable
  npm parsers) parses server-side into atlas.chat_attachments (mig 0044,
  owner-scoped RLS); Juno reads it via read_attachment, maps columns,
  shows before → after, and proposes the updates one confirmation at a time.

Engine fixes over v1: multi-turn loop with tools throughout (v1 allowed one
tool round-trip then went tool-less), 4096-token replies (v1: 1024),
agentModel() config (v1: stale hardcoded chain), the T143 meeting/opportunity
tools actually registered (v1's hardcoded READ list predated them), declines
feed back to the model gracefully, and the system prompt now carries the V7
positioning (D-079) instead of "Atlas replaces Excel".

## Restore switches

`ATLAS_FEATURE_FLAGS` (CSV, Cloudflare env): `pricing` · `analytics-lab` ·
`earnings` · `notifications` · `suggestions-page` · `users` · `activity` ·
`cleanup` · `pipeline-capacity` · `project-wizard`. A flag restores that surface
intact; empty = the 4-surface dashboard.
