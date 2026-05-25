# Atlas backlog — feature specs awaiting build

Specs that aren't yet in `tickets/` because they're either pending
proposal/approval, deferred to v2, or both.

Specs in this folder are **source-of-truth** for their feature — do
not paraphrase or "improve" them. If something is ambiguous, file a
companion `-open-questions.md` next to the spec rather than editing
the spec itself.

## Active backlog

| Spec | Status | Captured | Owner | Notes |
|---|---|---|---|---|
| [Exit Pricing Framework v1](./exit-pricing-framework-v1.md) | Awaiting proposal | 2026-05-25 | Viktor (review) | Open questions tracked in [exit-pricing-open-questions.md](./exit-pricing-open-questions.md). New module — feeds the financial model, must not be folded into it. Three operating modes (screening / auto on project create / on-demand re-run). Three worked examples are the regression suite. No code until proposal approved. |

## Conventions

- One file per spec: `<feature-slug>-vN.md`.
- Companion open-questions file: `<feature-slug>-open-questions.md`.
- The README table is the index — keep it current.
- When a spec graduates to a ticket, move the file to
  `tickets/<phase>/<TXXX>-...md` and link from this README under
  "Graduated".
