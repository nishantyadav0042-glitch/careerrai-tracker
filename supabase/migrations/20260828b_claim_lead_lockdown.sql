-- ── Incident #34, closed ────────────────────────────────────────────────────
--
-- Reported 26 Aug 2026, left OPEN deliberately: "a security fix smuggled into
-- an unrelated change is a fix nobody reviewed." This is that separate change,
-- and it belongs to the sales workstream as the incident asked.
--
-- WHAT WAS TRUE. public.claim_lead is SECURITY DEFINER — it runs with the
-- definer's rights and bypasses RLS — and PostgREST publishes every executable
-- public function at /rest/v1/rpc/<name>. Anyone holding the public anon key
-- could therefore rewrite ownership of any student lead, unauthenticated,
-- leaving no trace of who called it. lead_outreach is the sales CRM's
-- ownership table, so that is the whole pipeline: silent reassignment,
-- misdirected follow-ups, and — from 28 Aug, when sales_conversions began
-- deciding who gets paid — a lever on the attribution that feeds payroll.
--
-- ONE CORRECTION TO THE INCIDENT REPORT, from reading the live grants rather
-- than trusting the write-up. The report called the `text` overload "the worse
-- one" because it validated only that the owner string was non-empty. That
-- overload is in fact ALREADY locked to postgres + service_role and is not
-- reachable by anon at all. The exposed one is claim_lead(uuid, uuid):
--
--   claim_lead(uuid,text)  postgres=X, service_role=X                 ← safe
--   claim_lead(uuid,uuid)  PUBLIC=X, anon=X, authenticated=X, …       ← the hole
--
-- It does validate that p_owner_id is a sales or admin profile. It never
-- validates the CALLER, which is the part that matters: a stranger could not
-- invent an owner, but could hand any lead to any real rep at will.
--
-- The text overload is still dropped, exactly as the incident prescribed — it
-- has no callers (the only app caller, /api/sales/log, passes uuids) and a
-- SECURITY DEFINER function whose owner argument is free text should not
-- outlive the day someone notices it.

-- Name the roles explicitly rather than relying on PUBLIC, per Incident #33:
-- revoking from PUBLIC alone leaves direct grants to anon and authenticated
-- in place, and the function stays reachable while the diff looks like a fix.
revoke all on function public.claim_lead(uuid, uuid) from public, anon, authenticated;
grant execute on function public.claim_lead(uuid, uuid) to service_role;

drop function if exists public.claim_lead(uuid, text);

-- ── The two neighbours found by the same sweep ──────────────────────────────
--
-- The incident's own sweep named four app-owned, non-trigger, student-callable
-- functions and then reasoned only about claim_lead, because it is the one
-- that "accepts caller-controlled targets". These two take no arguments, so
-- nobody can aim them — but both are SECURITY DEFINER, both WRITE, and both
-- are executable by anon. An unauthenticated endpoint that rewrites demo
-- account state on every call is a free write amplifier; nothing in the app
-- calls either (verified by grep across src/ and supabase/), so nothing loses
-- anything by closing them.
--
-- is_admin(uuid) is the deliberate exception and stays granted to
-- authenticated. It is a READ, and RLS policies call it as the invoking user —
-- revoking it would fail every policy that depends on it, which is a much
-- larger outage than the one being prevented. The guard test carries this same
-- reasoning as a named allowance, so the exception is reviewed rather than
-- assumed.
revoke all on function public.refresh_buddy_demo_account() from public, anon, authenticated;
grant execute on function public.refresh_buddy_demo_account() to service_role;

revoke all on function public.refresh_review_account_logs() from public, anon, authenticated;
grant execute on function public.refresh_review_account_logs() to service_role;

comment on function public.claim_lead(uuid, uuid) is
  'Atomic first-writer-wins lead claim. SECURITY DEFINER, service_role ONLY — it bypasses RLS and rewrites pipeline ownership, which now decides incentive attribution (sales_conversions). Incident #34.';
