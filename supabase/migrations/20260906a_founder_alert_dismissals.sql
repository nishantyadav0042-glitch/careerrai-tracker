-- ── Closing a founder alert the founder has already dealt with ──────────────
--
-- Founder, 6 Sep 2026: "add a close button also here... so that I can tap
-- already assigned or completed."
--
-- Sacred alerts are recomputed live on every page load (lib/os/exception.ts is
-- deliberately zero-infra: a type, a pure aggregation, no queue, no event
-- table). That is the right design for DETECTION and the wrong one for
-- RESOLUTION: an alert whose real-world fix happened outside the system —
-- the mentor was assigned by hand, the student was called and sorted — has no
-- way to stop being detected, so it returns every morning looking new. That is
-- how a P0 interrupt becomes the thing the founder scrolls past, which is the
-- exact failure the ₹999/₹299 money alerts had already produced.
--
-- This is the smallest possible persistence layer: one row per alert the
-- founder has closed, keyed on the alert's own stable id (`unlock:<paymentId>`,
-- `buddy:<studentId>`, `sacred-fail:<action>:<window>`), which the producers
-- already emit and which is stable across recomputes by construction.
--
-- WHAT THIS DELIBERATELY DOES NOT DO: it does not touch the underlying fact.
-- The payment is still unactivated, the student still has no mentor. Dismissal
-- records the FOUNDER'S JUDGEMENT that it is handled, and nothing else — so
-- the drill-down, the payment page and every other surface keep telling the
-- truth. A dismissal is an annotation on the alert, never a fix to the data.
create table if not exists public.founder_alert_dismissals (
  -- The alert id itself. Primary key, so closing twice is idempotent and a
  -- redelivered tap cannot produce two rows.
  alert_id     text primary key,
  -- Which kind of alert, parsed from the id prefix. Kept denormalised so the
  -- founder can be shown "you have closed 4 unlock alerts this week" without
  -- re-deriving it from a string every time.
  alert_kind   text not null,
  -- The student the alert was about, where it had one. Nullable because a
  -- sacred-failure burst is about many students, not one.
  student_id   uuid references public.profiles(id) on delete set null,
  -- Why. The two the founder asked for, plus 'other' so the vocabulary can
  -- grow without a migration that blocks a tap at 9pm.
  reason       text not null check (reason in ('assigned', 'completed', 'other')),
  note         text,
  dismissed_by uuid not null references public.profiles(id),
  dismissed_at timestamptz not null default now()
);

-- The read is "give me every dismissed id" on a page that already runs several
-- queries, so it stays a single indexed scan as the table grows.
create index if not exists founder_alert_dismissals_kind_idx
  on public.founder_alert_dismissals (alert_kind, dismissed_at desc);

alter table public.founder_alert_dismissals enable row level security;

-- No policy is granted to anon or authenticated on purpose: every read and
-- write goes through the service role in /api/admin/*, which checks the
-- caller is an admin. A student must never be able to see, let alone close,
-- the founder's operational alerts.
comment on table public.founder_alert_dismissals is
  'Founder-closed sacred alerts. Annotation only — never changes the underlying payment/mentor fact.';
