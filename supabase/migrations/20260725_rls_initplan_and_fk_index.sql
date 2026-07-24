-- Applied to production 25 July 2026. Recorded here so the repo matches the DB.
--
-- 1) RLS InitPlan optimisation (Supabase linter: auth_rls_initplan, 67 warnings)
--
-- A bare auth.uid() inside an RLS policy is re-evaluated PER ROW. Wrapped as
-- (select auth.uid()) the planner hoists it into an InitPlan and evaluates it
-- ONCE per query. Identical semantics — identical rows returned — only the
-- number of function invocations changes. The cost of NOT doing this grows
-- linearly with table size, which is why it was worth doing before the student
-- base grows rather than after.
--
-- ALTER POLICY, not DROP + CREATE: a policy is never absent, not even for an
-- instant, so there is no window in which a table sits unprotected.
--
-- Idempotent: already-wrapped occurrences are masked before the replace and
-- restored after, so re-running can never nest subselects.
--
-- Verified after applying:
--   * 68 policies before, 68 after (none lost)
--   * 0 unwrapped auth.uid() remaining in USING or WITH CHECK
--   * 0 drift in cmd / permissive / roles
--   * 68/68 policies byte-identical to their originals once the wrapping is
--     normalised back out — i.e. nothing but the wrapping changed
--   * functional check: a simulated student session saw exactly its own 11
--     daily_reports rows and 0 rows belonging to another student
--
-- Rollback: public._rls_backup_20260725 holds every prior definition. The
-- inverse transform is replace('(select auth.uid())', 'auth.uid()').
DO $mig$
DECLARE
  r          record;
  new_qual   text;
  new_check  text;
  stmt       text;
  changed    int := 0;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        (qual       IS NOT NULL AND qual       LIKE '%auth.uid()%' AND qual       NOT LIKE '%SELECT auth.uid()%')
        OR
        (with_check IS NOT NULL AND with_check LIKE '%auth.uid()%' AND with_check NOT LIKE '%SELECT auth.uid()%')
      )
  LOOP
    new_qual  := r.qual;
    new_check := r.with_check;

    IF new_qual IS NOT NULL THEN
      new_qual := replace(new_qual, '( SELECT auth.uid() AS uid)', '@@W@@');
      new_qual := replace(new_qual, 'auth.uid()', '(select auth.uid())');
      new_qual := replace(new_qual, '@@W@@', '( SELECT auth.uid() AS uid)');
    END IF;

    IF new_check IS NOT NULL THEN
      new_check := replace(new_check, '( SELECT auth.uid() AS uid)', '@@W@@');
      new_check := replace(new_check, 'auth.uid()', '(select auth.uid())');
      new_check := replace(new_check, '@@W@@', '( SELECT auth.uid() AS uid)');
    END IF;

    stmt := format('ALTER POLICY %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
    IF new_qual  IS NOT NULL THEN stmt := stmt || format(' USING (%s)', new_qual); END IF;
    IF new_check IS NOT NULL THEN stmt := stmt || format(' WITH CHECK (%s)', new_check); END IF;

    EXECUTE stmt;
    changed := changed + 1;
  END LOOP;

  RAISE NOTICE 'rls_initplan: rewrote % policies', changed;
END
$mig$;

-- 2) Covering index for the mentor_grants -> buddy_id foreign key.
-- Purely additive; without it every lookup by buddy_id scans the table.
create index if not exists idx_mentor_grants_buddy_id
  on public.mentor_grants (buddy_id);

-- NOT DONE here, deliberately: the duplicate unique index on
-- coupon_redemptions. Both duplicates are constraint-backed, the table sits
-- directly in the payment path (create-order upserts a redemption row), and the
-- table is small enough that the second index costs essentially nothing today.
-- DDL on a payments table for a negligible gain is a bad trade while checkout
-- is mid-repair. Revisit once payments are confirmed healthy.
