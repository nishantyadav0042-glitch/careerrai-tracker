-- Preparation CRM foundations.
--
-- 1. onboarding_step_reached — the per-step drop marker. The Builder already
--    saves answers progressively; this records HOW FAR every student got, so
--    the admin Leads view can say "dropped at Exam Context" instead of just
--    "incomplete". Written fire-and-forget on every step transition.
alter table profiles
  add column if not exists onboarding_step_reached smallint not null default 0;

-- 2. lead_outreach — the team's working state per lead. Deliberately only
--    the five fields the founder approved (owner, status, follow-up, notes)
--    and nothing more. Service-role access only: RLS enabled with no
--    policies, so students can never read the sales team's notes about them.
create table if not exists lead_outreach (
  student_id uuid primary key references profiles(id) on delete cascade,
  owner text,
  status text not null default 'not_contacted'
    check (status in ('not_contacted', 'called', 'interested', 'follow_up', 'converted', 'not_interested')),
  next_follow_up date,
  notes text,
  updated_at timestamptz not null default now()
);

alter table lead_outreach enable row level security;
