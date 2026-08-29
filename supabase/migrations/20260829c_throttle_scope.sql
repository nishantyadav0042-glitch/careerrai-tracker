-- ── ONE THROTTLE TABLE, SEPARATE BUDGETS ────────────────────────────────────
--
-- 29 Aug 2026. login_attempts backs every abuse guard that counts "too many
-- tries from this IP". The per-IP count was taken across the WHOLE table, so
-- every feature sharing the table also shared one IP budget — and a row
-- written by one surface silently spent another surface's allowance.
--
-- That is not theoretical here. /api/auth/stash-onboarding writes a row per
-- completed /start funnel. Indian mobile carriers run large-scale CGNAT and a
-- college campus is one exit IP, so hundreds of unrelated students share an
-- address: enough /start completions from one IP would have pushed that IP
-- past the LOGIN lockout (30/IP) and locked real students out of their own
-- accounts, with nothing in the login path to explain why.
--
-- So the budget is namespaced. `scope` defaults to 'auth', which is what every
-- credential surface uses — login, verify-otp, verify-phone-otp keep sharing
-- one pool exactly as before, so an attacker cannot gain by spraying across
-- them. Anything that is not a credential attempt gets its own scope and can
-- neither spend nor be spent by the auth pool.
--
-- The DEFAULT is what makes the rollout safe: rows written by the currently
-- deployed code, which does not know this column exists, land in 'auth' —
-- exactly where they belong — so the migration and the deploy need no ordering.
alter table public.login_attempts
  add column if not exists scope text not null default 'auth';

-- The counts are always taken WITHIN a scope now, so scope leads both indexes.
-- The originals are kept: during a rolling deploy the old code still issues
-- unscoped counts, and a tiny table can afford two extra indexes far more
-- easily than it can afford a sequential scan on the login path.
create index if not exists idx_login_attempts_scope_cred
  on public.login_attempts (scope, credential, created_at);
create index if not exists idx_login_attempts_scope_ip
  on public.login_attempts (scope, ip, created_at);

comment on column public.login_attempts.scope is
  'Which abuse guard owns this row. Per-key and per-IP counts are taken within one scope, so unrelated surfaces cannot spend each other''s budget. "auth" = credential attempts (login, verify-otp, verify-phone-otp) and they share one pool deliberately.';
