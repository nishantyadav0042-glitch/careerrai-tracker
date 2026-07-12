-- Applied via Supabase MCP on 2026-07-12. Recorded here for repo parity.
-- Tables/columns backing the app-layer abuse guards:
--   * login_attempts  — brute-force / credential-stuffing throttle on the
--     password login (per-credential + per-IP, short rolling window).
--   * otp_send_events.ip — per-IP hourly cap on OTP sends (on top of the
--     existing per-phone + global-daily ceilings).
--   * cat_test_leads.ip — per-IP daily cap on the public CAT-quiz lead submit.
-- All three are read/written only by the service-role admin client.
create table if not exists public.login_attempts (
  id bigint generated always as identity primary key,
  credential text,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_login_attempts_cred on public.login_attempts (credential, created_at);
create index if not exists idx_login_attempts_ip on public.login_attempts (ip, created_at);
alter table public.login_attempts enable row level security;
-- No policies: deny-all to anon/authenticated; service_role bypasses RLS.

alter table public.otp_send_events add column if not exists ip text;
create index if not exists idx_otp_send_events_ip on public.otp_send_events (ip, sent_at);

alter table public.cat_test_leads add column if not exists ip text;
create index if not exists idx_cat_test_leads_ip on public.cat_test_leads (ip, created_at);
