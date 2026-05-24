# T000 — ACK ticket

**Goal:** Acknowledge I have read CLAUDE.md and SUPABASE_TRANSLATION.md, and will not break the 4 Hard Rules.

## ACK

I have read:

- `docs/handoff/CLAUDE.md` (codebase contract)
- `docs/handoff/SUPABASE_TRANSLATION.md` (stack overrides)
- `docs/handoff/P0_TICKETS.md` (work plan)
- `docs/handoff/DECISIONS.md` (resolved + open D- decisions)

I will not break the 4 Hard Rules (CLAUDE.md §2):

1. **Never remove or rename an input field** that exists in `design-system/INVENTORY.md` or `public/engine.js` (Excel master replaced per SUPABASE_TRANSLATION.md §4).
2. **Never change a formula** without a logged entry in `docs/formula-changes.md` and a passing golden test against `vanilla-snapshots/*.json` at ≤0.5% tolerance.
3. **Never introduce a third-party UI library** beyond what shipped in the design system. No shadcn additions, no Radix beyond what's already used, no charting library other than Recharts.
4. **Never bypass the approval-snapshot mechanism** once W1.5 ships.

Acknowledged 2026-05-21.

## Done-when

- [x] This file committed to `main`
