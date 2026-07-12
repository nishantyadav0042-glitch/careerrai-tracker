-- Applied via Supabase MCP on 2026-07-12. Recorded here for repo parity.
-- Covering indexes for the two foreign keys the performance advisor flagged as
-- unindexed. Speeds cascade deletes and user-scoped lookups; safe and invisible.
create index if not exists idx_perf_events_user_id on public.perf_events (user_id);
create index if not exists idx_pwa_session_handoff_user_id on public.pwa_session_handoff (user_id);
