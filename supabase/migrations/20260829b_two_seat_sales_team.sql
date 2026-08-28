-- ── THE SALES TEAM IS TWO SEATS ─────────────────────────────────────────────
--
-- Founder decision, 29 Aug 2026: the active sales team is exactly two
-- part-time counsellors (Neelam and Anshul, ~5 working hours a day each), and
-- nothing may quietly grow it. The application half of this rule is
-- MAX_ACTIVE_SALES_SEATS in src/lib/sales-rep-provisioning.ts, checked by the
-- two routes that can produce an active seat. This is the database half, and
-- it exists because a route check binds only the routes that call it — a
-- dashboard SQL edit, a future script, or a route someone writes next month
-- are all bound HERE or not at all. (Incident #42's lesson, applied before
-- the incident this time: a guard in the caller is not a guard.)
--
-- THE CAP IS A NUMBER, NOT A NAME LIST. Which two people hold the seats is
-- data, managed at /admin/sales/capacity; hard-coding identities into the
-- schema would turn a legitimate future replacement into a migration. Growing
-- the team past two is a founder decision and arrives as a migration that
-- raises this constant and the application's in the same commit.
--
-- THE ADVISORY LOCK is what makes the count race-proof. Two concurrent
-- activations would each count the other as not-yet-active and both commit;
-- serialising every activation on one transaction-scoped lock closes that
-- window without locking reads or unrelated writes. Deactivations and edits
-- of already-inactive rows never take the lock and cannot be blocked by it.

create or replace function public.enforce_sales_seat_cap()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cap constant int := 2;
  v_others int;
begin
  -- Only a write that RESULTS in an active seat is gated.
  if new.active is not true then
    return new;
  end if;
  -- An UPDATE that keeps an already-active row active is not a new seat.
  if tg_op = 'UPDATE' and old.active is true then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('sales_seat_cap'));

  select count(*) into v_others
  from public.sales_rep_config
  where active and rep_id <> new.rep_id;

  if v_others >= v_cap then
    raise exception 'sales team is capped at % active seats; deactivate one before activating %', v_cap, new.rep_id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists sales_seat_cap on public.sales_rep_config;
create trigger sales_seat_cap
  before insert or update of active on public.sales_rep_config
  for each row execute function public.enforce_sales_seat_cap();

comment on function public.enforce_sales_seat_cap() is
  'The sales team is capped at 2 active seats (founder, 29 Aug 2026). Database half of MAX_ACTIVE_SALES_SEATS in sales-rep-provisioning.ts.';
