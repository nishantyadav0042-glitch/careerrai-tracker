-- ── Phase 2B-1: rep operational configuration ───────────────────────────────
--
-- Founder mandate, 24 Aug 2026, after the Phase 2B final architecture gate.
-- OBSERVATION ONLY: this migration adds configuration and nothing that moves a
-- student. No assignment engine, no ownership change, no cron.
--
-- WHY A NEW TABLE (the proof obligation from the gate):
--   · profiles is already the documented god-table with a stalled split plan
--     (KNOWLEDGE §9 risk 6); adding eleven operational columns deepens a known
--     problem, and every migration touching it "deserves extra review".
--   · server_config is a GLOBAL key/value store (VAPID keypair, admin phones,
--     API keys). It has no per-person shape, no constraints, no FK — it cannot
--     express "Priya works Mon–Sat 10:00–19:00 and holds 50 units of work".
--   · Nothing else in the schema stores per-staff operational config. Verified
--     by table search: no *_config / *_setting / *staff* / *rep* / *capacity*
--     table exists beyond server_config.
--
-- CAPACITY IS CONFIGURATION, NOT CODE (founder rule, and SCALE-CONTRACT §7).
-- Nothing anywhere hard-codes two people, or full-time vs part-time numbers.
-- A third hire is one INSERT.

create table if not exists public.sales_rep_config (
  rep_id        uuid primary key references public.profiles(id) on delete cascade,

  -- Master switch. A rep with active=false receives nothing; their existing
  -- book is untouched (ownership is never mutated by configuration).
  active        boolean not null default true,

  -- LABEL ONLY. No branch in any engine reads this: full-time and part-time
  -- differ purely by their numbers, which is what makes 2 → 100 reps a
  -- configuration change rather than an architectural one.
  employment_type text not null default 'full_time',

  -- Working window, IST. ISO weekday numbers: 1 = Monday … 7 = Sunday.
  work_days     smallint[] not null default '{1,2,3,4,5,6}',
  work_start_ist time not null default '10:00',
  work_end_ist   time not null default '19:00',

  -- PRIMARY CEILING — units of ACTIVE WORK, not owned relationships.
  -- Named "units" deliberately: Phase 2 counts 1 per active item, and a later
  -- weighted model (a call costs more than a reminder) changes one pure
  -- function rather than this column, its meaning, or the engine.
  max_capacity_units int not null default 50,

  -- SAFETY FUSE — a finite daily intake ceiling. Founder, 24 Aug: this exists
  -- for the case where the capacity computation itself is wrong; a fuse whose
  -- value is infinity is not a fuse. Deliberately NOT nullable-as-unbounded.
  max_new_per_day int not null default 15,

  -- Measured in WORKING minutes inside this rep's own window, never wall
  -- clock (gate finding W6): a 2-hour SLA on a 18:30 assignment is due the
  -- next working morning, not at 20:30 while nobody is working.
  first_contact_sla_minutes int not null default 120,

  -- Leave / paused. Zero intake while set; the book is not touched.
  unavailable_until timestamptz,

  -- Temporary ceiling change. EXPIRING by design — a permanent "temporary"
  -- override is how a capacity model quietly stops meaning anything.
  capacity_override int,
  override_until    timestamptz,

  updated_by    uuid references public.profiles(id) on delete set null,
  updated_at    timestamptz not null default now(),
  created_at    timestamptz not null default now()
);

alter table public.sales_rep_config
  add constraint sales_rep_config_employment_check
  check (employment_type in ('full_time', 'part_time'));

-- Bounds, so a typo cannot flood a rep with hundreds of students. These are
-- sanity rails, not business tuning: the business numbers live in the row.
alter table public.sales_rep_config
  add constraint sales_rep_config_capacity_bounds
  check (max_capacity_units between 1 and 200);

alter table public.sales_rep_config
  add constraint sales_rep_config_daily_bounds
  check (max_new_per_day between 1 and 100);

alter table public.sales_rep_config
  add constraint sales_rep_config_sla_bounds
  check (first_contact_sla_minutes between 5 and 10080);  -- 5 min … 7 days

alter table public.sales_rep_config
  add constraint sales_rep_config_override_bounds
  check (capacity_override is null or capacity_override between 1 and 200);

-- An override without an expiry is a permanent change wearing a temporary
-- name — the two fields live and die together.
alter table public.sales_rep_config
  add constraint sales_rep_config_override_coherent
  check ((capacity_override is null) = (override_until is null));

alter table public.sales_rep_config
  add constraint sales_rep_config_window_check
  check (work_start_ist < work_end_ist);

-- coalesce is load-bearing: array_length('{}', 1) is NULL, not 0, and a CHECK
-- whose expression is NULL PASSES. Without the coalesce, an empty work_days
-- array is accepted and the rep is silently never inside their own working
-- window. Found by functionally testing this constraint with a real UPDATE on
-- careerrai-test rather than trusting that the migration applied cleanly —
-- the same NULL-walks-past-a-constraint defect as the expedify dedupe key.
alter table public.sales_rep_config
  add constraint sales_rep_config_workdays_check
  check (coalesce(array_length(work_days, 1), 0) between 1 and 7);

-- Same deny-by-default posture as every other sales table: RLS on, no
-- policies, service-role only. Adding policies here would create a second,
-- divergent authorization model under a client that bypasses RLS anyway.
alter table public.sales_rep_config enable row level security;
revoke insert, update, delete on public.sales_rep_config from anon, authenticated;

comment on table public.sales_rep_config is
  'Per-rep operational configuration. Capacity is measured in units of ACTIVE WORK (see lib/sales-capacity.ts), never in owned relationships: a healthy retained student stays owned but consumes nothing.';

comment on column public.sales_rep_config.max_capacity_units is
  'Ceiling on ACTIVE work items. A rep who successfully retains 200 students holds 200 relationships and may still have 50 free units — that separation is the point.';
