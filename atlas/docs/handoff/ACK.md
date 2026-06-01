# T080-v3 — Acknowledgment

T080-v3 ACK: I have read CLAUDE_CODE_INSTRUCTIONS_V3.md.
I will not open any new feature ticket until T080–T087 are shipped,
verified against Viktor's checklist in section 3, and merged.
I will not violate the safety rules in section 1.

Signed: Claude Opus 4.7 (1M context) — 2026-05-26 12:39 +04

---

## Pre-start clarifying questions (non-blocking)

Surfacing these now so Viktor can answer alongside the merge of this PR.
None of them affect T080 itself; flagged so they're resolved before the
tickets that depend on them start.

1. **Canonical post-login surface (T081.3 + T085.1 default)** —
   the doc says "`/dashboard` or `/projects` — pick one and document as
   D-013." Atlas today routes the post-login user to `/` which renders
   the Overview dashboard. There is no `/dashboard` URL. Options:

   - **(a)** Create a `/dashboard` route as the canonical home (small
     refactor — Overview moves from `/` to `/dashboard`, `/` becomes a
     redirect helper).
   - **(b)** Keep the Overview at `/` and use `/` as the canonical
     post-login target. The safe-redirect allowlist gets `"/"` instead
     of `"/dashboard"`.
     Default if no answer: **(a)** — matches what every example in the
     doc assumes (`/sign-in?redirectTo=/dashboard`).

2. **`/api/health/detailed` auth gate (T084.2)** — the doc says "behind
   auth at `/api/health/detailed`." Two readings:

   - **(a)** Any authenticated user (Viktor's role gates apply).
   - **(b)** super_admin only (since commit SHA + build env are admin
     diagnostics, not user data).
     Default if no answer: **(b)** super_admin only — more conservative
     for a healthcheck-detail endpoint.

3. **Allowlist coverage for `/cashflow` (T085.1)** — the doc lists
   `/cashflow` in the allowlist but Atlas's current Forecast sidebar
   entry points at `/cashflow`. Confirming this is the intended target,
   not a legacy slug to drop. Default if no answer: **leave as-is** per
   doc.

I will start T080.1 once this PR is merged (per §6). I will not start
T081/T084/T085 until questions 1-2 are answered (per §7).
