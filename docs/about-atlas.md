# About Juno Atlas

Plain-English copy that explains what Atlas is, who it's for, and what it does
to improve Juno. Three lengths — pick the one that fits the moment.

---

## One-liner

> **Juno Atlas** is the development operating system Juno uses to run the business end-to-end — sourcing villas, underwriting deals, orchestrating capital, tracking actuals, and closing sales — all in one dashboard.

---

## Short paragraph

> Juno Atlas is the system of record for Juno's development pipeline. Built as a daily-driver dashboard for Viktor and Missy, with full owner access for the other partners, it replaces the 27-sheet Excel model that used to live on a single laptop. Atlas models Juno's actual capital structure — senior debt from external lenders (e.g. Harrison Capital on 84 SBR), KPC's $6M family line of credit, and the 7-owner cap table — and surfaces the decisions that matter: how much capital is needed and when, where the funding gaps appear, what the project-level returns look like under different scenarios, and how each owner's distribution shakes out at sale.

---

## Long write-up

### What is Juno Atlas?

Juno Atlas is the operating dashboard for Juno's villa-development pipeline. It is the **system of record** as of 2026-05-10 — the place where every project, assumption, scenario, actual, and sale event lives. Excel is archived.

It lives at **https://juno-dashboard.onrender.com** and is accessed by the team via standard email + password sign-in.

### Who is it for?

| Role | Who | What they use it for |
|---|---|---|
| **Daily drivers** | Viktor, Missy | Sourcing new projects, running scenarios, monitoring risk, deciding on capital deployment |
| **Owners** | Peter, Lars, Philip, Massi, Mark | Quarterly visibility into pipeline health, individual profit-share exposure, and capital-call timing |
| **Operations partners** | Merlin, Bharat | Configuration, technical support, data integrity |

### What it does

The platform covers the full lifecycle of a Juno development:

- **Sourcing.** A 7-step wizard creates a project in under two minutes with sensible defaults and a live KPI preview before commit. Quick-start templates for *spec home*, *ground-up*, and *renovation* archetypes.
- **Underwriting.** Every assumption editable in plain business language — land cost, build $/sqft, villa size (above-ground + below-ground split), program duration broken into sourcing → permitting → construction → sales phases, and external-lender financing terms modeled directly from the Excel "Financing 84SB" tab structure (LTV, origination, exit fee, interest reserve, closing costs).
- **Capital orchestration.** The KPC $6M line of credit modeled as a distinct debt tier with capitalized 6% interest. Drawdown curve, available capacity, and funding-gap detection across the entire pipeline. Owner cap-table view shows pro-rata exposure when the LOC is exhausted.
- **Risk monitoring.** Six risk categories — sales delay, sale-price downside, cost overrun, lender rejection, equity clustering, funding gap — continuously evaluated with severity, financial impact, and suggested mitigation.
- **Scenario management.** Duplicate, classify (base / lender / upside / downside / custom), edit only what changes, lock one as the canonical decision. Variance drivers panel explains *why* each scenario differs from base.
- **Operating reality.** Per-project actuals entry with variance flags (on-budget → way over), contingency burn tracking, full audit log of every edit.
- **Selling.** Lifecycle bar (listed → under contract → closed), price-realization tracking, and a sale waterfall that walks gross proceeds through senior debt repayment, KPC LOC repayment with accrued interest, and the 7-way pro-rata owner distribution.
- **Ask Juno.** An LLM assistant that answers questions about the pipeline using only the data the user has access to. Surfaces contextual nudges based on current portfolio state (e.g. *"Walk me through the funding gap"* when the LOC is over-drawn).

### How Atlas improves Juno

| Improvement | What it replaces |
|---|---|
| **One source of truth** | "Send me the latest version" emails |
| **2-minute project creation** | An hour of spreadsheet copy-paste |
| **Early risk surfacing** | Discovering a funding gap during the deal |
| **Decision-grade scenarios** | "Base case FINAL v3 (Viktor's edits).xlsx" |
| **Owner visibility** | Quarterly PDFs and follow-up calls |
| **Audit trail** | Lost institutional memory |

### What it does not do (yet)

- Multi-currency (USD-only for now)
- Operational workflow (RFIs, change-order approvals, daily contractor status)
- Bank covenant tracking (DSCR / LTV monitoring)
- Itemized closing-cost line entry (currently captured as a lump sum)
