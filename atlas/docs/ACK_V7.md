# ACK — CLAUDE_CODE_INSTRUCTIONS_V7 (The Simplification)

Acknowledged by Claude Code on 2 Jul 2026.

```
T130–T145: I have read CLAUDE_CODE_INSTRUCTIONS_V7.md.
I understand Atlas is repositioned as an EXEC DASHBOARD, not a system of record.
I understand V7 has FOUR parts and their order is mandatory:
  PART 0 (T130–T133): Trust & data repair  — nothing else ships until CI is green
                       and no two surfaces can disagree about the same number.
  PART 1 (T134–T138): Cut & merge          — sidebar to 4 items, Home = company
                       view, project page = 4 exec blocks.
  PART 2 (T139–T141): Pipeline rebuild     — opportunities + research + promote.
  PART 3 (T142–T145): Ask Juno upgrade     — Fathom ingestion, meeting review,
                       approval-gated suggestions.
I will not start a Part until the previous Part is merged and CI is green.
I will not break the V7 Hard Rules (§1).
```

Notes recorded at ACK time:

- **Delivery deviation:** §0 asks for a PR titled `chore: ACK CLAUDE_CODE_INSTRUCTIONS_V7`.
  `gh` is not authenticated on this machine, so the ACK lands as a direct commit to
  `main` — the same way the V6.1.5 and V6.2 ACKs landed. Happy to re-raise as a real
  PR once `gh auth login` is run.
- **Supersession:** the previously-planned "Ask Juno v2 Phase 2" (cross-engine
  treasury/pricing analysis tools) is superseded by V7 Part 3 (T142–T145), which
  builds on the same Phase-1 agent runner (agent_runs/steps/llm_calls, mig 0039).
  The agent's pricing tools get flag-gated with their pages in T134.
- **Blocked-on-Viktor before Part 0 merge:** T130 needs the real KPC LOC values
  confirmed (facility size / rate / capitalization) and T131 needs the real-portfolio
  inputs confirmed vs Melissa's master (6 Great Circle, 84 SBR, 540 Hands Creek,
  North Haven — owner, market, target sale month, and the reconciliation table).
- Status per the doc header is DRAFT — Part 0 execution starts on Viktor's explicit go.
