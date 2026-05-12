-- Fix: the handle_new_user trigger fires from the auth schema, which doesn't have public
-- in its search_path. That caused "type user_role does not exist" during signup.
-- Solution: explicitly qualify types and SET search_path = public on the function.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_count INT;
  new_role public.user_role;
BEGIN
  SELECT COUNT(*) INTO user_count FROM public.user_profiles;
  new_role := CASE WHEN user_count = 0 THEN 'super_admin'::public.user_role ELSE 'viewer'::public.user_role END;
  INSERT INTO public.user_profiles (id, email, display_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    new_role
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Don't block signup if profile creation fails. Log and continue.
  RAISE LOG 'handle_new_user failed for %: % (%)', NEW.email, SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_profiles WHERE id = auth.uid();
$$;
