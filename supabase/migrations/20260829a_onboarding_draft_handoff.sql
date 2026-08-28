-- ── CARRYING /start's ANSWERS THROUGH GOOGLE ────────────────────────────────
--
-- 29 Aug 2026. A student answers every onboarding question before any account
-- exists; the draft lives in localStorage while they answer. The phone-OTP
-- door posts that draft in the same request that creates the account, so the
-- answers land atomically. "Continue with Google" cannot: the browser leaves
-- for accounts.google.com and comes back to /auth/callback, which is a SERVER
-- redirect with no access to localStorage.
--
-- WHY NOT A COOKIE. The draft carries the topic-coverage matrix — 53 CAT
-- topics, each a {section, topic, status} object. That is comfortably over
-- 3 KB of JSON before encoding, against a ~4 KB per-cookie ceiling that
-- browsers enforce by SILENTLY DROPPING the cookie. The failure mode is a
-- student who answered everything, signed in, and lost it all with no error
-- anywhere — and it would strike exactly the students who answered the MOST
-- questions. A size limit that fails silently on your best-engaged users is
-- not a mechanism to gamble a signup on.
--
-- So the draft is stashed server-side for the length of the round trip and
-- referenced by an opaque id in an HttpOnly cookie. The cookie carries no
-- answers, only the id.
--
-- DELIBERATELY NOT auth.users-KEYED. At stash time there is no account yet —
-- that is the entire point. The id is the capability, so it must be
-- unguessable (gen_random_uuid) and short-lived.
create table if not exists public.onboarding_drafts (
  id          uuid primary key default gen_random_uuid(),
  payload     jsonb not null,
  created_at  timestamptz not null default now(),
  -- Set the moment a signup consumes it. A draft is single-use: replaying one
  -- after the fact would overwrite a real profile with a stale funnel answer,
  -- which is the failure the caller's brand-new-account guard exists to stop.
  consumed_at timestamptz,
  consumed_by uuid references auth.users(id) on delete set null
);

-- The reaper's index. Drafts are worthless once the round trip ends; anything
-- older than an hour is abandoned by definition.
create index if not exists onboarding_drafts_created_idx
  on public.onboarding_drafts (created_at)
  where consumed_at is null;

-- ── NOBODY READS THIS BUT THE SERVER ───────────────────────────────────────
--
-- A draft is a bag of one person's answers, addressed by a uuid that travels
-- in a cookie. RLS on with NO policy means anon and authenticated can do
-- nothing at all — not select, not insert, not update. Both the stash endpoint
-- and /auth/callback run with the service role, which bypasses RLS by design.
-- Without this, knowing a uuid would be enough to read a stranger's answers.
alter table public.onboarding_drafts enable row level security;

revoke all on public.onboarding_drafts from anon, authenticated;

comment on table public.onboarding_drafts is
  'Short-lived /start answers carried across the Google OAuth round trip. Service-role only; single-use; reaped after 1 hour.';
