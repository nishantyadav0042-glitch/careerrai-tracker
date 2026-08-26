-- ── P0 SECURITY: careerrai-test had NO row-level security ───────────────────
--
-- Supabase Security Advisor raised two CRITICAL findings on careerrai-test:
--   rls_disabled_in_public     — tables publicly readable/writable
--   sensitive_columns_exposed  — sensitive columns reachable through the API
--
-- MEASURED, not assumed. The alert said "at least one table". The reality:
--
--     95 public tables
--     91 with RLS DISABLED
--     91 readable by anon        (anon holds SELECT on all 95)
--     91 writable by anon        (anon holds write grants on 92)
--
-- The anon key ships to every browser by design, so this was not a theoretical
-- exposure — anyone holding the test project URL and its public key could read,
-- rewrite or delete every row.
--
-- ── WHAT WAS ACTUALLY AT RISK: NOTHING ─────────────────────────────────────
--
-- Checked before designing anything. careerrai-test holds 31 rows in total:
--   session_intents 15 (reference taxonomy)   p6 12 (probe scratch)
--   profiles 3 ("Rep A", "Rep B", "Student One" — no email, no phone)
--   lead_outreach 1
-- auth.users holds exactly one account: hydration-probe@careerrai.test.
-- No payments, no chat, no sessions, no tokens, no real student.
-- The doors were open; there was nothing behind them.
--
-- ── AND PRODUCTION WAS NEVER AFFECTED ──────────────────────────────────────
--
-- Verified read-only, before touching test: production has RLS enabled on all
-- 94 tables, 51 default-deny, 43 with policies. Zero disabled. The finding is
-- genuinely test-only.
--
-- ── WHY THIS MIGRATION DOES NOT INVENT POLICIES ────────────────────────────
--
-- The instruction was: derive policies from the real access model, never blanket
-- them. The real access model already exists — in production, where it governs
-- 866 students today. Inventing a second interpretation of it would create
-- exactly the duplicate authority this whole audit has been eliminating.
--
-- So every policy below is REPLAYED VERBATIM from production's pg_policy, and
-- the result was verified by md5 over (table, policy, command, USING, WITH
-- CHECK) across all 98 policies:
--
--     production  47bcd7789bdec44e8913dc368fe222a8
--     test        47bcd7789bdec44e8913dc368fe222a8
--
-- The model is ownership-based throughout: students reach their own rows via
-- auth.uid(), buddies reach rows for students assigned to them, admins go
-- through is_admin(), and 51 server-only tables (server_config, security_events,
-- idempotency_keys, mentor_grants, login_attempts, otp_send_events …) carry RLS
-- with ZERO policies — default deny, reachable only by service_role.
--
-- NOTHING WAS WEAKENED. No policy was added that production does not have, no
-- grant was widened, and service_role behaviour is untouched.
--
-- ── ONE DEPENDENCY HAD TO COME FIRST ───────────────────────────────────────
--
-- 20260826g creates is_admin(uuid), which several policies call and which did
-- not exist on test. Its grants match production exactly: authenticated and
-- service_role may execute it, anon may not.
--
-- Applied to careerrai-test on 26 Aug 2026. NOT APPLIED TO PRODUCTION — every
-- object here already exists there.

do $$
declare t record;
begin
  for t in select c.relname from pg_class c join pg_namespace n on n.oid=c.relnamespace
            where n.nspname='public' and c.relkind='r' and not c.relrowsecurity
  loop
    execute format('alter table public.%I enable row level security', t.relname);
  end loop;
end $$;

-- 98 policies, replayed verbatim from production.
create policy "Admin can read audit log" on public.admin_audit_log as permissive for select to public using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = ( SELECT auth.uid() AS uid)) AND (profiles.role = 'admin'::text)))));
create policy "Buddies can read assigned students events" on public.analytics_events as permissive for select to public using ((student_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.buddy_id = ( SELECT auth.uid() AS uid)))));
create policy "Students can insert own events" on public.analytics_events as permissive for insert to public with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Student sees own brain breaks" on public.brain_break_logs as permissive for all to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "buddy reads own briefings" on public.buddy_briefings as permissive for select to public using ((( SELECT auth.uid() AS uid) = buddy_id));
create policy "buddy reads own checkin drafts" on public.buddy_checkin_drafts as permissive for select to public using ((auth.uid() = buddy_id));
create policy "Admin reads all feedback" on public.buddy_feedback as permissive for select to public using (is_admin(( SELECT auth.uid() AS uid)));
create policy "Buddy can insert feedback for their students" on public.buddy_feedback as permissive for insert to public with check ((buddy_id = ( SELECT auth.uid() AS uid)));
create policy "Can read relevant feedback" on public.buddy_feedback as permissive for select to public using (((buddy_id = ( SELECT auth.uid() AS uid)) OR (student_id = ( SELECT auth.uid() AS uid))));
create policy "Student can send voice responses" on public.buddy_feedback as permissive for insert to public with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Student reads own feedback" on public.buddy_feedback as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Student updates own received feedback" on public.buddy_feedback as permissive for update to public using ((student_id = ( SELECT auth.uid() AS uid))) with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "buddy sees own payouts" on public.buddy_payouts as permissive for select to public using ((buddy_id = ( SELECT auth.uid() AS uid)));
create policy "students insert own attempts" on public.challenge_attempts as permissive for insert to public with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "students read own attempts" on public.challenge_attempts as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "read own chat blocks" on public.chat_blocks as permissive for select to public using ((auth.uid() = blocker_id));
create policy "pair members read messages" on public.chat_messages as permissive for select to public using (((( SELECT auth.uid() AS uid) = student_id) OR (( SELECT auth.uid() AS uid) = buddy_id)));
create policy "read own chat reports" on public.chat_reports as permissive for select to public using ((auth.uid() = reporter_id));
create policy coaching_sessions_own_read on public.coaching_sessions as permissive for select to public using ((auth.uid() = student_id));
create policy "admin reads all target progress" on public.coaching_target_progress as permissive for select to public using ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text)))));
create policy "buddy reads assigned target progress" on public.coaching_target_progress as permissive for select to public using ((student_id IN ( SELECT p.id FROM profiles p WHERE (p.buddy_id = ( SELECT auth.uid() AS uid)))));
create policy "student manages own target progress" on public.coaching_target_progress as permissive for all to public using ((student_id = ( SELECT auth.uid() AS uid))) with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "students insert own reports" on public.community_reports as permissive for insert to public with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "students read own reports" on public.community_reports as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "students read live challenges" on public.daily_challenges as permissive for select to public using (((status = 'live'::text) AND (live_date IS NOT NULL)));
create policy "Anyone can read daily puzzles" on public.daily_lrdi_puzzles as permissive for select to public using (true);
create policy "Admin reads all reports" on public.daily_reports as permissive for select to public using (is_admin(( SELECT auth.uid() AS uid)));
create policy "Buddies can view assigned student reports" on public.daily_reports as permissive for select to public using ((student_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.buddy_id = ( SELECT auth.uid() AS uid)))));
create policy "Buddy reads assigned student reports" on public.daily_reports as permissive for select to public using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = daily_reports.student_id) AND (profiles.buddy_id = ( SELECT auth.uid() AS uid))))));
create policy "Student manages own reports" on public.daily_reports as permissive for all to public using ((student_id = ( SELECT auth.uid() AS uid))) with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Students can insert their own reports" on public.daily_reports as permissive for insert to public with check ((( SELECT auth.uid() AS uid) = student_id));
create policy "Students can view their own reports" on public.daily_reports as permissive for select to public using ((( SELECT auth.uid() AS uid) = student_id));
create policy "Buddies view assigned student routines" on public.daily_routines as permissive for select to public using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = daily_routines.student_id) AND (profiles.buddy_id = ( SELECT auth.uid() AS uid))))));
create policy "Students manage own routines" on public.daily_routines as permissive for all to public using ((student_id = ( SELECT auth.uid() AS uid))) with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Users can create feedback" on public.feedback as permissive for insert to public with check ((( SELECT auth.uid() AS uid) = buddy_id));
create policy "Users can view feedback about them" on public.feedback as permissive for select to public using (((( SELECT auth.uid() AS uid) = student_id) OR (( SELECT auth.uid() AS uid) = buddy_id)));
create policy "Owner reads own google tokens" on public.google_oauth_tokens as permissive for select to public using ((user_id = ( SELECT auth.uid() AS uid)));
create policy "Buddies can read assigned students attempts" on public.lrdi_puzzle_attempts as permissive for select to public using ((student_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.buddy_id = ( SELECT auth.uid() AS uid)))));
create policy "Students can insert own attempts" on public.lrdi_puzzle_attempts as permissive for insert to public with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Students can read own attempts" on public.lrdi_puzzle_attempts as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Students can update own attempts" on public.lrdi_puzzle_attempts as permissive for update to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Buddies see assigned student debriefs" on public.mock_debriefs as permissive for select to public using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = mock_debriefs.student_id) AND (profiles.buddy_id = ( SELECT auth.uid() AS uid))))));
create policy "Students see own debriefs" on public.mock_debriefs as permissive for all to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Students read own mock_drop_alerts" on public.mock_drop_alerts as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Students update own mock_drop_alerts" on public.mock_drop_alerts as permissive for update to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Users manage own notifications" on public.notifications as permissive for all to public using ((user_id = ( SELECT auth.uid() AS uid))) with check ((user_id = ( SELECT auth.uid() AS uid)));
create policy "Student reads own extensions" on public.plan_extensions as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Admin reads all profiles" on public.profiles as permissive for all to public using (is_admin(( SELECT auth.uid() AS uid)));
create policy "Buddy reads their students" on public.profiles as permissive for select to public using ((buddy_id = ( SELECT auth.uid() AS uid)));
create policy "Users can read own profile" on public.profiles as permissive for select to public using ((( SELECT auth.uid() AS uid) = id));
create policy "Users can update own profile" on public.profiles as permissive for update to public using ((( SELECT auth.uid() AS uid) = id));
create policy "Users can update their own profile" on public.profiles as permissive for update to public using ((( SELECT auth.uid() AS uid) = id));
create policy "Users can view their own profile" on public.profiles as permissive for select to public using ((( SELECT auth.uid() AS uid) = id));
create policy "admin reads all rating prompts" on public.rating_prompts as permissive for select to public using (is_admin(( SELECT auth.uid() AS uid)));
create policy "student reads own rating prompts" on public.rating_prompts as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "student reads own refund request" on public.refund_requests as permissive for select to public using ((( SELECT auth.uid() AS uid) = student_id));
create policy "Buddies view assigned student completions" on public.routine_task_completions as permissive for select to public using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = routine_task_completions.student_id) AND (profiles.buddy_id = ( SELECT auth.uid() AS uid))))));
create policy "Students manage own task completions" on public.routine_task_completions as permissive for all to public using ((student_id = ( SELECT auth.uid() AS uid))) with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Student reads own assignments" on public.session_assignments as permissive for select to public using (((student_id = ( SELECT auth.uid() AS uid)) OR (buddy_id = ( SELECT auth.uid() AS uid))));
create policy session_credits_own_read on public.session_credits as permissive for select to public using ((auth.uid() = student_id));
create policy buddy_select_assigned on public.session_requests as permissive for select to public using ((buddy_id = ( SELECT auth.uid() AS uid)));
create policy buddy_update_assigned on public.session_requests as permissive for update to public using ((buddy_id = ( SELECT auth.uid() AS uid)));
create policy student_insert_own on public.session_requests as permissive for insert to public with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy student_select_own on public.session_requests as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Buddies can read assigned students streak_data" on public.streak_data as permissive for select to public using ((student_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.buddy_id = ( SELECT auth.uid() AS uid)))));
create policy "Students can insert own streak_data" on public.streak_data as permissive for insert to public with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Students can read own streak_data" on public.streak_data as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Students can update own streak_data" on public.streak_data as permissive for update to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "student sees own payments" on public.student_payments as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "anyone reads published tips" on public.student_submissions as permissive for select to public using (((status = 'approved'::text) AND (kind = ANY (ARRAY['tip'::text, 'mistake'::text, 'shortcut'::text])) AND (published_at IS NOT NULL)));
create policy "students insert own submissions" on public.student_submissions as permissive for insert to public with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "students read own submissions" on public.student_submissions as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "students read voting items" on public.student_submissions as permissive for select to public using ((status = ANY (ARRAY['voting'::text, 'featured'::text])));
create policy "admin reads all timetables" on public.student_timetables as permissive for select to public using ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text)))));
create policy "buddy reads assigned student timetable" on public.student_timetables as permissive for select to public using ((student_id IN ( SELECT p.id FROM profiles p WHERE (p.buddy_id = ( SELECT auth.uid() AS uid)))));
create policy "student manages own timetable" on public.student_timetables as permissive for all to public using ((student_id = ( SELECT auth.uid() AS uid))) with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "admin reads all action logs" on public.study_action_log as permissive for select to public using ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text)))));
create policy "student reads own action log" on public.study_action_log as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "students insert own votes" on public.submission_votes as permissive for insert to public with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "students read own votes" on public.submission_votes as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Admin reads all test results" on public.test_results as permissive for select to public using (is_admin(( SELECT auth.uid() AS uid)));
create policy "Buddy reads assigned student test results" on public.test_results as permissive for select to public using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = test_results.student_id) AND (profiles.buddy_id = ( SELECT auth.uid() AS uid))))));
create policy "Student manages own test results" on public.test_results as permissive for all to public using ((student_id = ( SELECT auth.uid() AS uid))) with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Users can insert their own test results" on public.test_results as permissive for insert to public with check ((( SELECT auth.uid() AS uid) = student_id));
create policy "Users can view their own test results" on public.test_results as permissive for select to public using ((( SELECT auth.uid() AS uid) = student_id));
create policy "Buddies can insert todos for assigned students" on public.todo_items as permissive for insert to public with check ((student_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.buddy_id = ( SELECT auth.uid() AS uid)))));
create policy "Buddies can read assigned students todos" on public.todo_items as permissive for select to public using ((student_id IN ( SELECT profiles.id FROM profiles WHERE (profiles.buddy_id = ( SELECT auth.uid() AS uid)))));
create policy "Students can delete own todos" on public.todo_items as permissive for delete to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Students can insert own todos" on public.todo_items as permissive for insert to public with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Students can read own todos" on public.todo_items as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Students can update own todos" on public.todo_items as permissive for update to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Buddies view assigned student topic coverage" on public.topic_coverage as permissive for select to public using ((EXISTS ( SELECT 1 FROM profiles WHERE ((profiles.id = topic_coverage.student_id) AND (profiles.buddy_id = ( SELECT auth.uid() AS uid))))));
create policy "Students manage own topic coverage" on public.topic_coverage as permissive for all to public using ((student_id = ( SELECT auth.uid() AS uid))) with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "admins read all evidence" on public.topic_evidence as permissive for select to public using ((EXISTS ( SELECT 1 FROM profiles p WHERE ((p.id = ( SELECT auth.uid() AS uid)) AND (p.role = 'admin'::text)))));
create policy "students insert own evidence" on public.topic_evidence as permissive for insert to public with check ((student_id = ( SELECT auth.uid() AS uid)));
create policy "students read own evidence" on public.topic_evidence as permissive for select to public using ((student_id = ( SELECT auth.uid() AS uid)));
create policy "Session participants read" on public.video_sessions as permissive for select to public using (((student_id = ( SELECT auth.uid() AS uid)) OR (buddy_id = ( SELECT auth.uid() AS uid))));
create policy "Students view own video sessions" on public.video_sessions as permissive for select to public using (((student_id = ( SELECT auth.uid() AS uid)) OR (buddy_id = ( SELECT auth.uid() AS uid))));
