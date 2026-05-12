-- v12.2 — restricted viewer role + server-side redaction RPC.
-- viewer_basic sees project names + stages + addresses + dates, but NO financial data.
-- The financial_state.state JSON is filtered server-side via get_state_for_current_user().

-- Add the new role to the enum
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'viewer_basic' BEFORE 'viewer';

-- Helper: returns true if the calling user can see financial detail
CREATE OR REPLACE FUNCTION public.current_user_can_see_financials()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT (SELECT role FROM user_profiles WHERE id = auth.uid()) IN ('viewer', 'editor', 'super_admin');
$$;

-- The redaction RPC: returns the state, optionally stripped of money fields for viewer_basic.
-- This is the ONLY way client code should fetch state — the supabase.js client uses this RPC.
-- The financial_state table also has RLS, but the RPC layers an additional column-level filter.
CREATE OR REPLACE FUNCTION public.get_state_for_current_user()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  full_state JSONB;
  caller_role public.user_role;
  redacted_projects JSONB;
BEGIN
  SELECT state INTO full_state FROM financial_state WHERE id = 1;
  IF full_state IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT role INTO caller_role FROM user_profiles WHERE id = auth.uid();

  -- Full-access roles get everything
  IF caller_role IN ('viewer', 'editor', 'super_admin') THEN
    RETURN full_state;
  END IF;

  -- viewer_basic: strip financial detail from projects + drop globals/scenario/financial fields
  IF caller_role = 'viewer_basic' THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', p->'id',
        'name', p->'name',
        'address', p->'address',
        'stage', p->'stage',
        'status', p->'status',
        'market', p->'market',
        'start_date', p->'start_date',
        'listing_date', p->'listing_date',
        'under_contract_date', p->'under_contract_date',
        'closing_date', p->'closing_date',
        'program_months', p->'program_months'
      )
    ) INTO redacted_projects
    FROM jsonb_array_elements(full_state->'projects') AS p;

    RETURN jsonb_build_object(
      'projects', COALESCE(redacted_projects, '[]'::jsonb),
      'ui', full_state->'ui',
      'audit_log', COALESCE(full_state->'audit_log', '[]'::jsonb),
      '_redacted', true
    );
  END IF;

  -- Unknown / no role: empty
  RETURN jsonb_build_object('_redacted', true, 'projects', '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_state_for_current_user() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_user_can_see_financials() TO authenticated;
