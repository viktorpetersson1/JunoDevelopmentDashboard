-- V6.2 T118 — Extend atlas.capital_sources from V5.2 seed shape to a versioned ledger.
--
-- V5.2 (mig 0027) created the seed table with limit/drawn/rate/notes only. V6.2
-- adds covenants, draw windows, priority ordering, and the versioning model
-- mirroring atlas.projects (is_current + is_archived + version + created_by).
--
-- Additive-only; existing single KPC LOC seed row gets defaults that match its
-- current behaviour (covenants null = "no covenant enforced", priority 0).

ALTER TABLE atlas.capital_sources
  ADD COLUMN IF NOT EXISTS covenant_max_ltc_pct           numeric(5,3),
  ADD COLUMN IF NOT EXISTS covenant_max_concurrent_projects integer,
  ADD COLUMN IF NOT EXISTS draw_window_start_date         date,
  ADD COLUMN IF NOT EXISTS draw_window_end_date           date,
  ADD COLUMN IF NOT EXISTS priority_order                 integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version                        integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS is_current                     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_archived                    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS created_by                     uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Partial unique index — only one current+non-archived row per source_kind.
-- Mirrors the projects table pattern (atlas_projects_current_unique).
-- Note: this allows multiple distinct sources of the same kind only if all
-- non-current versions are archived. For now KPC has one row per kind. When
-- Harrison Senior lands, source_kind=project_finance + a unique name.
CREATE UNIQUE INDEX IF NOT EXISTS atlas_capital_sources_kind_current_unique
  ON atlas.capital_sources(source_kind, source_name)
  WHERE is_current = true AND is_archived = false;

-- Priority order is a stable sort key for the funding stack — lower = drawn first.
CREATE INDEX IF NOT EXISTS atlas_capital_sources_priority_idx
  ON atlas.capital_sources(priority_order)
  WHERE is_current = true AND is_archived = false;

-- Reload PostgREST so the new columns are immediately selectable.
NOTIFY pgrst, 'reload schema';
