-- ── Security advisor hardening, 22 Sep 2026 ────────────────────────────────
--
-- Founder: "Fix the security exposure before I send code links. All other
-- security threats also." Ships under freeze exception #2 (security).
--
-- This closes what the Supabase security advisor flags AND IS SAFE TO CLOSE.
-- What it deliberately does NOT do is the more important half of the file.
--
-- ── WHAT IS NOT DONE HERE, AND WHY ────────────────────────────────────────
--
-- 1. is_admin(uuid) IS LEFT EXECUTABLE BY `authenticated`. The advisor flags
--    it (lint 0029) and the advisor is WRONG for this database. Migration
--    20260707 already revoked it from `anon` only, on purpose, and said why:
--    four RLS policies call is_admin(auth.uid()), and an RLS policy executes
--    as the CALLING role. Revoke it from `authenticated` and every one of
--    those policies fails with "permission denied for function is_admin" —
--    which is Incident #14 verbatim. A linter that cannot see RLS policies
--    cannot be followed blind.
--
-- 2. `authenticated` KEEPS execute on the two trigger functions below. They
--    fire on writes that signed-in users legitimately make, and the cost of
--    being wrong about whether Postgres checks EXECUTE at trigger-fire time
--    is a student unable to save their profile. Revoking from `anon` gets
--    the security benefit with none of that risk: an anonymous caller is the
--    only untrusted party here, and anon writes to neither table.
--
-- 3. pg_net and btree_gist STAY in the public schema. Moving an extension
--    rewrites every dependent object; btree_gist backs exclusion constraints
--    on session scheduling. That is a migration with real blast radius and it
--    belongs in its own change, measured, not bundled into a security sweep.
--
-- 4. The 57 "RLS enabled, no policy" findings are INFO and are the CORRECT
--    state for this design: every one of those tables is reached only through
--    the server-side admin client. RLS-on-with-no-policy denies anon and
--    authenticated by default, which is exactly what is wanted. They are
--    listed as findings, not as defects.

-- ── 1 · Anonymous callers lose EXECUTE on the SECURITY DEFINER triggers ────
--
-- Both are `RETURNS trigger`, so a direct REST call raises rather than doing
-- anything — the practical exploitability is low. This is defence in depth on
-- the same class as Incident #34 (claim_lead reachable by anon), and it costs
-- nothing because anon never writes to profiles or sales_rep_config.
-- THESE TWO LINES WERE A NO-OP. Kept verbatim because the correction is the
-- lesson: `anon` never held a direct grant. Both functions carried `=X/postgres`
-- in their ACL, and an EMPTY GRANTEE MEANS PUBLIC — anon reached them by
-- inheriting from PUBLIC. Revoking from anon removed a grant that did not
-- exist, the advisor kept reporting the finding, and only re-reading the ACL
-- after the "success" showed why. 20260922d does the real revoke.
REVOKE EXECUTE ON FUNCTION public.sync_student_crm() FROM anon;
REVOKE EXECUTE ON FUNCTION public.enforce_sales_seat_cap() FROM anon;

-- ── 2 · Every function gets a fixed search_path ────────────────────────────
--
-- A SECURITY DEFINER function with a mutable search_path can be steered into
-- resolving an unqualified name against an attacker-controlled schema. Eleven
-- functions were missing it.
--
-- Applied as a LOOP rather than eleven hand-written signatures, so it also
-- catches any function added since this file was written and cannot rot into
-- a stale list — the Incident #93 failure mode, which has now bitten five
-- times in this codebase.
--
-- pg_temp is included after public: it must be LAST so a temp object can
-- never shadow a real one.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind = 'f'
      and not exists (
        select 1 from unnest(coalesce(p.proconfig, '{}')) c
        where c like 'search\_path=%'
      )
      -- EXTENSION-OWNED FUNCTIONS ARE SKIPPED. btree_gist and pg_net are
      -- installed in `public`, so their internals (gbt_int2_same and ~90
      -- siblings) sit in this namespace too. We do not own them, ALTER fails
      -- outright, and their search_path is the extension author's business.
      -- This is the "extension in public" advisor finding making itself felt:
      -- the shared namespace is exactly why this filter has to exist.
      and not exists (
        select 1 from pg_depend d
        where d.objid = p.oid and d.classid = 'pg_proc'::regclass and d.deptype = 'e'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
    raise notice 'search_path fixed: %', r.sig;
  end loop;
end $$;
