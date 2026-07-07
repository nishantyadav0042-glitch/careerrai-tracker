-- Pre-launch security hardening from Supabase's own advisor scan.
--
-- 1. Pin search_path on every function the linter flagged as mutable. A
--    SECURITY DEFINER function with no fixed search_path can be tricked by
--    an attacker-controlled search_path into resolving an unqualified
--    identifier to a malicious object instead of the intended one
--    (classic Postgres search_path hijack). None of these were actually
--    exploited here, but it's a one-line fix with zero behavior change.
--
-- 2. Revoke anon/authenticated EXECUTE on functions that should only ever
--    run server-side via the service-role admin client:
--      - refresh_demo_dates(): was callable by literally anyone with the
--        public anon key at /rest/v1/rpc/refresh_demo_dates, bypassing the
--        CRON_SECRET check the app's own /api/cron/refresh-demo route
--        enforces. Low real damage (it only touches the demo account) but
--        needless public write surface with no reason to exist.
--      - increment_buddy_cta() / increment_coupon_use(): only ever called
--        from admin.rpc() in server routes; no client ever calls them
--        directly, so public EXECUTE was unused surface.
--      - is_admin(): revoked from anon only (not authenticated) — four RLS
--        policies (profiles, daily_reports, buddy_feedback, test_results)
--        call is_admin(auth.uid()) and need `authenticated` to keep
--        EXECUTE for those to keep working. Anon has no such dependency;
--        anon access only let an unauthenticated caller enumerate which
--        arbitrary UUIDs are admins.
--    handle_new_user() and rls_auto_enable() are left alone: they're a
--    trigger and an event-trigger function respectively (RETURNS trigger /
--    event_trigger), which PostgREST cannot actually invoke via RPC
--    regardless of grants — the advisor flags them generically but they're
--    not real callable surface.

ALTER FUNCTION public.set_updated_at() SET search_path = public;
ALTER FUNCTION public.handle_new_user() SET search_path = public;
ALTER FUNCTION public.is_admin(uuid) SET search_path = public;
ALTER FUNCTION public.upsert_log_and_streak(uuid, date, integer, text[], text, boolean, text, text[]) SET search_path = public;
ALTER FUNCTION public.activate_payment(uuid, uuid, text, timestamptz, text, text) SET search_path = public;
ALTER FUNCTION public.increment_buddy_cta(uuid) SET search_path = public;
ALTER FUNCTION public.guard_privileged_profile_columns() SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.refresh_demo_dates() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_buddy_cta(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_coupon_use(uuid) FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_admin(uuid) FROM anon;

-- 3. Missing covering indexes on foreign keys, from the advisor's
--    unindexed_foreign_keys check. chat_messages is the one on a real
--    student-facing hot path (every buddy chat load filters by these);
--    the rest are cheap, zero-downside inserts even if low-traffic today.
CREATE INDEX IF NOT EXISTS idx_chat_messages_buddy_id ON public.chat_messages (buddy_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender_id ON public.chat_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_buddy_assignment_queue_assigned_buddy_id ON public.buddy_assignment_queue (assigned_buddy_id);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_payment_id ON public.coupon_redemptions (payment_id);
CREATE INDEX IF NOT EXISTS idx_coupons_created_by ON public.coupons (created_by);
CREATE INDEX IF NOT EXISTS idx_profiles_shadow_rival_id ON public.profiles (shadow_rival_id);
CREATE INDEX IF NOT EXISTS idx_scholarships_granted_by ON public.scholarships (granted_by);
CREATE INDEX IF NOT EXISTS idx_student_allowlist_added_by ON public.student_allowlist (added_by);
CREATE INDEX IF NOT EXISTS idx_student_allowlist_assigned_buddy_id ON public.student_allowlist (assigned_buddy_id);
