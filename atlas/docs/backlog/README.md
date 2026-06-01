# Atlas backlog — feature specs awaiting build

Specs that aren't yet in `tickets/` because they're either pending
proposal/approval, deferred to v2, or both.

Specs in this folder are **source-of-truth** for their feature — do
not paraphrase or "improve" them. If something is ambiguous, file a
companion `-open-questions.md` next to the spec rather than editing
the spec itself.

## Active backlog

_Empty as of 31 May 2026 — all captured specs have graduated. New work is
tracked via D-decisions in [DECISIONS.md](../DECISIONS.md) instead of this folder._

## Graduated

| Spec                                                        | Shipped     | Resolved by                        | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------- | ----------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [Exit Pricing Framework v1](./exit-pricing-framework-v1.md) | 26 May 2026 | D-016 (commits `682dae2..78c476c`) | All 8 open questions resolved. End-to-end loop: comp library → draft run → engine pre-fills L/B/H from strongest anchor → human edits + commits → engine classifies + scores confidence → apply pushes to calc engine. 31 new tests (16 worked-example regression + 10 schema invariant + 10 engine helper + 4 multi-plot revenue + 1 hygiene). Surface 26 (`/pricing`) + Surface 27 (project Pricing tab) live. Subsequently superseded by D-025a Strategy Brief (28 May), D-025b location factors (31 May), and D-026 market-intel dashboard (29 May) — all in DECISIONS.md. |

## Conventions

- One file per spec: `<feature-slug>-vN.md`.
- Companion open-questions file: `<feature-slug>-open-questions.md`.
- The README table is the index — keep it current.
- When a spec graduates to a ticket, move the file to
  `tickets/<phase>/<TXXX>-...md` and link from this README under
  "Graduated".
