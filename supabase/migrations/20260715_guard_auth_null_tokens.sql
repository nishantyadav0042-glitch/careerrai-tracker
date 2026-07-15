-- Guard: prevent GoTrue "converting NULL to string is unsupported" login failures.
--
-- Background (15 Jul 2026): the Razorpay reviewer account (+919000000042) could
-- not log in — password AND OTP both failed. The auth logs showed GoTrue
-- crashing while merely *reading* the user row:
--
--   error finding user: sql: Scan error on column index 3, name
--   "confirmation_token": converting NULL to string is unsupported
--   → error_code: unexpected_failure (HTTP 500)
--
-- GoTrue scans these token columns into Go `string`s, not nullable types, so a
-- NULL (rather than the empty string it expects) makes the scan throw before it
-- can find the user or check the password. The account had been created by a
-- hand-written INSERT into auth.users that omitted these columns, leaving them
-- NULL. Normal signups are unaffected — GoTrue's own INSERTs always write '',
-- and app code creates accounts via the GoTrue admin API (admin.auth.admin
-- .createUser in api/admin/bulk-import), which is also safe. The only vector is
-- a manual/raw INSERT (dashboard SQL, an import script, a restore).
--
-- The trigger below makes the empty-string convention hold no matter who writes
-- the row. It only ever rewrites NULL -> '' and never touches a non-null value,
-- so it cannot interfere with GoTrue's real email/phone-change token flow. The
-- body is 8 cheap COALESCEs, negligible on the per-write hot path.
--
-- Note on placement: auth.users is owned by supabase_auth_admin and the
-- migration role (postgres) cannot CREATE inside the `auth` schema, but it DOES
-- hold the TRIGGER privilege on auth.users. So the function lives in `public`
-- and the trigger is attached to auth.users — the same pattern as Supabase's
-- canonical on_auth_user_created trigger.

CREATE OR REPLACE FUNCTION public.coerce_null_auth_token_columns()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.confirmation_token         := COALESCE(NEW.confirmation_token, '');
  NEW.recovery_token             := COALESCE(NEW.recovery_token, '');
  NEW.email_change_token_new     := COALESCE(NEW.email_change_token_new, '');
  NEW.email_change               := COALESCE(NEW.email_change, '');
  NEW.email_change_token_current := COALESCE(NEW.email_change_token_current, '');
  NEW.phone_change               := COALESCE(NEW.phone_change, '');
  NEW.phone_change_token         := COALESCE(NEW.phone_change_token, '');
  NEW.reauthentication_token     := COALESCE(NEW.reauthentication_token, '');
  RETURN NEW;
END;
$$;

-- GoTrue writes auth.users as supabase_auth_admin, so it must be able to run
-- the trigger function.
GRANT EXECUTE ON FUNCTION public.coerce_null_auth_token_columns() TO supabase_auth_admin;

DROP TRIGGER IF EXISTS coerce_null_tokens_before_write ON auth.users;
CREATE TRIGGER coerce_null_tokens_before_write
  BEFORE INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.coerce_null_auth_token_columns();

-- Backfill any rows already carrying NULLs (idempotent; only the reviewer
-- account matched at authoring time, but this keeps the migration self-contained
-- so a fresh restore is repaired too).
UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change               = COALESCE(email_change, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  phone_change               = COALESCE(phone_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE confirmation_token IS NULL OR recovery_token IS NULL OR email_change_token_new IS NULL
   OR email_change IS NULL OR email_change_token_current IS NULL OR phone_change IS NULL
   OR phone_change_token IS NULL OR reauthentication_token IS NULL;
