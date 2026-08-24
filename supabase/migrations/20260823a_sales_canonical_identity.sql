-- ── Sales Operating System: canonical identity, provenance, follow-up ───────
--
-- Founder execution mandate, 23 Aug 2026. This single migration closes the
-- schema half of security stops 1, 4, and the identity/provenance/follow-up
-- foundations. It is written to be boring on purpose: every statement is
-- additive, every constraint is reversible, and nothing is dropped.
--
-- WHY THIS IS SAFE TO DO NOW, AND WHY IT WOULD NOT BE LATER
--
--   lead_outreach   0 rows
--   sales_activity  0 rows
--
-- Verified in production immediately before writing this. There is no
-- ownership history to map, no ambiguous actor to adjudicate, and therefore
-- nothing to guess. The first logged call turns this from ADD COLUMN into a
-- data migration with a reconciliation problem. That is the entire reason this
-- runs before the Control Tower rather than after it.
--
-- WHAT IS DELIBERATELY *NOT* DONE
--
--   · lead_outreach.owner and sales_activity.actor (the legacy TEXT columns)
--     are NOT dropped. Rule: never delete a column until every reader is
--     migrated AND verified in production. They are left in place, unused by
--     new writes, to be removed in a later migration after a soak.
--   · The 239 historical expedify_events rows are NOT touched. They are
--     evidence of a real defect (220 duplicate deliveries on 12 Aug) and
--     deleting them would destroy the proof.
--   · student_crm and its trigger are NOT touched — that is a deliberate,
--     incomplete profiles-split slice, not dead weight.

-- ── 1. Security Stop 1: activity may only reference a real person ───────────
-- sales_activity.student_id had NO foreign key at all. A rep POSTing an
-- arbitrary uuid to /api/sales/log wrote history against a student that need
-- not exist. The application now validates the target too; this is the floor
-- underneath that check, so a future writer cannot reintroduce the hole.
alter table public.sales_activity
  add constraint sales_activity_student_id_fkey
  foreign key (student_id) references public.profiles(id) on delete cascade;

-- ── 2. Canonical identity: profiles.id, never an email string ──────────────
-- Ownership and actorship were TEXT columns holding an email. Five different
-- expressions across five files produced four different behaviours when that
-- email was NULL, and one of them granted the founder's oversight frame.
alter table public.lead_outreach
  add column if not exists owner_id uuid references public.profiles(id) on delete set null;

-- Nullable BY DESIGN: an unclaimed lead is a legal, meaningful state (SA-1D
-- shared book). NULL here means "nobody owns this yet", and it is the only
-- NULL in this migration that means something rather than hiding something.
create index if not exists lead_outreach_owner_id_idx
  on public.lead_outreach (owner_id) where owner_id is not null;

alter table public.sales_activity
  add column if not exists actor_id uuid references public.profiles(id) on delete restrict;

-- Every HUMAN activity has an actor. A vendor-reported call does not: naming
-- one would be a fabricated attribution in the table this workstream exists to
-- make trustworthy. So actor_id is required for everything except the two
-- provenances that are by definition not a person acting. Applied after the
-- code that writes it is deployed (see the rollout note above).
-- alter table public.sales_activity
--   add constraint sales_activity_actor_required
--   check (actor_id is not null or provenance in ('vendor_reported', 'observed', 'unknown'));

create index if not exists sales_activity_actor_id_idx on public.sales_activity (actor_id);
create index if not exists sales_activity_student_created_idx
  on public.sales_activity (student_id, created_at desc);

-- ON DELETE RESTRICT on actor_id, not CASCADE: deleting a staff account must
-- never silently erase the history of what they did.

-- ── 3. Provenance: "a rep typed it" is not "the system observed it" ────────
-- The founder's rule. Every commercially meaningful sales metric today is a
-- self-report; every product and money metric is observed. A leaderboard that
-- mixes them is gameable by construction, so the distinction lives in the
-- schema rather than in a convention.
alter table public.sales_activity
  add column if not exists activity_type text not null default 'call',
  add column if not exists channel       text,
  add column if not exists provenance    text not null default 'self_reported',
  -- The vendor's own call/message identifier, when one exists. Its PRESENCE is
  -- what upgrades an activity from self_reported to vendor_reported.
  add column if not exists external_ref  text;

alter table public.sales_activity
  add constraint sales_activity_activity_type_check check (activity_type in (
    'call', 'whatsapp', 'sms', 'email', 'note',
    'followup_scheduled', 'followup_completed', 'followup_cancelled',
    'status_change', 'assigned', 'reassigned', 'unassigned'
  ));

alter table public.sales_activity
  add constraint sales_activity_channel_check check (channel is null or channel in (
    'phone', 'whatsapp', 'sms', 'email', 'in_app', 'system'
  ));

alter table public.sales_activity
  add constraint sales_activity_provenance_check check (provenance in (
    'observed',         -- an independent system recorded it (payment, push)
    'vendor_reported',  -- a vendor callback carrying its own call/message id
    'self_reported',    -- a human typed it. The default, because it is the
                        -- honest assumption for a CRM entry.
    'system_generated', -- the app did it (assignment, cadence)
    'imported',         -- migrated from elsewhere
    'unknown'
  ));

-- A vendor-reported activity without the vendor's own identifier is a
-- self-report wearing a badge. Reject that shape outright.
alter table public.sales_activity
  add constraint sales_activity_vendor_needs_ref
  check (provenance <> 'vendor_reported' or external_ref is not null);

comment on column public.sales_activity.provenance is
  'How we know this happened. self_reported = a human typed it and nothing independent confirms it. Never render self_reported as observed fact.';

-- ── 4. Follow-up becomes a first-class object ──────────────────────────────
-- lead_outreach.next_action_at is a single mutable timestamp: completing a
-- follow-up OVERWRITES it, so "was the promised follow-up actually done?" has
-- never been answerable. The cadence field stays (it drives the queue); this
-- table is the history it could never keep.
create table if not exists public.sales_followup (
  -- IDENTITY, matching sales_activity's convention rather than bigserial.
  id            bigint generated always as identity primary key,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  owner_id      uuid not null references public.profiles(id) on delete restrict,
  created_by    uuid not null references public.profiles(id) on delete restrict,
  created_at    timestamptz not null default now(),
  due_at        timestamptz not null,
  reason        text,
  channel       text,
  status        text not null default 'open',
  completed_at  timestamptz,
  completed_by  uuid references public.profiles(id) on delete set null,
  outcome       text,
  -- The activity row that discharged this follow-up, so completion is evidence
  -- rather than a claim about itself.
  completion_activity_id bigint references public.sales_activity(id) on delete set null,
  cancelled_at  timestamptz,
  cancel_reason text
);

alter table public.sales_followup
  add constraint sales_followup_status_check check (status in ('open', 'completed', 'cancelled', 'no_response'));

alter table public.sales_followup
  add constraint sales_followup_channel_check check (channel is null or channel in (
    'phone', 'whatsapp', 'sms', 'email', 'in_app', 'system'
  ));

-- A completed follow-up must say WHEN and BY WHOM. Half-recorded completion is
-- how "we followed up" becomes unfalsifiable.
alter table public.sales_followup
  add constraint sales_followup_completion_coherent
  check ((status = 'completed') = (completed_at is not null and completed_by is not null));

alter table public.sales_followup
  add constraint sales_followup_cancel_coherent
  check ((status = 'cancelled') = (cancelled_at is not null));

create index if not exists sales_followup_open_due_idx
  on public.sales_followup (due_at) where status = 'open';
create index if not exists sales_followup_owner_open_idx
  on public.sales_followup (owner_id, due_at) where status = 'open';
create index if not exists sales_followup_student_idx
  on public.sales_followup (student_id, created_at desc);

-- Same deny-by-default posture as every other sales table: RLS on, no
-- policies, service-role only. Adding policies here would create a second,
-- divergent authorization model under a client that bypasses RLS anyway.
alter table public.sales_followup enable row level security;
revoke insert, update, delete on public.sales_followup from anon, authenticated;

comment on table public.sales_followup is
  'Append-only follow-up history. lead_outreach.next_action_at remains the cadence field the queue reads; this table is the record that a promise existed and what became of it.';

-- ── 5. Vendor boundary: idempotency that cannot be bypassed by NULL ────────
-- expedify_events.dedupe_key already carries a UNIQUE constraint. It was NULL
-- on all 239 production rows, and PostgreSQL permits unlimited NULLs in a
-- unique index — so replay protection was structurally inert, and 220
-- duplicate deliveries arrived on a single day (12 Aug) to prove it.
--
-- NOT VALID is the point: new rows must carry a key, and the 239 historical
-- rows are preserved untouched as evidence rather than deleted to make a
-- constraint pass.
-- APPLIED POST-DEPLOY, not here. The currently-live code derives dedupe_key =
-- NULL whenever the vendor sends no lead id — which is always — so adding this
-- before the new webhook ships would reject real inbound events with a 500 for
-- the length of the deploy window. It was briefly applied and removed for
-- exactly that reason; the removal is the honest fix, not the constraint.
--
-- NOT VALID is still the right instrument: it binds new rows while leaving the
-- 239 historical NULL rows untouched as evidence of the original defect.
--
-- alter table public.expedify_events
--   add constraint expedify_events_dedupe_key_required
--   check (dedupe_key is not null) not valid;

-- Vendor events that cannot be attributed to a student are a QUEUE, not a
-- silent success. The webhook currently stores an unmatched event and returns
-- 200, so nobody ever learns it happened.
alter table public.expedify_events
  add column if not exists resolution   text not null default 'unresolved',
  add column if not exists resolved_by  uuid references public.profiles(id) on delete set null,
  add column if not exists resolved_at  timestamptz,
  add column if not exists resolution_note text;

alter table public.expedify_events
  add constraint expedify_events_resolution_check check (resolution in (
    'matched',      -- correlated to a student by OUR reference
    'unmatched',    -- no usable correlation — awaiting founder repair
    'repaired',     -- a human attributed it, and said so
    'discarded',    -- deliberately dismissed (test traffic, vendor noise)
    'unresolved'    -- historical rows, before this column existed
  ));

create index if not exists expedify_events_unmatched_idx
  on public.expedify_events (received_at desc) where resolution = 'unmatched';

comment on column public.expedify_events.resolution is
  'Correlation state. The 239 rows predating this column are ''unresolved'' — they are evidence of the phone-matching defect, not repaired data.';
