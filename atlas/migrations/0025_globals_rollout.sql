-- V5.2 T093.7 — Rollout Profitability Trigger config on atlas.globals.
--
-- Drives lib/finance/rollout-trigger.ts: "when must the next project START to
-- keep trailing-12-month NPAT >= the exec target?". Read by the Summary Rollout
-- block + the T096 dashboard "Rollout pacing" chip — NOT by calcProject.
--
-- target_annual_npat_usd + fixed_overhead_annual_usd are NULLABLE and ship
-- NULL — BLOCKED-ON-VIKTOR. A NULL target makes the trigger return
-- 'unconfigured' so the UI shows a "set target" prompt (no guessed numbers in
-- prod). project_time_to_npat_months defaults to 18.
--
-- Column-add only; existing grants/RLS cover it. NOTIFY pgrst.

alter table atlas.globals
  add column if not exists target_annual_npat_usd numeric(14, 2),
  add column if not exists fixed_overhead_annual_usd numeric(14, 2),
  add column if not exists project_time_to_npat_months integer not null default 18;

comment on column atlas.globals.target_annual_npat_usd is
  'V5.2 T093.7 - exec-set annual NPAT target driving the Rollout Trigger. NULL = unconfigured (UI shows "set target"); BLOCKED-ON-VIKTOR until provided.';
comment on column atlas.globals.fixed_overhead_annual_usd is
  'V5.2 T093.7 - Juno annual corporate overhead added to the NPAT target to form the rollout bar. NULL = treated as 0.';

notify pgrst, 'reload schema';
