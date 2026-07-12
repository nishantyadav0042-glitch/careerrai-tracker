-- Applied via Supabase MCP on 2026-07-12. Recorded here for repo parity.
-- Anonymous pre-signup funnel: which /start onboarding screen each visitor (anon
-- cookie id) reaches, so we can see WHERE they drop off before creating an
-- account. Written only by the service-role client (public /api/funnel endpoint);
-- RLS-on-no-policy = deny-all to clients.
create table if not exists public.funnel_events (
  id bigint generated always as identity primary key,
  anon_id text,
  step text not null,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_funnel_events_step_anon on public.funnel_events (step, anon_id);
create index if not exists idx_funnel_events_created on public.funnel_events (created_at desc);
create index if not exists idx_funnel_events_ip_created on public.funnel_events (ip, created_at);
alter table public.funnel_events enable row level security;
