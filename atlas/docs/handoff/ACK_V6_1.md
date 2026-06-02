# ACK — CLAUDE_CODE_INSTRUCTIONS_V6_1

```
T104–T117: I have read CLAUDE_CODE_INSTRUCTIONS_V6_1.md.
V5.2 (T093–T103) is merged at tag v5.2.0 and CI is green — confirmed.
I understand V6.1 has TWO parts:
  PART 1 (T104–T114): Platform editability + Home/Projects/Pipeline UX rebuild + StatusDot.
  PART 2 (T115–T117): Ask Juno → tool-calling agent + close PR.
I understand Part 2 depends on Part 1 — agent tools call the APIs built in Part 1.
I will not start T115 until T104, T108, and T109 are merged (the three APIs the agent calls).
I will not break the five Hard Rules (V2 §1.2 + V6.1 §3b):
  1. No removed Excel inputs
  2. No calc changes without passing golden-master test
  3. No new UI libraries — compose from ja-* primitives
  4. No stage transition without approval snapshot
  5. No write API without role check, audit log, and re-approval gate (NEW V6.1)
I understand the $10,000 low-risk threshold for Ask Juno agent auto-execute.
  Every write action with monetary impact > $10K confirms. Every batch ≥ 5 records confirms.
  Every UPDATE (not INSERT) confirms. Every action affecting a locked snapshot confirms.
I will treat the UX/UI principles in §3a + the Editability principles in §3b as non-negotiable.
I will request Viktor's approval before any stop-and-ask condition.

Signed: Claude (Opus 4.8) — 2026-06-02
```

---

## Pre-flight ground-truth (verified against repo at `a609be4`, 2026-06-02)

- HEAD `a609be4` on `main`, working tree clean. Tag `v5.2.0` present. ✓
- V5.2 closed green per `V5_2_TRACKER.md` (9/9 CI on the V5.2 close). The V6.1 staging commit `a609be4` added only a markdown doc, so CI status is logically unchanged from `v5.2.0`. _(Not re-run at HEAD — `gh` is not authenticated; flag if you want a fresh run triggered.)_
- T104 foundations all exist and match the §3b E1 pattern: `requireAuth()`→`{user,profile}`, `requireEditor(profile)` (super_admin|editor), `requireRole`/`requireSuperAdmin`/`hasRole`; `findCurrentProjectByKey`, `findLatestLockedSnapshot`, approval-snapshot repo/service; `lib/services/audit.ts` + `lib/api/withAudit.ts`.
- `PATCH /api/projects/[id]` genuinely absent (route has GET only) — T104's core deliverable is real.

## Drift flagged before coding (full detail in `V6_1_TRACKER.md` → Drift register)

Per Viktor's instruction to flag doc↔repo drift before T104 (this happened on V5.2 too):

1. **DR-1 (HIGH):** V6.1 decision IDs collide — `D-043` is already V5.2's. Shifting V6.1 to **D-044 → D-056**.
2. **DR-2 (MED):** Migrations max is `0027`; `0026`/`0028` never existed. §9's "rollout = migration 0028" is wrong (it's `0025`). V6.1 still starts new migrations at **0029** per the doc (gaps are harmless).
3. **DR-3 (MED):** `atlas.audit_log` already has `before_json`/`after_json`. Migration **0030 adds `source` only**.
4. **DR-4 (MED):** `POST /api/projects` + the `/projects/new` wizard + `createProject` + `CreateProjectSchema` **already exist and are E1-gated**. T109's create scope reduces accordingly (stage=`tbc` default, return `ProjectResult`, create-modal, audit-on-create check).
5. **DR-5 (MED, T113):** StatusDot hexes in the doc (#D4A017/#C0392B) diverge from `COLOR_TOKENS` (#a16207/#b91c1c). Awaiting Viktor's palette call; default = reuse existing tokens.
6. **DR-6 (LOW for Part 1):** §9 numbers — KPC LOC ✅, NPAT $8M ✅; owner↔auth linkage still 1/7 → affects **T115** only, not Part 1.

None of the above blocks the ACK. **Paused for Viktor's merge of this ACK before starting T104.**
