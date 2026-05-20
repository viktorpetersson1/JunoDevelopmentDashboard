# DECISIONS.md — Open questions before P0 starts

**Owner:** Viktor Petersson
**Purpose:** Lock the open decisions so Claude Code has a single source of truth from week 1. Do not start P0 until every section below has a green status.

Each decision has my recommendation, the alternatives I considered, and what's at stake. Approve, override with a different choice, or ask for more analysis.

---

## D-001 — Hosting

**Question:** Where does Juno Atlas run?

**My recommendation:** **Vercel + Neon (Postgres)**

~~Original recommendation was Vercel + Neon.~~

**RESOLVED 2026-05-20 — Viktor:** Keep existing infrastructure. This is a feature build on top of `juno-app`, not a new deployment.

| Component | What's in place | Notes |
|---|---|---|
| Web hosting | Render (`srv-d6f8uqea2pns73de8amg`) | Live at junoatlas.onrender.com |
| Database | Supabase (`bjdrpkmanxlomxmgbtjz`) | 11 tables, 13 migrations, RLS active |
| Auth | Supabase Auth | Email + password, AuthProvider, middleware |
| File storage | Supabase Storage | `avatars` bucket active |
| Repo | `C:/Dev/juno-app/` | Next.js 15, React 19, TypeScript 5, Tailwind 3.4 |

No new accounts, no new services, no migration. Build features in place.

**Status:** ✅ Resolved — keep Render + Supabase

---

## D-002 — Auth provider

**Question:** Clerk, Auth.js (NextAuth), or roll our own?

~~Original recommendation was Clerk.~~

**RESOLVED 2026-05-20 — Viktor:** Keep existing Supabase Auth. No migration.

What's already in place:
- `AuthProvider` React context (user, session, profile, signOut, refreshProfile)
- `AuthGuard` — redirect to `/` if not authenticated
- `lib/supabase/middleware.ts` — SSR auth middleware, public routes, role guards, session refresh
- Role system: `lib/roles.ts` with `canView()`, `getPageAccess()`, `ROLE_LABELS`

All new features use the existing auth layer. References to Clerk in CLAUDE.md and other handoff docs should be read as "Supabase Auth".

**Status:** ✅ Resolved — keep Supabase Auth

---

## D-003 — Domain & URL

**Question:** Where does Atlas live in the browser?

**My recommendation:** **`atlas.juno.dev`** (subdomain of existing Juno marketing site)

**Why:**
- Clear branding: this is Juno's platform, not a generic tool.
- Same registrar/DNS as the marketing site = no extra ops surface.
- `juno.dev/atlas/` (path-based) creates routing complications with Next.js basePath. Subdomain is cleaner.
- Preview deployments at `atlas-<branch>.juno.dev` (or default Vercel preview URLs).

**Alternative considered:** `juno-atlas.com` standalone. Rejected because (a) extra registration cost, (b) breaks the Juno brand association, (c) requires SSO if we ever federate with juno.dev.

**Action needed before P0:**
- Confirm Juno controls `juno.dev` DNS.
- Confirm `atlas` subdomain is unused.
- Decide who maintains DNS records (Viktor, or someone on the Juno team).

**Status:** ⏸ Deferred — not needed now. App stays at junoatlas.onrender.com.

---

## D-004 — Data residency

**Question:** US-hosted SaaS OK, or do we need EU / UAE residency?

**My recommendation:** **US-hosted is fine for year 1**

**Reasoning:**
- The data subjects are: 7 owners (mostly US-based per cap table), Juno project data (all US Hamptons / Shelter Island properties), KPS UAE construction costs in P2.
- No GDPR-protected EU residents in the user set (Lars is in Sweden but as an owner, not as a customer — GDPR is about data subjects, not service users).
- UAE has no general data residency requirement for a privately-held business operating system.
- US (Vercel + Neon US-East) is the default and cheapest.

**What I would change for year 2:**
- If Juno opens an EU sales channel or starts taking buyer leads via the public villa pages (W3.2), revisit. Likely move to Vercel EU + Neon EU.

**Open question for you:**
- Are any owners or KPS staff governed by personal data-residency requirements that I should know about (e.g. you personally hold an EU residency that imposes constraints)?

**Status:** ✅ Resolved — US confirmed. Render Oregon + Supabase us-east-1 already in place.

---

## D-005 — Excel master canonical version

**Question:** Is `Juno_Cash-flow-Forecast_20260412_MASTER.xlsx` the canonical source for the formula port?

**Verified contents (I opened the file):**
- 25 worksheets including: `Summary`, `Juno Forecast`, `Juno Opex Forecast`, `Juno`, plus per-project tabs (`Project 2 - 84 SBR`, `Project 3 - TBC`, `Project 4 - Hands Creek`, `Project 5` through `Project 11`), plus a `6 GC` tab, plus financing/construction-cost detail tabs for 84 SBR.
- ~600 distinct formulas across Summary + Juno Forecast + Project tabs.
- Key dependency chain: Project tabs feed Juno Forecast, which feeds Summary.
- Standardized project template: rows 1-50 = assumptions + P&L summary; rows 50-75 = costs; rows 75-89 = debt + equity; rows 90-112 = monthly cash flow.

**What's in scope for the port:**
- All 600+ formulas on these tabs.
- The per-project template (so adding an 11th project is a single click).
- The 6 GC superstructure-cost-per-sqft library (drives Kingshaus costs across all projects).
- Opex aggregator (`Juno Opex Forecast`).

**What's out of scope for the initial port:**
- The visual formatting (Atlas has its own UI; the spreadsheet's borders, colors, and conditional formatting are not ported).
- The legacy `Juno Forecastx` and `Juno Forecast (2)` tabs — these look like historical snapshots. **Question: do we ignore them?**
- The `Project 3x` tab — appears to be a scratch tab. **Question: ignore?**

**My recommendation:** **Approve `Juno_Cash-flow-Forecast_20260412_MASTER.xlsx` as canonical**, ignore `Juno Forecastx`, `Juno Forecast (2)`, `Project 3x` as scratch/legacy, port everything else exactly. `FORMULA_INVENTORY.md` catalogs the full port.

**Action needed:**
- Confirm canonical file is correct.
- Confirm scratch/legacy tabs can be ignored.
- Confirm we should copy the file into the repo at `tests/fixtures/excel/Juno_Cash-flow-Forecast_MASTER.xlsx` and check in (small file, fine to version).

**Status:** ⏳ Awaiting confirmation

---

## D-006 — P0 deadline

**Question:** Can we ship P0 by **17 June 2026** (4 weeks from 21 May)?

**My recommendation:** **Aim for 17 June, but accept ±1 week slip on the computation engine.**

**Why the date is tight but doable:**
- Week 1: scaffold + design system import → 1 week of focused work.
- Week 2: 34 UI surfaces from screenshots → mechanical with the design system; ~2 surfaces/day with Claude Code, 34 surfaces = ~3-4 working days. Realistic.
- Week 3: computation engine port → **this is the risk**. 600 formulas, golden-master tests for 10 projects. If anything bites, this is where.
- Week 4: auth + deploy + daily-use shakedown.

**What slips look like:**
- +3 days if Excel `EDATE` quirks bite us on month-end dates.
- +5 days if a Project tab has formula irregularities not visible in the template.
- +1 week if the comp set isn't directly portable (some cells reference broken named ranges or external links — I'd need to fully audit).

**What I would accept:**
- Atlas v1 live with **8 of 10 baseline projects** matching Excel ≤ 0.5% by 17 June, remaining 2 projects matched within +1 week.
- All 34 surfaces rendering correctly by 17 June.

**What I would not accept:**
- Skipping golden-master tests to hit the date. The computation engine is the platform. Tests are non-negotiable.

**Status:** ⏳ Awaiting your approval of the date or a counter-proposal

---

## D-007 — Pricing data source for W1.7

**Question:** Which MLS / portal feeds the comp database?

**My recommendation for v1 (W1.7.1, week 10-11):** **Manual paste + CSV bulk import** for the comp database. Defer portal API integration to a P2 backlog ticket.

**Why manual first:**
- OneKey MLS (Long Island, covers Hamptons + Shelter Island) requires broker affiliation or API licensing fees (~$500-2000/month + IDX agreement). Not a 4-week procurement.
- Streeteasy doesn't cover East End in depth.
- Zillow's official API stopped third-party access in 2021; only Zillow Premier Agents see structured data.
- Compass's MLS data is contractual, not open.

**Manual + CSV is good enough because:**
- Year 1 target: 100-300 comps in the database. A 15-field paste form for 5 comps/week is sustainable.
- The hedonic engine needs *good* data, not *fresh* data. A 6-month-old well-curated comp is better than a fresh badly-tagged one.
- Bulk CSV import handles backfill: download from a broker portal (manually), reshape, upload.

**For P2 (after year 1):**
- Decision branch: license OneKey MLS API (~$10-30k/year ongoing) vs. hire a junior researcher to maintain the comp database (1 day/week, ~$15k/year). Both are reasonable. Revisit in November 2026.

**Action needed before P0:**
- Decide: are you comfortable with manual entry for year 1, or do you want me to start the OneKey MLS licensing conversation in week 1?

**Status:** ⏳ Recommended: manual + CSV for year 1.

---

## D-008 — Cap-table & owner accounts

**Question:** What does an "owner" account in Atlas look like?

**My recommendation:**
- 7 Clerk user accounts, one per owner: Peter (38%), Lars (30%), Viktor (17%), Philip (5%), Missy (5%), Massi (2.5%), Mark (2.5%).
- Owner role: read-everything, can approve capital calls, can see drift.
- Admin role: Viktor + Peter (2 accounts). Read-everything, can edit, can commit underwriting.
- Viewer role: bookkeeper, KPS lead, broker as needed. Read summary only.
- **Ownership percentages live in a `owners` table, not in code.** Editable from Settings.

**Open question:**
- Do owners log in with their personal emails (e.g. `peter@gmail.com`) or with a Juno-issued alias (e.g. `peter@juno.dev`)? My recommendation: Juno-issued aliases for clean audit trail. Requires you / Juno IT to provision them.

**Status:** ⏳ Awaiting your call on owner email convention

---

## D-009 — Currency display

**Question:** USD primary, USD-only, or USD + EUR for KPS in P2?

**My recommendation:** **USD-only for year 1.** All financial display in USD. KPS feed (P2 W2.3) converts to USD at the data layer using a `fx_rate` table updated monthly.

**Why:**
- Juno's product is sold in USD. Owners think in USD.
- KPS construction costs come in AED, are budgeted in USD, paid in AED. The conversion already happens — just formalize it in Atlas.
- EUR display = scope creep. Defer.

**Status:** ⏳ Recommended: USD-only display.

---

## D-010 — Backup & recovery

**Question:** What's the disaster-recovery posture?

**My recommendation:**
- **Postgres:** Neon point-in-time recovery (7 days included on Launch plan; 30 days on Scale plan, $69/mo upgrade — recommended).
- **Nightly logical dump** to Vercel Blob with 90-day retention. Scripted in `scripts/backup.ts`.
- **Weekly Excel master export** of all current projects (W2.2 covers this; in the interim, manual quarterly).
- **Code:** GitHub. PR-based workflow. No special handling.

**RTO:** 2 hours (rebuild from latest snapshot).
**RPO:** 24 hours (worst case if Neon outage and last dump was last night).

For a single-tenant ops cockpit, this is more than adequate. If owners want zero data loss, we upgrade to Neon Business tier with continuous backup (+$150/mo). Not recommended for year 1.

**Status:** ⏳ Recommended: Neon Scale + nightly blob dump.

---

## D-011 — Who can read what

**Question:** Is sensitive project data (specific commit prices, owner-level capital call amounts) visible to all owners, or restricted?

**My recommendation — three tiers:**
1. **All owners see:** portfolio KPIs, project-level summaries, project-level pricing, project-level risks, project-level drift.
2. **All owners see their own capital-call amounts and history.** They do NOT see other owners' amounts by default.
3. **Admins (Viktor + Peter) see everything including per-owner capital calls.**

This matches a typical closely-held syndicate.

**Override option:** Add a per-project visibility flag — "only Peter + Viktor see this project until it goes Committed." Useful for prospect-stage deals where Peter doesn't want speculation. Surfaces in W1.6 (Sales pipeline).

**Status:** ⏳ Recommended: three-tier visibility as above.

---

## D-012 — How recurring tasks are handled in Atlas vs. real cadence

**Question:** Does Atlas replace Peter + Viktor's existing weekly call, or augment it?

**My recommendation:** **Augment, then converge.**
- **Months 1-3 (P0 + start of P1):** Atlas is a reference during the existing weekly call. Existing call structure unchanged.
- **Months 4-6 (P1 mid):** Operating Cadence surface (W1.2) becomes the agenda for the weekly call. The call still happens, but agenda = Atlas.
- **Months 7-12 (P1 end onwards):** Weekly call is replaced by *Atlas review* — open Atlas, walk through This Week, decide. Asynchronous follow-up in PR-style comments.

**Why incremental:**
- Tools that demand workflow change before proving themselves get rejected.
- Atlas earns its place by being useful first, then becomes the system.

**Action you can take:**
- Schedule a 30-min weekly Atlas review starting week 4 (post P0 deploy). Two people (you + Peter). Same time every week.

**Status:** ⏳ FYI, no decision needed unless you object.

---

## Status summary

| ID | Topic | Status | Notes |
|---|---|---|---|
| D-001 | Hosting | ✅ Resolved | Keep Render + Supabase |
| D-002 | Auth | ✅ Resolved | Keep Supabase Auth |
| D-003 | Domain | ⏸ Deferred | Not needed now |
| D-004 | Data residency (US) | ✅ Resolved | US confirmed |
| D-005 | Excel master canonical | ⏳ | Confirm file + scratch tabs |
| D-006 | P0 deadline (17 Jun) | ⏳ | Approval |
| D-007 | Pricing data source (manual v1) | ⏳ | Approval |
| D-008 | Owner email convention | ⏳ | Choice |
| D-009 | Currency (USD-only year 1) | ⏳ | Approval |
| D-010 | Backup | ⏳ | Supabase handles PITR; confirm retention |
| D-011 | Visibility tiers | ⏳ | Approval |
| D-012 | Cadence convergence | ⏳ | FYI |

**Once all 12 are resolved, the `decisions` block in `tickets/P0/T001-scaffold.md` becomes unblocked and Claude Code starts.**
