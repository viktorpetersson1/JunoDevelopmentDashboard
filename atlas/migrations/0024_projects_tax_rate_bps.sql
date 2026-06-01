-- V5.2 T093.3 — per-project effective tax rate (basis points).
--
-- Presentation-only: the 9-line P&L (lib/finance/project-pnl.ts) applies this
-- rate to NPBT for the Summary tab + Earnings view. The calc-engine global tax
-- (D-023, atlas.globals.tax_rate_pct / tax_state_rate_pct) is unchanged —
-- Hard Rule #2. Per-project so corporate vs SPV structures can be modelled.
--
-- Stored as bps (integer) to match the atlas.projects convention (percentages
-- as basis points) + the owners.tax_rate_bps precedent — a deliberate
-- deviation from the V5.2 doc's numeric(5,2).
--
-- Column-add only; existing grants/RLS cover it. NOTIFY pgrst so PostgREST
-- picks up the new column.

alter table atlas.projects
  add column if not exists tax_rate_bps integer not null default 2500;

comment on column atlas.projects.tax_rate_bps is
  'V5.2 T093.3 - per-project effective tax rate in basis points (2500 = 25%). Presentation-only: the 9-line P&L applies this to NPBT; the calc-engine global tax (D-023) is unchanged.';

notify pgrst, 'reload schema';
