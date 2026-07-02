# About Juno Atlas

Plain-English copy that explains what Atlas is, who it's for, and what it does.
Repositioned by V7 (2 Jul 2026) — the earlier "system of record / Excel is
archived" framing is retired.

---

## The positioning (V7, verbatim)

> **Atlas is an executive dashboard.** Melissa's financial models and Juno's finance systems remain the source of truth. Atlas presents the numbers the exec team needs to run the business at exec level, and must stay current on ≤15 minutes of upkeep per week. It is not an ERP, not an operational PM tool, and not a fund-administration platform.

---

## One-liner

> **Juno Atlas** is Juno's executive dashboard — the numbers the exec team needs to run the business, current on fifteen minutes of upkeep a week.

---

## Short paragraph

> Juno Atlas presents Juno's development business at exec level: company cash flow and cash requirements (next 90 days and next 12 months), per-project program / cash flow / P&L, the KPC LOC position, and a ranked pipeline of potential deals with standardized key metrics. Melissa's financial models remain the source of truth — Atlas is the weekly meeting's shared screen, not a replacement for the models behind it. An intelligence layer (Ask Juno) answers questions over the portfolio and reviews meeting transcripts, proposing data updates that a human approves before anything changes.

---

## The four surfaces

| Surface      | Job                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------- |
| **Home**     | Juno company view: performance, aggregate cash flow, cash requirements (90d + 12m), aggregate P&L, capital/LOC position      |
| **Projects** | Run each project at exec level: Program · Cash flow · Cash requirements · P&L — one page, four blocks, rolls up into Home    |
| **Pipeline** | Drive new projects: ranked potential-project list with standardized key metrics + a research section per opportunity         |
| **Ask Juno** | Intelligence layer: Q&A over the portfolio, meeting-transcript review with approval-gated change suggestions, deal research  |

Everything beyond these four is parked behind feature flags — retained in code,
hidden from navigation — and can be re-enabled for demos.

## Who is it for?

| Role              | Who                              | What they use it for                                                       |
| ----------------- | -------------------------------- | -------------------------------------------------------------------------- |
| **Exec team**     | Viktor, Peter, Lars, Missy       | The weekly numbers: cash needs, project status, margins, pipeline ranking  |
| **Daily drivers** | Viktor, Missy                    | Keeping inputs current (≤15 min/week), running the pipeline, Ask Juno      |
| **Owners**        | Philip, Massi, Mark              | Visibility into pipeline health and distribution timing                     |

## Principles (V7 hard rules, abridged)

- **One aggregator, many renderers.** No two surfaces may compute the same number differently.
- **Empty ≠ zero.** An unconfigured data source renders an explicit empty state — never $0, never a derived red alert.
- **Suggestions are never auto-applied.** Ask Juno proposes; a human approves; only then does data change.
- **The 15-minute rule.** If weekly upkeep exceeds ~15 minutes, the design is wrong.

## Where it runs

**https://juno-atlas.pages.dev** (Cloudflare Pages — the canonical and only
deployment; the legacy Render address redirects here). Sign-in is standard
email + password.

## What it deliberately is not

Not an ERP. Not an operational project-management tool (no RFIs, change orders,
or schedules-of-values). Not a fund-administration platform. Not multi-currency.
The financial source of truth is Melissa's model set; Atlas reconciles to it and
presents it.
