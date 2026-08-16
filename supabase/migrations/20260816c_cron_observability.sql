-- Notification Reliability V2, Installment 3, Batch 4 — scheduler
-- observability. 38 crons are declared in vercel.json; the GitHub Actions
-- fallback (cron-fallback.yml) only duplicates 12 of them — decision-engine
-- is among the 12, confirming Installment 1's dedup fix (the proven
-- duplicate-send bug) targeted the actual dual-scheduled path. Until this
-- table, "a cron ran and sent nothing" and "a cron never ran" were
-- indistinguishable — nothing recorded either fact anywhere.
create table if not exists cron_runs (
  id bigint generated always as identity primary key,
  cron_path text not null,
  trigger_source text not null default 'vercel', -- 'vercel' | 'github_fallback' | 'manual'
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  duration_ms integer,
  result jsonb,
  fatal_error text
);

create index if not exists cron_runs_path_started_idx on cron_runs (cron_path, started_at desc);

comment on table cron_runs is
  'One row per cron invocation, written by withCronTracking() in src/lib/cron-run-tracker.ts. started_at is stamped on entry, before the handler runs, so a crashed/timed-out invocation still leaves a row with completed_at=null — distinguishing "ran and crashed" from "never ran" from "ran and found nothing to do".';
