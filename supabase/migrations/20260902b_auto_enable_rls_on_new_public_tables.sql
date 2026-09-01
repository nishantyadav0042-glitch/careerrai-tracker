-- ── Permanent protection: new public tables get RLS automatically ──────────
--
-- APPLIED TO careerrai-test (endycmkdphymmhzniaih) ON 2 SEP 2026.
-- DELIBERATELY NOT APPLIED TO PRODUCTION — see the last paragraph.
--
-- careerrai-test has now raised rls_disabled_in_public twice.
-- 20260826f_rls_parity_from_production.sql enabled RLS on the 91 tables that
-- existed on 26 Aug. 20260902a dropped `_probe`, which was created after it.
-- Fixing the tables that exist can never protect the ones a verification run
-- creates tomorrow — and this is a scratch database where creating ad-hoc
-- tables is the entire point. So the DEFAULT has to change, not the census.
--
-- Postgres has no "RLS on by default"; an event trigger is the standard way
-- to express one.
--
-- WHY THIS IS SAFE:
--   · The service role and table owners BYPASS RLS, so every app query,
--     migration and probe run behaves exactly as before.
--   · RLS with no policies denies anon/authenticated by default — the correct
--     posture for a table nobody designed access for. A table that genuinely
--     needs client access declares a policy deliberately, which is the point.
--   · Fires only on CREATE TABLE in `public`; auth, storage, realtime and
--     extensions schemas are untouched.
--   · ALTER TABLE ... ENABLE ROW LEVEL SECURITY is not a CREATE, so the
--     trigger cannot re-enter itself.
--
-- `search_path` is pinned and the function is SECURITY DEFINER so it works
-- whoever runs the CREATE, and so it does not itself trip the
-- function_search_path_mutable advisor it exists to help silence.
--
-- VERIFIED, not assumed: after applying, `create table public.
-- _rls_trigger_selftest (id int)` came out with relrowsecurity = true without
-- being asked, and was then dropped. Project state after: 100 public tables,
-- 100 RLS-enabled, 0 disabled, 0 ERROR-level advisor findings.
--
-- SCOPED TO careerrai-test DELIBERATELY. Production is already 101/101 and
-- has migration review as its control; installing a DDL event trigger there
-- is a behaviour change nobody asked for and is the founder's call, not a
-- side effect of a test-project fix.
create or replace function public.force_rls_on_new_table()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  obj record;
begin
  for obj in
    select * from pg_event_trigger_ddl_commands()
    where command_tag = 'CREATE TABLE'
      and object_type = 'table'
      and schema_name = 'public'
  loop
    if not exists (
      select 1 from pg_class c
      where c.oid = obj.objid and c.relrowsecurity
    ) then
      execute format('alter table %s enable row level security', obj.object_identity);
      raise notice 'force_rls_on_new_table: enabled RLS on %', obj.object_identity;
    end if;
  end loop;
end;
$$;

comment on function public.force_rls_on_new_table() is
  'Event-trigger function: enables RLS on every newly created table in the public schema. Added 2 Sep 2026 after careerrai-test raised rls_disabled_in_public a second time (public._probe), created after the 26 Aug parity migration. Service role and table owners bypass RLS, so app queries, migrations and probe runs are unaffected.';

drop event trigger if exists force_rls_on_new_table_trg;
create event trigger force_rls_on_new_table_trg
  on ddl_command_end
  when tag in ('CREATE TABLE')
  execute function public.force_rls_on_new_table();
