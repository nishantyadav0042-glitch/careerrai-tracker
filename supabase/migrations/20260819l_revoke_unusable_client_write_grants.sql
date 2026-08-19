-- Client write grants revoked where RLS already denies every write
--
-- Supabase's default grants give anon and authenticated INSERT/UPDATE/DELETE on
-- essentially every table. On 60 of them RLS is ON and there is NOT ONE write
-- policy, so every such write is already refused by deny-by-default. The grant
-- is therefore unusable today -- and the only thing standing between "unusable"
-- and "any logged-in student writes this table" is that nobody has yet added a
-- permissive policy.
--
-- That is the arrangement student_payments was moved off earlier in this
-- session, for the same reason and with the same argument. This applies it to
-- the rest.
--
-- PROVABLY BEHAVIOUR-PRESERVING, which is why it is one migration and not sixty
-- decisions. The selection rule is mechanical: RLS enabled AND zero non-SELECT
-- policies. Under those two conditions a write by anon/authenticated cannot
-- succeed regardless of the grant, so removing the grant cannot change any
-- outcome. SELECT is untouched everywhere; every read policy keeps working.
--
-- service_role is NOT touched and bypasses RLS and grants alike. Spot-checked
-- the highest-volume client-driven endpoints before writing this -- client-error,
-- events/track, perf, funnel, cat-leads, install/exchange -- and every one
-- writes through lib/supabase/admin.
--
-- WHAT THIS BUYS: adding a write policy later can no longer silently open a
-- table to the browser. The grant has to be restored deliberately, in the same
-- review as the policy.
--
-- ROLLBACK: GRANT INSERT, UPDATE, DELETE ON public.<table> TO anon, authenticated;
-- No data is touched and no schema changes, so rollback is per-table and total.

REVOKE INSERT, UPDATE, DELETE ON public.admin_audit_log FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.ai_usage_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.attachment_uploads FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.buddy_assignment_queue FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.buddy_briefings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.buddy_checkin_drafts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.buddy_notes FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.buddy_payouts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cat_test_leads FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_blocks FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_messages FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.chat_reports FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.client_errors FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coaching_sessions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coupon_redemptions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coupons FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.cron_runs FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.daily_challenges FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.daily_coach_line FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.daily_lrdi_puzzles FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.decision_log FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.expedify_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.founder_outreach FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.funnel_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.google_oauth_tokens FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.idempotency_keys FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.integration_audit_log FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.lead_outreach FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.login_attempts FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.mentor_grants FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.metric_snapshots FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notification_consent_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.notification_duplicate_suppressions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.otp_send_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.perf_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.plan_extensions FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.pwa_session_handoff FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.qa_daily_plan FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.qa_topic_progress FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.recovery_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.refund_requests FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.routine_engagement_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.sales_activity FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.scholarships FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.security_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.server_config FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.session_assignments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.session_commitments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.session_credits FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.student_allowlist FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.student_channels FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.student_crm FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.student_dna FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.student_dna_history FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.student_engagement FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.student_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.student_milestones FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.study_action_log FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.timeline_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.video_sessions FROM anon, authenticated;
