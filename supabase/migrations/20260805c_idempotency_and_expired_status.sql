-- ── Idempotency for booking ────────────────────────────────────────────────
-- A mentor on Indian mobile data taps "Schedule", sees nothing happen, and
-- taps again. Without this, that is two POSTs. The constraints would refuse
-- the second — which is safe but reads as a bug: they tried once, and the app
-- told them they already have a meeting.
--
-- With a key, the second POST returns the FIRST one's answer: same session,
-- same link, no error. Standard for payments and bookings, for this reason.
create table if not exists public.idempotency_keys (
  key         text not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  endpoint    text not null,
  -- The response we already sent. Replayed verbatim on a repeat.
  status      int  not null,
  response    jsonb not null,
  created_at  timestamptz not null default now(),
  primary key (user_id, endpoint, key)
);

-- Scoped by user AND endpoint, not by key alone: one client's uuid must never
-- be able to collide with — or read back — another's response.

create index if not exists idempotency_keys_created_idx
  on public.idempotency_keys (created_at);

alter table public.idempotency_keys enable row level security;
-- No policies: service role only. A client sends its key in a header and reads
-- nothing from this table directly.

-- ── A fourth session outcome: 'expired' ────────────────────────────────────
-- Sessions whose time has long passed with nobody closing them out must stop
-- holding the pair's booking lock. But the two statuses we had both make a
-- claim we cannot support:
--
--   'completed' asserts the call happened — fabricated evidence, which is
--               exactly what Incident #9's exam_ready guard exists to prevent.
--   'cancelled' asserts it did NOT happen. On 5 Aug this would have marked the
--               Shreya orientation cancelled — a session the founder watched go
--               well and rated 10/10.
--
-- 'expired' says only what is true: the window passed, nobody recorded an
-- outcome, and it no longer blocks anyone. A mentor can still correct it to
-- 'completed' afterwards.
alter table public.video_sessions drop constraint if exists valid_status;
alter table public.video_sessions add constraint valid_status check (
  session_status in ('scheduled', 'active', 'completed', 'cancelled', 'expired')
);

comment on column public.video_sessions.session_status is
  'scheduled | active | completed | cancelled | expired. "expired" = the window passed with no outcome recorded; it releases the booking lock without claiming the call did or did not happen.';
