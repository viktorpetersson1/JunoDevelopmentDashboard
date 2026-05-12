-- Juno Financial Dashboard — initial schema
-- Applied to project mbehvcfiakjznzqkymse on 2026-05-11.
-- Defines user roles, the single canonical financial_state row, versioned state_history,
-- and the activity_log. All RLS policies enforce role-based access server-side.

-- User roles
CREATE TYPE user_role AS ENUM ('super_admin', 'editor', 'viewer');

-- User profile (extends auth.users with role + display name)
CREATE TABLE user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  display_name TEXT,
  role user_role NOT NULL DEFAULT 'viewer',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON TABLE user_profiles IS 'Per-user profile + role. The first user to sign up is auto-promoted to super_admin.';

-- The canonical Juno financial state — single shared row
CREATE TABLE financial_state (
  id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  state JSONB NOT NULL,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  version INT NOT NULL DEFAULT 1
);

COMMENT ON TABLE financial_state IS 'The single canonical Juno financial model state. Only id=1 is allowed.';

-- Versioned snapshots — every save writes a row here
CREATE TABLE state_history (
  id BIGSERIAL PRIMARY KEY,
  state JSONB NOT NULL,
  version INT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX state_history_created_at_idx ON state_history(created_at DESC);

COMMENT ON TABLE state_history IS 'Append-only history of every state save. Older entries can be pruned by a periodic job.';

-- Activity log — every state mutation (parallel to client-side log, server-side authoritative)
CREATE TABLE activity_log (
  id BIGSERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  detail JSONB,
  user_id UUID REFERENCES auth.users(id),
  user_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX activity_log_created_at_idx ON activity_log(created_at DESC);

-- Auto-update updated_at on user_profiles
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER user_profiles_set_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Helper function to check a user's role
CREATE OR REPLACE FUNCTION current_user_role()
RETURNS user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM user_profiles WHERE id = auth.uid();
$$;

-- First-user-becomes-super-admin trigger on auth.users insert
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  user_count INT;
  new_role user_role;
BEGIN
  SELECT COUNT(*) INTO user_count FROM user_profiles;
  new_role := CASE WHEN user_count = 0 THEN 'super_admin'::user_role ELSE 'viewer'::user_role END;
  INSERT INTO user_profiles (id, email, display_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)), new_role);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Enable RLS on all tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE state_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

-- user_profiles policies
CREATE POLICY user_profiles_select ON user_profiles
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY user_profiles_update_self ON user_profiles
  FOR UPDATE USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND role = (SELECT role FROM user_profiles WHERE id = auth.uid()));

CREATE POLICY user_profiles_super_admin_update ON user_profiles
  FOR UPDATE USING (current_user_role() = 'super_admin');

CREATE POLICY user_profiles_super_admin_delete ON user_profiles
  FOR DELETE USING (current_user_role() = 'super_admin');

-- financial_state policies
CREATE POLICY financial_state_select ON financial_state
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY financial_state_update ON financial_state
  FOR UPDATE USING (current_user_role() IN ('editor', 'super_admin'))
  WITH CHECK (current_user_role() IN ('editor', 'super_admin'));

CREATE POLICY financial_state_insert ON financial_state
  FOR INSERT WITH CHECK (current_user_role() IN ('editor', 'super_admin'));

-- state_history policies
CREATE POLICY state_history_select ON state_history
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY state_history_insert ON state_history
  FOR INSERT WITH CHECK (current_user_role() IN ('editor', 'super_admin'));

CREATE POLICY state_history_super_admin_delete ON state_history
  FOR DELETE USING (current_user_role() = 'super_admin');

-- activity_log policies
CREATE POLICY activity_log_select ON activity_log
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY activity_log_insert ON activity_log
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND (user_id = auth.uid() OR user_id IS NULL));

CREATE POLICY activity_log_super_admin_delete ON activity_log
  FOR DELETE USING (current_user_role() = 'super_admin');
