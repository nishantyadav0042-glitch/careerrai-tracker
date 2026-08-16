-- Notification Reliability V2, Installment 4, Batch A — app-open
-- attribution. Before this, the codebase had no way to prove "the student
-- opened CareerRai because of this exact notification" — only "the
-- notification was tapped" (clicked_at) and separately "the student was
-- active sometime after" (student_events, which this project's own founder
-- instructions explicitly forbid inferring causality from). This column is
-- the missing link, written ONLY by an explicit signal carrying the
-- notification's own canonical id — never inferred.
alter table notifications add column if not exists app_opened_at timestamptz;

comment on column notifications.app_opened_at is
  'Set ONLY by /api/push/app-open, itself fired ONLY when the client can prove it was opened via this exact notification id — either the notifId query param sw.js attaches to a cold-start openWindow(), or a postMessage sw.js sends a client it focused instead of opening. Never inferred from generic activity within a time window.';
