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

## Restore switches

`ATLAS_FEATURE_FLAGS` (CSV, Cloudflare env): `pricing` · `analytics-lab` ·
`earnings` · `notifications` · `suggestions-page` · `users` · `activity` ·
`cleanup` · `pipeline-capacity` · `project-wizard`. A flag restores that surface
intact; empty = the 4-surface dashboard.
