-- ── SUCCESSION: A BOOK OUTLIVES THE PERSON HOLDING IT ───────────────────────
--
-- Founder, 29 Aug 2026: if a counsellor leaves, the book must transfer by
-- itself rather than stranding a thousand students with nobody. This migration
-- is the database half of that; the application half is
-- src/lib/sales-succession.ts.
--
-- THE TWO FACTS THAT MADE THIS URGENT, verified in production before writing:
--
--   lead_outreach.owner_id  → profiles(id) ON DELETE SET NULL
--   sales_followup.owner_id → profiles(id) ON DELETE RESTRICT
--
-- One event, two opposite outcomes. Removing a departing rep's profile either
-- silently unowns their entire book with nothing raised anywhere, or fails with
-- a foreign-key error that names a table the founder has never heard of. The
-- first is the dangerous one: SET NULL is the database quietly deciding that
-- "nobody owns these students now" is an acceptable resting state.
--
-- It is not. Ownership is the thing that makes a student get called.
--
-- PRE-STATE, read immediately before this migration was written:
--   lead_outreach   0 rows
--   sales_followup  0 rows
--   sales_activity  0 rows
--   profiles      985 rows (974 students)
--
-- So the FK swap below rewrites no data and can hold no existing row hostage.
-- Doing it now, while the tables are empty, is the entire reason it is cheap —
-- the same change after two counsellors have worked a book for a month is a
-- lock on every lead and a reconciliation problem. (ENGINEERING-MEMORY #43's
-- lesson, applied before the incident: the cheap day to fix a constraint is the
-- day before it holds data.)

-- ── 1. Neither table may silently orphan a book ─────────────────────────────
--
-- Both become RESTRICT, so the two tables finally agree. The consequence is
-- deliberate and is the point: a rep who owns students CANNOT be deleted at
-- all. The founder is forced through the transfer below, which is the only
-- action that leaves the students with somebody. A refusal here is not an
-- obstacle to succession, it IS succession — it converts a silent data loss
-- into a visible "hand the book over first".

alter table public.lead_outreach
  drop constraint if exists lead_outreach_owner_id_fkey;

alter table public.lead_outreach
  add constraint lead_outreach_owner_id_fkey
  foreign key (owner_id) references public.profiles(id) on delete restrict;

comment on constraint lead_outreach_owner_id_fkey on public.lead_outreach is
  'RESTRICT, not SET NULL (29 Aug 2026). SET NULL let a departing rep''s whole book become unowned with nothing raised. Transfer the book with transfer_sales_book() before removing a rep.';

-- ── 2. A handover is a fact, and facts are recorded ─────────────────────────
--
-- Not derivable from the leads themselves: once owner_id is overwritten, the
-- previous owner is gone from that row forever. Who held this student in March
-- is a question the earnings ledger and every "why did this student churn"
-- post-mortem will eventually ask, and there is exactly one moment when the
-- answer is knowable — this one.

create table if not exists public.sales_book_transfer (
  id              uuid primary key default gen_random_uuid(),
  from_rep_id     uuid not null references public.profiles(id) on delete restrict,
  to_rep_id       uuid not null references public.profiles(id) on delete restrict,
  -- Counts are snapshotted, never recomputed. The book moves again next month
  -- and a recomputed "how many moved in August" would then be wrong.
  leads_moved       int not null check (leads_moved >= 0),
  followups_moved   int not null check (followups_moved >= 0),
  overdue_inherited int not null check (overdue_inherited >= 0),
  reason          text not null check (length(btrim(reason)) between 3 and 500),
  actor_id        uuid not null references public.profiles(id) on delete restrict,
  created_at      timestamptz not null default now(),
  constraint sales_book_transfer_distinct check (from_rep_id <> to_rep_id)
);

create index if not exists sales_book_transfer_from_idx on public.sales_book_transfer (from_rep_id, created_at desc);
create index if not exists sales_book_transfer_to_idx   on public.sales_book_transfer (to_rep_id, created_at desc);

comment on table public.sales_book_transfer is
  'Append-only handover history. One row per book transfer; counts are snapshotted at the moment of the move because owner_id overwrites its own history.';

alter table public.sales_book_transfer enable row level security;

-- Same posture as every other sales table: the service role reads and writes,
-- clients get nothing. No policy is created, so RLS denies all client access by
-- default rather than depending on one being written correctly.
revoke all on public.sales_book_transfer from anon, authenticated;

-- ── 3. The move itself — one transaction or none of it ──────────────────────
--
-- WHY A DATABASE FUNCTION AND NOT THREE SUPABASE CALLS. A book half-moved is
-- worse than a book not moved: the students are split across two owners, one of
-- whom has left, and no screen shows that it happened. Three round-trips from a
-- route cannot be made atomic; one function can. The route's job is to decide
-- WHETHER (sales-succession.ts), this function's job is that it either all
-- happens or none of it does.
--
-- SECURITY DEFINER with a pinned search_path, and admin-only EXECUTE. The
-- function trusts p_actor for the audit trail only — it never uses it to decide
-- whether the caller may act, because a caller who can pass an arbitrary uuid
-- could pass the founder's. Authorisation happens in the route, against the
-- session; the grant below is what makes that the only door.
--
-- SCALE NOTE. This is one indexed UPDATE per table. lead_outreach_owner_id_idx
-- already exists, so on a book of a few thousand this is milliseconds. If a
-- single seat ever holds six figures, the row-level UPDATE becomes a long lock
-- and the answer at that point is a seat-id indirection column (owner_id points
-- at a seat, the seat points at a person, and transfer touches ONE row) — which
-- is a real refactor of 42 read sites and is deliberately NOT done today. The
-- trigger to revisit is a seat book above ~50,000, not a date.

create or replace function public.transfer_sales_book(
  p_from   uuid,
  p_to     uuid,
  p_reason text,
  p_actor  uuid
)
returns table (leads_moved int, followups_moved int, overdue_inherited int)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leads    int;
  v_follow   int;
  v_overdue  int;
begin
  if p_from is null or p_to is null then
    raise exception 'transfer_sales_book: both reps are required';
  end if;
  if p_from = p_to then
    raise exception 'transfer_sales_book: source and destination are the same rep';
  end if;

  -- Serialise concurrent transfers involving either seat. Two founders (or one
  -- founder and a retry) moving overlapping books at once would otherwise
  -- interleave into counts that match neither move.
  perform pg_advisory_xact_lock(hashtext('sales_book_transfer'));

  -- Overdue is counted BEFORE the move, against the source, because after the
  -- update these rows are indistinguishable from the destination's own backlog.
  select count(*) into v_overdue
  from public.sales_followup
  where owner_id = p_from and status = 'open' and due_at < now();

  with moved as (
    update public.lead_outreach
       set owner_id = p_to, updated_at = now()
     where owner_id = p_from
    returning student_id
  )
  select count(*) into v_leads from moved;

  -- Promises follow the students. A follow-up left behind is a commitment made
  -- to a real person that now sits in a departed rep's queue, which is how a
  -- student gets told "someone will call you" and nobody ever does.
  with moved as (
    update public.sales_followup
       set owner_id = p_to
     where owner_id = p_from and status = 'open'
    returning id
  )
  select count(*) into v_follow from moved;

  -- Nothing to move is not an error at this level — the route refuses an empty
  -- book with a sentence (EMPTY_BOOK), and a function that raised here would
  -- make a legitimate no-op retry look like a failure.
  if v_leads > 0 or v_follow > 0 then
    insert into public.sales_book_transfer
      (from_rep_id, to_rep_id, leads_moved, followups_moved, overdue_inherited, reason, actor_id)
    values (p_from, p_to, v_leads, v_follow, v_overdue, p_reason, p_actor);
  end if;

  leads_moved := v_leads;
  followups_moved := v_follow;
  overdue_inherited := v_overdue;
  return next;
end;
$$;

revoke all on function public.transfer_sales_book(uuid, uuid, text, uuid) from public, anon, authenticated;

comment on function public.transfer_sales_book(uuid, uuid, text, uuid) is
  'Atomic book handover: moves every owned lead and every OPEN promise from one rep to another and records the counts. Authorisation is the caller''s job — p_actor is audit trail only.';
