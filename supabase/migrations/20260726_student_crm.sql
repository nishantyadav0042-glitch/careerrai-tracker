-- ── Slice 1 of the profiles split: CRM state gets its own table ─────────────
--
-- profiles carries 112 columns and 18 subsystems write to it. Three of those
-- columns are sales/CRM state — and one of their writers is an INBOUND WEBHOOK
-- from Expedify, an outside calling vendor. That means a third party's payload
-- currently lands on the same row that authenticates a student, next to their
-- phone number and password state, with no schema boundary in between.
-- Nothing has gone wrong; there is simply nothing stopping it.
--
-- This migration is step E (expand) and step D (dual-write) of
-- expand -> migrate -> contract. AFTER IT RUNS, NOTHING HAS CHANGED FOR ANY
-- READER: profiles keeps its columns, keeps being written exactly as before,
-- and remains authoritative. student_crm is a verified mirror, nothing more.
-- Reads flip in a later, separate deploy; the profiles columns are dropped only
-- after a soak, in a third.
--
-- Dual-write is a TRIGGER, not five edited route handlers, for two reasons:
--   1. One of the five writers is /api/auth/verify-phone-otp — an auth path
--      that is under a standing do-not-touch instruction.
--   2. A trigger cannot be forgotten by a sixth writer added next month, which
--      is exactly how mirrors drift out of sync.
--
-- Reversal: drop the trigger, then the function, then the table. profiles is
-- untouched throughout, so reversal loses nothing.

create table if not exists public.student_crm (
  student_id         uuid primary key references public.profiles(id) on delete cascade,
  -- Where the lead is in the calling pipeline: queued / sending / sent /
  -- failed / skipped_activated, or a free-text status line from the vendor.
  expedify_status    text,
  expedify_synced_at timestamptz,
  -- Agent call summaries, appended over time. Founder-written notes live here
  -- too and must never be overwritten by an automated write.
  call_feedback      jsonb,
  updated_at         timestamptz not null default now()
);

comment on table public.student_crm is
  'Sales/CRM state per student. Owned by the sales domain. Mirrors profiles.expedify_* and profiles.call_feedback until reads are flipped (slice 1 of the profiles split).';

-- Same deny-by-default posture as the rest of the schema: RLS on, no policies,
-- so only service_role reaches it. Client code never touches this table.
alter table public.student_crm enable row level security;

create index if not exists student_crm_status_idx
  on public.student_crm (expedify_status)
  where expedify_status is not null;

-- ── Backfill ────────────────────────────────────────────────────────────────
-- Only rows that actually hold CRM data. A student who has never been called
-- gets no row, rather than 258 empty ones.
insert into public.student_crm (student_id, expedify_status, expedify_synced_at, call_feedback, updated_at)
select p.id, p.expedify_status, p.expedify_synced_at, p.call_feedback, now()
from public.profiles p
where p.expedify_status is not null
   or p.expedify_synced_at is not null
   or p.call_feedback is not null
on conflict (student_id) do nothing;

-- ── Dual-write ──────────────────────────────────────────────────────────────
create or replace function public.sync_student_crm()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.student_crm (student_id, expedify_status, expedify_synced_at, call_feedback, updated_at)
  values (new.id, new.expedify_status, new.expedify_synced_at, new.call_feedback, now())
  on conflict (student_id) do update
    set expedify_status    = excluded.expedify_status,
        expedify_synced_at = excluded.expedify_synced_at,
        call_feedback      = excluded.call_feedback,
        updated_at         = now();
  return new;
end;
$$;

-- Fires only when one of the three CRM columns is actually part of the write,
-- so ordinary profile updates (a name change, a streak, a push subscription)
-- cost nothing.
drop trigger if exists trg_sync_student_crm on public.profiles;
create trigger trg_sync_student_crm
after insert or update of expedify_status, expedify_synced_at, call_feedback
on public.profiles
for each row
execute function public.sync_student_crm();
