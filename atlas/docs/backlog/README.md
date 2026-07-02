# Atlas backlog — feature specs awaiting build

Specs that aren't yet in `tickets/` because they're either pending
proposal/approval, deferred to v2, or both.

Specs in this folder are **source-of-truth** for their feature — do
not paraphrase or "improve" them. If something is ambiguous, file a
companion `-open-questions.md` next to the spec rather than editing
the spec itself.

## Active backlog

| Spec                                                                                     | Status                                   | Notes                                                                                                                                                                                                                                                                                                                                                                                         |
| ---------------------------------------------------------------------------------------- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [V6.1.5 Pricing Engine → Perplexity Sonar](./CLAUDE_CODE_INSTRUCTIONS_V6_1_5_PRICING.md) | ⏸ DEFERRED — start after `v6.2.0` ships | 7-ticket plan (T-PRC-0 → T-PRC-6) to swap the entire pricing engine off Anthropic and onto Perplexity Sonar end-to-end. Closes 4 research-layer gaps: 5-search cap, no buyer-migration thesis test, freeform triangulation, stale citations. Rebase on entry: migrations 0034/0035 → 0036/0037, decisions D-057 → D-066+. Tag `v6.1.5-pricing.0`. ~4 weeks. Source: Viktor's docx 3 Jun 2026. |

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
