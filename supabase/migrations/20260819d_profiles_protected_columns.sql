-- G13-A4 (B') — the client may no longer write its own authorization
--
-- THE VULNERABILITY. profiles carried an ownership-only UPDATE policy with no
-- WITH CHECK and no column scope, and authenticated held a table-wide UPDATE
-- grant. So a student could PATCH their own row and set ANY column.
--
-- The serious one is buddy_id. resolvePair() in lib/chat.ts is the
-- authorization for every chat route, and for a student it reads exactly that
-- column:
--
--     if (me.role === 'student') {
--       if (!me.buddy_id) return null;
--       return { studentId: me.id, buddyId: me.buddy_id };
--     }
--
-- There is no check that the mentor accepted, that a payment exists, or that an
-- admin assigned it. A student could therefore set buddy_id to any mentor's
-- uuid -- and mentor uuids are surfaced to unpaid students by design, in
-- recommended-buddies -- and open a chat with a real IIM mentor they never paid
-- for. It also bypasses the five-students-per-mentor cap. Same shape for
-- is_premium and the subscription columns: paid status was self-grantable.
--
-- THE FIX IS AN ALLOW-LIST BY SUBTRACTION, and that shape is deliberate.
-- Postgres column grants are allow-list only, so the safe-looking approach is
-- to enumerate the ~45 columns the client legitimately writes. That was
-- traced and IS enumerable -- but getting one wrong breaks onboarding, the
-- single most important student flow. Granting everything EXCEPT a short,
-- explicit protected set inverts the risk: an unknown column keeps today's
-- behaviour, and only the columns that actually confer authorization, money or
-- identity are removed.
--
-- WHAT STAYS CLIENT-WRITABLE, verified by tracing all 18 importers of the
-- browser Supabase client and every mutation in each: dream_colleges,
-- buddy_tour_completed, target_percentile, the setDailyHours group,
-- onboarding_* , self_report_* , the exam/college/work fields, phone,
-- syllabus_target_date, study_window(s), success_goal, and the whole buddy
-- setup group. None of the protected columns below has a client writer.
--
-- phone IS deliberately left writable: onboarding writes it. Note for a later
-- gate that admin/allowlist matches students BY phone, so a student who sets
-- their phone to a pending allowlist entry could have a buddy assigned by the
-- next admin run. That is an indirect path to the same outcome and is NOT
-- closed here -- it needs an admin-flow decision, not a permission change.
--
-- NOT IN SCOPE: resolvePair itself (unchanged -- buddy_id remains the
-- authority, it simply stops being client-writable), buddy_assignment_queue,
-- existing assignments, historical data, mentor/payment architecture.
--
-- ROLLBACK: GRANT UPDATE ON public.profiles TO authenticated;

REVOKE UPDATE ON public.profiles FROM anon, authenticated;

DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ' ORDER BY ordinal_position)
    INTO cols
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name = 'profiles'
     AND column_name NOT IN (
       -- authorization
       'id', 'role', 'buddy_id',
       -- paid status
       'is_premium', 'subscription_status', 'subscription_plan', 'subscription_renews_at',
       -- money and internal classification
       'agreed_monthly_payout', 'is_test_account',
       -- identity provenance
       'created_at'
     );
  EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', cols);
END $$;

-- streak_data: the UPDATE and INSERT policies have NO client writer at all.
-- Every browser access is `.select('*')` (useLogging). The streak is written
-- exclusively by upsert_log_and_streak, which is SECURITY DEFINER and runs as
-- its owner. Revoking costs nothing and removes a writable surface on the
-- number students are most motivated to inflate.
REVOKE INSERT, UPDATE, DELETE ON public.streak_data FROM anon, authenticated;
