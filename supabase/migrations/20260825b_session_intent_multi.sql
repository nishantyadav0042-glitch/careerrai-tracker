-- ── A student may state up to three reasons ─────────────────────────────────
--
-- Founder decision, 25 Aug 2026: the reason stays MANDATORY, and a student may
-- pick more than one. A real ₹299 buyer rarely has exactly one problem — "my
-- QA is weak AND I've lost my routine" is the normal case, and forcing a single
-- choice threw away the second half of it.
--
-- WHY NOT A JOIN TABLE. Two tables own a reason (student_payments, and
-- session_credits after activation), so a join table would need either two
-- join tables or one polymorphic table keyed by a table name — and a
-- polymorphic FK is not a foreign key at all, it is a string that hopes. The
-- array lives next to the column it extends, on both owners, and a trigger
-- gives it the integrity the FK cannot.
--
-- WHY session_intent SURVIVES AS THE PRIMARY. matchMentor() takes exactly one
-- findingKind, and every existing reader — the MIS, session_feedback, the
-- credit coherence trigger — reads session_intent. Redefining that column
-- would have rewritten all of them at once. Instead the student's FIRST pick
-- stays in session_intent (still FK-checked, still the matching key, and the
-- UI says out loud that the first pick chooses the buddy), and the full list
-- lands beside it. Existing rows and existing queries keep their meaning.
--
-- THE CAP IS THREE. Founder's call, and it is a product limit rather than a
-- guess dressed as one: a 45-minute session that promises ten things delivers
-- none. It is enforced in the picker, in the API, and here — because a limit
-- that lives only in a form is a suggestion.

alter table public.student_payments add column if not exists session_intent_all text[];
alter table public.session_credits  add column if not exists session_intent_all text[];

comment on column public.student_payments.session_intent_all is
  'Every reason the student stated, in the order they picked them. Element 1 IS session_intent (the primary, which drives mentor matching). 1-3 elements, no duplicates, every element a valid session_intents.kind — enforced by session_intent_multi_coherent(), because a foreign key cannot police an array.';
comment on column public.session_credits.session_intent_all is
  'Every reason the student stated, in the order they picked them. Element 1 IS session_intent. See student_payments.session_intent_all.';

-- Backfill: one stated reason is a list of one. Rows with no reason at all
-- (bookings that predate the reason existing) stay NULL — inventing a list for
-- them would fabricate a statement nobody made.
update public.student_payments
   set session_intent_all = array[session_intent]
 where session_intent is not null and session_intent_all is null;
update public.session_credits
   set session_intent_all = array[session_intent]
 where session_intent is not null and session_intent_all is null;

create or replace function public.session_intent_multi_coherent()
returns trigger
language plpgsql
as $$
declare
  bad text;
  n   int;
begin
  -- COMPATIBILITY BRIDGE, deliberate and narrow. Writers that predate the
  -- array (activate-payment copying a credit forward, an admin correcting one
  -- row) set session_intent alone. Deriving the single-element list here keeps
  -- them correct instead of making them all wrong on the day this ships.
  -- It never INVENTS a reason: with no session_intent there is nothing to
  -- derive, and the row stays NULL.
  if new.session_intent_all is null then
    if new.session_intent is not null then
      new.session_intent_all := array[new.session_intent];
    end if;
    return new;
  end if;

  n := coalesce(array_length(new.session_intent_all, 1), 0);
  if n < 1 or n > 3 then
    raise exception 'session_intent_all must hold 1 to 3 reasons, got %', n
      using errcode = 'check_violation';
  end if;

  -- The primary is the first pick, and it is the column the matcher reads.
  -- If these two disagree, one of them is a lie and we cannot tell which.
  if new.session_intent is distinct from new.session_intent_all[1] then
    raise exception 'session_intent (%) must equal the first reason picked (%)',
      new.session_intent, new.session_intent_all[1]
      using errcode = 'check_violation';
  end if;

  -- Duplicates would inflate any count over this column while telling us
  -- nothing new about the student.
  if n <> (select count(distinct k) from unnest(new.session_intent_all) as k) then
    raise exception 'session_intent_all must not repeat a reason: %', new.session_intent_all
      using errcode = 'check_violation';
  end if;

  -- The FK on session_intent covers element 1 only; the rest are checked here.
  -- One vocabulary, one table, no second list of allowed kinds anywhere.
  select k into bad
    from unnest(new.session_intent_all) as k
   where not exists (select 1 from public.session_intents si where si.kind = k)
   limit 1;
  if bad is not null then
    raise exception 'unknown session intent: %', bad using errcode = 'foreign_key_violation';
  end if;

  -- 'other' anywhere in the list needs the note, not just as the primary.
  -- The existing other_needs_note CHECK only sees session_intent, so picking
  -- "QA weak" then "Something else" with nothing written would have slipped
  -- past it — the exact combination that carries no information.
  if 'other' = any (new.session_intent_all)
     and (new.session_intent_note is null or length(btrim(new.session_intent_note)) < 3) then
    raise exception 'picking "other" requires a note of at least 3 characters'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists student_payments_intent_multi on public.student_payments;
create trigger student_payments_intent_multi
  before insert or update on public.student_payments
  for each row execute function public.session_intent_multi_coherent();

drop trigger if exists session_credits_intent_multi on public.session_credits;
create trigger session_credits_intent_multi
  before insert or update on public.session_credits
  for each row execute function public.session_intent_multi_coherent();
