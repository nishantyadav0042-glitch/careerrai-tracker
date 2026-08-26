-- ── PHASE 2C: booking becomes ONE operation ─────────────────────────────────
--
-- THE HOLE. `/api/sessions/schedule` books in two separate round trips:
--
--     line 165   insert into video_sessions ...        <- the session exists
--     ...                                              <- NOTHING SPANS THESE
--     line 193   update session_credits set ...        <- the credit points at it
--
-- There is no transaction across them. If the process dies in between — a
-- Vercel timeout, an OOM, a dropped connection — the session survives and the
-- credit does not know about it. The student's credit still reads `assigned`,
-- so the product believes nothing was booked, while the mentor's calendar has
-- a real slot consumed by the exclusion constraint. Phase 0 found this exact
-- shape at rest: 18 video_sessions, 0 of them linked to any credit, ever.
--
-- AND A SECOND, WORSE ONE, found while writing this and confirmed in the
-- installed client source (@supabase/postgrest-js PostgrestQueryBuilder.ts):
-- `.update()` without `.select()` and without `{ count: 'exact' }` sends a
-- PATCH whose response carries no row count. **Zero rows updated is returned
-- as `{ data: null, error: null }` — identical to success.** The route's link
-- step is guarded by `.is('video_session_id', null)`, so when it loses a race
-- it matches nothing, reports success, and returns its own session id to the
-- student. Two concurrent taps therefore produce TWO video_sessions, one
-- linked and one orphaned, and BOTH requests tell the student they are booked.
-- The compensating "cancel the orphan" only runs on `linkError`, which is
-- null in precisely this case, so it never fires.
--
-- THE FIX. One function, one transaction. Lock the credit, check it, insert
-- the session, link it, move the state — and if any step raises, Postgres
-- unwinds all of it. Nothing is left behind on either side.
--
-- WHAT THIS IS NOT: a new booking authority. `video_sessions` remains the
-- delivery authority — its lifecycle guard, its availability guard and its
-- exclusion constraint are untouched and still decide what may exist.
-- `session_credit_coherent()` remains the lifecycle authority — this function
-- writes through it, never around it, and a coherence failure here is
-- deliberately NOT caught, so it takes the session down with it.

create or replace function public.book_session_credit(
  p_credit_id          uuid,
  p_student_id         uuid,
  p_expected_buddy_id  uuid,
  p_start              timestamptz,
  p_duration_minutes   int,
  p_meet_url           text,
  p_title              text default '1:1 session',
  p_session_type       text default 'guidance'
)
returns table (outcome text, session_id uuid, detail text)
language plpgsql
set search_path = public, pg_temp
as $fn$
declare
  c public.session_credits%rowtype;
  v_session_id uuid;
  v_rows int;
begin
  -- (1) LOCK THE CREDIT. Everything after this is serialized per credit, which
  -- is what turns "two taps race" into "two taps queue". The student_id is
  -- part of the predicate, not a later check: a caller who names someone
  -- else's credit finds nothing rather than locking a stranger's row.
  select * into c
    from public.session_credits
   where id = p_credit_id and student_id = p_student_id
     for update;

  if not found then
    return query select 'not_eligible'::text, null::uuid, 'no such credit for this student'::text;
    return;
  end if;

  -- (2) IDEMPOTENT, and now genuinely so. The second of two concurrent taps
  -- arrives here AFTER the first has committed its link, sees it, and returns
  -- the SAME session. It does not create a second one. This is the single
  -- most important line in the file.
  if c.video_session_id is not null then
    return query select 'already_booked'::text, c.video_session_id, null::text;
    return;
  end if;

  -- (3) ELIGIBILITY. booking_blocked is bookable on purpose: it is the state a
  -- credit sits in when a previous attempt failed, and recovery is the whole
  -- reason Phase 2B named it.
  if c.status not in ('paid', 'assigned', 'booking_blocked') then
    return query select 'not_eligible'::text, null::uuid,
      format('this credit is %s', c.status)::text;
    return;
  end if;

  if c.buddy_id is null then
    return query select 'not_eligible'::text, null::uuid, 'no mentor is assigned yet'::text;
    return;
  end if;

  -- (4) THE MENTOR MUST STILL BE THE ONE THE SLOTS WERE COMPUTED FOR. If ops
  -- reassigned this credit between the slot list and the tap, the times on the
  -- student's screen belong to a different person's calendar. Booking them
  -- against the new mentor would be honouring a UI that is already wrong.
  if p_expected_buddy_id is not null and c.buddy_id <> p_expected_buddy_id then
    return query select 'mentor_changed'::text, null::uuid,
      'your mentor changed while you were choosing — please pick again'::text;
    return;
  end if;

  -- (5) THE SESSION. The database validates the slot, exactly as before: the
  -- availability guard refuses anything outside the mentor's week or during
  -- time off, and the GIST exclusion refuses an overlap. These three are
  -- caught and REPORTED, because they are business rules a student can act on
  -- — not faults. Everything else propagates.
  begin
    insert into public.video_sessions (
      student_id, buddy_id, title, scheduled_at, duration_minutes,
      session_status, session_type, google_meet_link
    ) values (
      p_student_id, c.buddy_id, p_title, p_start, p_duration_minutes,
      'scheduled', p_session_type, p_meet_url
    )
    returning id into v_session_id;
  exception
    when exclusion_violation then
      return query select 'slot_taken'::text, null::uuid,
        'that time was just taken — please choose another'::text;
      return;
    when unique_violation then
      return query select 'session_exists'::text, null::uuid,
        'you already have a live session with this mentor'::text;
      return;
    when check_violation then
      -- Only video_sessions' own guards can raise here; the credit has not
      -- been touched yet. Their messages are already written for a student.
      return query select 'unavailable'::text, null::uuid, sqlerrm::text;
      return;
  end;

  -- (6) THE LINK, AND THE STATE. Deliberately NOT wrapped in an exception
  -- handler. If session_credit_coherent() refuses this write, the exception
  -- propagates out of the function and Postgres rolls back the whole
  -- transaction — INCLUDING the session inserted at (5). That is the founder's
  -- second scenario, and it is satisfied by doing nothing rather than by
  -- writing a compensating cancel that can itself fail.
  --
  -- owner/next_action are cleared because a booked credit owes nobody
  -- anything. This is what makes booking_blocked -> scheduled a real recovery
  -- rather than a status change with a stale ops queue behind it.
  update public.session_credits
     set video_session_id = v_session_id,
         status           = 'scheduled',
         owner            = null,
         next_action      = null,
         last_attempt_at  = now()
   where id = c.id
     and video_session_id is null;

  get diagnostics v_rows = row_count;

  -- The row is locked by (1), so this cannot happen. It is asserted anyway,
  -- because "the update matched nothing" is EXACTLY the silence that the
  -- HTTP-based route reports as success. Here it is an exception, and an
  -- exception takes the session with it.
  if v_rows <> 1 then
    raise exception 'book_session_credit: the credit was not linked (% rows)', v_rows
      using errcode = 'check_violation';
  end if;

  return query select 'booked'::text, v_session_id, null::text;
end
$fn$;

-- ── WHO MAY CALL IT ─────────────────────────────────────────────────────────
--
-- Functions are executable by PUBLIC by default, and PostgREST exposes every
-- one of them at /rest/v1/rpc/. Left alone, any logged-in student could call
-- this with someone else's p_credit_id and p_student_id and book a session
-- against a credit they did not pay for. The service role is the only caller
-- that should ever reach it — the route already authenticates the student and
-- passes their own id.
--
-- AND `revoke ... from public` IS NOT ENOUGH, which probe 13 caught and I did
-- not. Supabase ships ALTER DEFAULT PRIVILEGES granting EXECUTE on new
-- functions in `public` to anon, authenticated and service_role EXPLICITLY.
-- An explicit grant survives a revoke from PUBLIC. The first version of this
-- migration revoked only PUBLIC and left the function callable by every
-- logged-in student — the exact hole the comment above describes, written
-- directly underneath the comment describing it. The roles must be named.

revoke all on function public.book_session_credit(uuid, uuid, uuid, timestamptz, int, text, text, text) from public, anon, authenticated;
grant execute on function public.book_session_credit(uuid, uuid, uuid, timestamptz, int, text, text, text) to service_role;

comment on function public.book_session_credit(uuid, uuid, uuid, timestamptz, int, text, text, text) is
  'Books a paid session credit atomically: locks the credit, creates the session, links it, moves the state. Rollback leaves neither half behind. service_role only.';
