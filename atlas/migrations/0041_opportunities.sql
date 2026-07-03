-- 0041_opportunities.sql — V7 T139/T140/T141: the standardized deal sheet.
-- Applied via Supabase MCP (project mbehvcfiakjznzqkymse) on 2 Jul 2026; this
-- file mirrors what was applied, for git history.
--
-- T139: atlas.opportunities — every potential deal carries the same exec
--       metrics (cash needed · timeline · expected profit), rankable.
-- T140: research jsonb on the row (notes_md, links[], decision_log[]) — no
--       new tables.
-- T141: seed the 5 real deals from the 17 Jun exec meeting record (values
--       best-known from the V7 doc; Viktor confirms — [MELISSA-RECONCILE]).
--       Unknown numbers stay NULL (Rule 6: empty ≠ zero, never $0-as-fact).
--
-- House convention (0015/0016/0036/0039): authenticated read, service_role
-- write; RLS enabled; NOTIFY pgrst at the end.

CREATE TABLE atlas.opportunities (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                 text NOT NULL CHECK (length(name) BETWEEN 1 AND 160),
  market               text,
  status               text NOT NULL DEFAULT 'researching' CHECK (status IN
                         ('researching','contacted','negotiating','passed','promoted')),
  owner_name           text,
  cash_needed_usd      numeric(14,2),
  timeline_months      int CHECK (timeline_months IS NULL OR timeline_months BETWEEN 0 AND 240),
  expected_profit_usd  numeric(14,2),
  expected_margin_pct  numeric(6,3),
  next_step            text,
  next_step_owner      text,
  notes                text,
  source               text,
  -- T140 research record: { notes_md: text, links: [{label,url}], decision_log: [{date,note}] }
  research             jsonb NOT NULL DEFAULT '{}'::jsonb,
  promoted_project_id  uuid REFERENCES atlas.projects(id) ON DELETE SET NULL,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX opportunities_status_idx ON atlas.opportunities (status, created_at);

GRANT SELECT ON atlas.opportunities TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.opportunities TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON atlas.opportunities TO postgres;

ALTER TABLE atlas.opportunities ENABLE ROW LEVEL SECURITY;

-- Pipeline deals are portfolio-level (no per-owner splits) — any
-- authenticated role may read; writes go through the service role (routes
-- enforce editor+).
CREATE POLICY opportunities_read ON atlas.opportunities FOR SELECT TO authenticated
USING (true);

-- ── T141 seeds — 17 Jun 2026 exec meeting record ─────────────────────────────

INSERT INTO atlas.opportunities
  (name, market, status, owner_name, cash_needed_usd, timeline_months,
   expected_profit_usd, expected_margin_pct, next_step, next_step_owner, notes, source)
VALUES
  ('72 South Ferry Rd', 'shelter_island', 'negotiating', 'Viktor',
   900000, NULL, NULL, NULL,
   'Finalize contract-now / design-permit / close-later structure with Siegel',
   'Viktor',
   'Structure: ~$900k down + ~$800k seller note at 6–7%. Contract now, design + permit during the note period, close later.',
   'Exec meeting 17 Jun 2026'),
  ('Miami lot', 'miami', 'researching', 'Lucas',
   1400000, NULL, NULL, NULL,
   'Validate off-market pricing vs comparable lot sales',
   'Lucas',
   '~$1.4M off-market lot. Early diligence.',
   'Exec meeting 17 Jun 2026'),
  ('Hudson Valley', 'hudson_valley', 'researching', 'Lucas/Viktor',
   NULL, NULL, NULL, NULL,
   'Define the estate-segment thesis + first target list',
   'Lucas',
   'Estate segment exploration.',
   'Exec meeting 17 Jun 2026'),
  ('Aspen / Carbondale', 'aspen_carbondale', 'researching', 'Lucas',
   NULL, NULL, NULL, NULL,
   'Scope the market: price bands, hold periods, build costs',
   'Lucas',
   'Early market exploration.',
   'Exec meeting 17 Jun 2026'),
  ('North Fork Oregon Rd', 'north_fork', 'passed', 'Viktor',
   NULL, NULL, NULL, NULL,
   NULL, NULL,
   'PASSED — seller price based on future appreciation. Kept for the record.',
   'Exec meeting 17 Jun 2026');

NOTIFY pgrst, 'reload schema';
