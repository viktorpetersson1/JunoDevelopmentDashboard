# V7 Tracker — The Simplification (exec dashboard reposition)

Plan: `atlas/docs/CLAUDE_CODE_INSTRUCTIONS_V7.md` · ACK: `atlas/docs/ACK_V7.md` · companion: `Juno-Atlas-Gap-Analysis-2026-07-02.md` (not in repo).

Status legend: ◻ pending · ◐ in progress · ✅ shipped · ⛔ blocked.

**Gate discipline (ACK):** Parts run strictly in order; a Part starts only when the previous Part is merged and CI is green. Part 0 starts on Viktor's explicit go (doc header = DRAFT until sign-off).

| Ticket | Scope (planned) | Pri | Mig | Status | Commit(s) | Notes / blockers |
| ------ | ---------------- | --- | --- | ------ | --------- | ----------------- |
| **§0** | ACK + this tracker | P0 | — | ◐ | _(this commit)_ | Doc + ACK_V7 + tracker landed. Deviation: direct commit to `main`, not a PR (`gh` unauthenticated; same delivery as the V6.1.5/V6.2 ACKs). Awaiting Viktor's go for Part 0. |
| **T130** | Capital-sources single source of truth — `getCapitalPosition()`, kill hardcoded fallbacks, Rule-6 empty states, seed real KPC LOC | P0 | ✔ (seed) | ◻ | | ⛔ BLOCKED-ON-VIKTOR/Melissa: confirm facility values ($6.0M / 6% capitalized / active) in the PR description before merge. |
| **T131** | Purge "Project 5–11" placeholders; seed real portfolio (6 Great Circle, 84 SBR, 540 Hands Creek, North Haven) with populated columns | P0 | ✔ (purge+seed) | ◻ | | ⛔ BLOCKED-ON-VIKTOR/Melissa: confirmed inputs + Atlas-vs-Excel reconciliation table (deltas > 2% explained). |
| **T132** | Alert hygiene — no stale ("Start by Jan 2025") or incomplete-input alerts; gate on configured state | P0 | — | ◻ | | Depends T130/T131. Playwright: zero red alerts on seeded state unless hand-verifiable. |
| **T133** | CI green ×5 pushes · single deployment (CF Pages canonical; Render decommissioned to redirect) · docs repositioned (about-atlas/README) | P0 | — | ◻ | | Part 0 exit gate. |
| **T134** | Sidebar → exactly Home · Projects · Pipeline · Ask Juno; park everything else behind ATLAS_FEATURE_FLAGS + redirects (incl. /pricing/*, /earnings, analytics lab, agent pricing tools) | P0 | — | ◻ | | Flags restore parked surfaces intact (Playwright both states). |
| **T135** | Home = company view: 4-chip boardroom strip, company cash flow, cash-requirements table (12mo), annual P&L, capital & LOC section, self-funding (collapsed) | P0 | — | ◻ | | Rule 1: every number traces to buildCashSchedule/aggregatePortfolio. Old /analytics/* → 301 anchors. |
| **T136** | Project page = 4 exec blocks (Program · Cash flow · Cash requirements · P&L), edit-assumptions drawer, tabs cut | P0 | — | ◻ | | Rule 1 cross-surface test: per-project blocks sum exactly to Home. |
| **T137** | Scenarios collapse to the topbar 3-way toggle (must actually recompute); park library/overlays/modeler | P1 | — | ◻ | | Playwright: known figure changes Base→Pessimistic. |
| **T138** | Project create/edit = one simple form (~12 fields, defaults); wizard parked | P1 | — | ◻ | | < 2 min / < 15 inputs to a running project. |
| **T139** | `atlas.opportunities` table + /pipeline ranked potential-projects list (capital-efficiency sort) + in-flight + goal tracker | P0 | ✔ | ◻ | | Jun-17 requirement verbatim: cash needed · timeline · potential profit, rankable. |
| **T140** | Opportunity research section (markdown notes, links, decision log as jsonb) + disabled "Ask Juno to draft" button | P1 | — | ◻ | | No new editor deps (Rule 3). |
| **T141** | Promote-to-project round-trip + seed live deals (72 South Ferry, Miami lot, Hudson Valley, Aspen/Carbondale, North Fork Oregon Rd passed) | P0 | ✔ (seed) | ◻ | | Seeds confirmed by Viktor in PR. |
| **T142** | Fathom ingestion — `atlas.meetings`, fathom-client, "Sync meetings" on /agent | P0 | ✔ | ◻ | | ⛔ Needs `FATHOM_API_KEY` in CF dashboard (never repo). No cron infra. |
| **T143** | Agent READ tools: list/get meetings, list/get opportunities; planner routes decision questions to meetings | P0 | — | ◻ | | Existing 5 tools regression-guarded; logs to agent_llm_calls. |
| **T144** | Meeting review → approval-gated suggestions (structured proposed_patch, evidence quotes, Home review chip, apply via same repos) | P0 | — | ◻ | | Rule 7. Max 10/run; >25% deltas flagged. Closes the dormant `applied` state generically (D-077). |
| **T145** | Pipeline research assistant — draft standardized metrics as a pre-filled form, never a direct write | P1 | — | ◻ | | Wires T140's button. |

## v7.0.0 definition of done (§2)

4-item sidebar · Rule-1 cross-surface suite green · zero unearned red alerts · real data only · reconciliation vs Melissa's master attached · cold-start exec answers the 5 questions in < 2 min · ≤ 15-min weekly upkeep scripted · CI green · one URL · docs repositioned · tag `v7.0.0` + DECISIONS entry (exec-dashboard reposition).
