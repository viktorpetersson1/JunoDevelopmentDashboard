-- T021 — Capital call schemas (applied via Supabase MCP as `atlas_capital_calls`)

CREATE TABLE atlas.capital_calls (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         uuid        NOT NULL REFERENCES atlas.projects(id) ON DELETE RESTRICT,
  status             text        NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','partial','funded','cancelled')),
  call_number        text        NOT NULL,
  total_amount_cents bigint      NOT NULL CHECK (total_amount_cents > 0),
  issued_date        date,
  due_date           date,
  notes              text,
  is_archived        boolean     NOT NULL DEFAULT false,
  created_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_capital_calls_project_id_idx ON atlas.capital_calls(project_id);
CREATE INDEX atlas_capital_calls_status_idx     ON atlas.capital_calls(status);
CREATE UNIQUE INDEX atlas_capital_calls_call_number_unique ON atlas.capital_calls(call_number);

CREATE TABLE atlas.capital_call_owner_shares (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  capital_call_id       uuid        NOT NULL REFERENCES atlas.capital_calls(id) ON DELETE RESTRICT,
  owner_id              uuid        NOT NULL REFERENCES atlas.owners(id)        ON DELETE RESTRICT,
  share_bps_at_issuance integer     NOT NULL CHECK (share_bps_at_issuance > 0 AND share_bps_at_issuance <= 10000),
  share_amount_cents    bigint      NOT NULL CHECK (share_amount_cents > 0),
  status                text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','committed','funded')),
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_cc_shares_call_id_idx  ON atlas.capital_call_owner_shares(capital_call_id);
CREATE INDEX atlas_cc_shares_owner_id_idx ON atlas.capital_call_owner_shares(owner_id);
CREATE UNIQUE INDEX atlas_cc_shares_call_owner_unique
  ON atlas.capital_call_owner_shares(capital_call_id, owner_id);

CREATE OR REPLACE FUNCTION atlas.check_capital_call_share_sum()
RETURNS trigger AS $$
DECLARE
  expected bigint;
  actual   bigint;
  call_id  uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN call_id := OLD.capital_call_id;
  ELSE call_id := NEW.capital_call_id; END IF;

  SELECT total_amount_cents INTO expected FROM atlas.capital_calls WHERE id = call_id;
  IF expected IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(SUM(share_amount_cents), 0) INTO actual
  FROM atlas.capital_call_owner_shares WHERE capital_call_id = call_id;

  IF actual != expected THEN
    RAISE EXCEPTION 'atlas.capital_call_owner_shares: sum (%) does not match capital_calls.total_amount_cents (%) for call %', actual, expected, call_id;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql SET search_path = atlas, pg_catalog;

CREATE CONSTRAINT TRIGGER atlas_cc_shares_sum_check
  AFTER INSERT OR UPDATE OR DELETE ON atlas.capital_call_owner_shares
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION atlas.check_capital_call_share_sum();

CREATE TABLE atlas.capital_call_payments (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_share_id   uuid        NOT NULL REFERENCES atlas.capital_call_owner_shares(id) ON DELETE RESTRICT,
  amount_cents     bigint      NOT NULL CHECK (amount_cents > 0),
  received_date    date        NOT NULL,
  method           text,
  reference_number text,
  notes            text,
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX atlas_cc_payments_share_id_idx      ON atlas.capital_call_payments(owner_share_id);
CREATE INDEX atlas_cc_payments_received_date_idx ON atlas.capital_call_payments(received_date DESC);

ALTER TABLE atlas.capital_calls             ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.capital_call_owner_shares ENABLE ROW LEVEL SECURITY;
ALTER TABLE atlas.capital_call_payments     ENABLE ROW LEVEL SECURITY;

-- D-011 tier-2: owners see own shares + payments; super_admin sees all
CREATE POLICY "atlas_cc_authenticated_read_summary"
  ON atlas.capital_calls FOR SELECT TO authenticated USING (true);

CREATE POLICY "atlas_cc_shares_own_only"
  ON atlas.capital_call_owner_shares FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'super_admin')
    OR EXISTS (
      SELECT 1 FROM atlas.owners o
      JOIN auth.users u ON u.email = o.email
      WHERE o.id = capital_call_owner_shares.owner_id AND u.id = auth.uid()
    )
  );

CREATE POLICY "atlas_cc_payments_own_only"
  ON atlas.capital_call_payments FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.user_profiles WHERE id = auth.uid() AND role = 'super_admin')
    OR EXISTS (
      SELECT 1 FROM atlas.capital_call_owner_shares s
      JOIN atlas.owners o ON o.id = s.owner_id
      JOIN auth.users u ON u.email = o.email
      WHERE s.id = capital_call_payments.owner_share_id AND u.id = auth.uid()
    )
  );
