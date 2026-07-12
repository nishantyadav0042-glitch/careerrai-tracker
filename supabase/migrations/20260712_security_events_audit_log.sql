-- Applied via Supabase MCP on 2026-07-12. Recorded here for repo parity.
-- Central security audit trail, written only by the service-role client
-- (src/lib/security-log.ts). RLS-on-with-no-policy = deny-all to clients.
create table if not exists public.security_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  severity text not null default 'info',   -- info | warning | critical
  user_id uuid,
  ip text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_security_events_type_time on public.security_events (event_type, created_at desc);
create index if not exists idx_security_events_time on public.security_events (created_at desc);
alter table public.security_events enable row level security;
