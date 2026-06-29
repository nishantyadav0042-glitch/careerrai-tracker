-- SECURITY FIX (critical): the profiles "Users can update own profile" RLS policy
-- (USING auth.uid()=id, no column restriction) plus the default table-level UPDATE
-- grant let any authenticated user set their own role='admin' (privilege
-- escalation → full admin panel) or is_premium=true (freemium paywall bypass)
-- directly via the Supabase REST API. RLS cannot restrict columns, and a
-- column-level REVOKE is overridden by the table-level grant — so enforce it with
-- a BEFORE UPDATE trigger. The service-role server and DB admins bypass it; client
-- roles (authenticated/anon) cannot change any privileged column. Onboarding /
-- goal / settings writes touch only non-privileged columns and are unaffected.
CREATE OR REPLACE FUNCTION public.guard_privileged_profile_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN NEW;
  END IF;
  IF NEW.role                   IS DISTINCT FROM OLD.role
     OR NEW.is_premium          IS DISTINCT FROM OLD.is_premium
     OR NEW.is_demo             IS DISTINCT FROM OLD.is_demo
     OR NEW.premium_since       IS DISTINCT FROM OLD.premium_since
     OR NEW.subscription_status IS DISTINCT FROM OLD.subscription_status
     OR NEW.subscription_plan   IS DISTINCT FROM OLD.subscription_plan
     OR NEW.subscription_renews_at IS DISTINCT FROM OLD.subscription_renews_at
     OR NEW.signup_source       IS DISTINCT FROM OLD.signup_source
     OR NEW.buddy_id            IS DISTINCT FROM OLD.buddy_id
     OR NEW.password_set        IS DISTINCT FROM OLD.password_set
  THEN
    RAISE EXCEPTION 'Modifying privileged profile columns is not allowed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_privileged_profile_columns ON public.profiles;
CREATE TRIGGER guard_privileged_profile_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_privileged_profile_columns();
