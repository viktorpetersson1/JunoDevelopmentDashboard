-- V5.2 T096.1b: capital sources seed table (LOC + lender headroom).
-- Full ledger (rates, covenants, draw schedules) is V6.
-- KPC LOC numbers confirmed by Viktor, 2 Jun 2026: $6M limit @ 6%.

CREATE TABLE IF NOT EXISTS atlas.capital_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_kind text NOT NULL CHECK (source_kind IN ('kpc_loc', 'project_finance', 'recycled_equity')),
  source_name text NOT NULL,
  limit_usd numeric(14,2) NOT NULL,
  drawn_usd numeric(14,2) NOT NULL DEFAULT 0,
  interest_rate_pct numeric(5,3),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE atlas.capital_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY capital_sources_read ON atlas.capital_sources
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid())
  );

CREATE POLICY capital_sources_admin_write ON atlas.capital_sources
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.user_profiles p WHERE p.id = auth.uid() AND p.role IN ('super_admin'))
  );

-- Viktor-confirmed: $6M KPC family-office LOC at 6%.
INSERT INTO atlas.capital_sources (source_kind, source_name, limit_usd, drawn_usd, interest_rate_pct, notes)
VALUES ('kpc_loc', 'KPC Family Office LOC', 6000000.00, 0.00, 6.000,
        'Primary equity source — $6M limit @ 6%. Confirmed by Viktor 2 Jun 2026.');

GRANT SELECT ON atlas.capital_sources TO authenticated;
GRANT ALL ON atlas.capital_sources TO service_role;

NOTIFY pgrst, 'reload schema';
