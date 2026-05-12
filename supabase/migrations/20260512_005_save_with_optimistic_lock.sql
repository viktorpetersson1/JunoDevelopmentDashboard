-- v13.1 — atomic optimistic-concurrency save for financial_state.
-- The client passes the version it last saw. If it doesn't match the current version,
-- the update is rejected with a CONCURRENT_EDIT error and the client must reload + retry.

CREATE OR REPLACE FUNCTION public.save_financial_state(
  new_state JSONB,
  expected_version INT,
  description TEXT DEFAULT NULL
)
RETURNS TABLE(new_version INT, conflict BOOLEAN, server_version INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_version INT;
  caller_role public.user_role;
  caller_id UUID;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  -- Enforce role check (RLS handles this too but the explicit error is clearer)
  SELECT role INTO caller_role FROM user_profiles WHERE id = caller_id;
  IF caller_role NOT IN ('editor', 'super_admin') THEN
    RAISE EXCEPTION 'INSUFFICIENT_PERMISSION: role=% cannot edit state', caller_role;
  END IF;

  SELECT version INTO current_version FROM financial_state WHERE id = 1 FOR UPDATE;
  IF current_version IS NULL THEN
    -- First insert (no existing row)
    INSERT INTO financial_state (id, state, version, updated_by, updated_at)
    VALUES (1, new_state, 1, caller_id, now());
    INSERT INTO state_history (state, version, description, created_by)
    VALUES (new_state, 1, description, caller_id);
    RETURN QUERY SELECT 1, false, 1;
    RETURN;
  END IF;

  -- Concurrency check
  IF expected_version IS NOT NULL AND expected_version <> current_version THEN
    -- Don't write. Return the server's version so the client can resolve.
    RETURN QUERY SELECT current_version, true, current_version;
    RETURN;
  END IF;

  UPDATE financial_state
    SET state = new_state,
        version = current_version + 1,
        updated_by = caller_id,
        updated_at = now()
    WHERE id = 1;

  INSERT INTO state_history (state, version, description, created_by)
  VALUES (new_state, current_version + 1, description, caller_id);

  RETURN QUERY SELECT current_version + 1, false, current_version + 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.save_financial_state(JSONB, INT, TEXT) TO authenticated;

-- Also: extend get_state_for_current_user to return the version alongside state, so the client
-- knows what version it's working from.
CREATE OR REPLACE FUNCTION public.get_state_for_current_user()
RETURNS TABLE(state JSONB, version INT, updated_at TIMESTAMPTZ, redacted BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  full_state JSONB;
  current_version INT;
  current_updated_at TIMESTAMPTZ;
  caller_role public.user_role;
  redacted_projects JSONB;
BEGIN
  SELECT fs.state, fs.version, fs.updated_at
    INTO full_state, current_version, current_updated_at
  FROM financial_state fs WHERE fs.id = 1;
  IF full_state IS NULL THEN
    RETURN;
  END IF;

  SELECT role INTO caller_role FROM user_profiles WHERE id = auth.uid();

  IF caller_role IN ('viewer', 'editor', 'super_admin') THEN
    RETURN QUERY SELECT full_state, current_version, current_updated_at, false;
    RETURN;
  END IF;

  IF caller_role = 'viewer_basic' THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', p->'id', 'name', p->'name', 'address', p->'address',
        'stage', p->'stage', 'status', p->'status', 'market', p->'market',
        'start_date', p->'start_date', 'listing_date', p->'listing_date',
        'under_contract_date', p->'under_contract_date', 'closing_date', p->'closing_date',
        'program_months', p->'program_months'
      )
    ) INTO redacted_projects
    FROM jsonb_array_elements(full_state->'projects') AS p;

    RETURN QUERY SELECT
      jsonb_build_object(
        'projects', COALESCE(redacted_projects, '[]'::jsonb),
        'ui', full_state->'ui',
        'audit_log', COALESCE(full_state->'audit_log', '[]'::jsonb),
        '_redacted', true
      ),
      current_version,
      current_updated_at,
      true;
    RETURN;
  END IF;

  RETURN QUERY SELECT
    jsonb_build_object('_redacted', true, 'projects', '[]'::jsonb),
    0,
    now(),
    true;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_state_for_current_user() TO authenticated;
