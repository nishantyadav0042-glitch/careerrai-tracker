-- Notification OS Phase 1 — the Measurement layer + ladder anchors.
--
-- notifications gains "Signals → Decision → Action → MEASUREMENT": why a
-- send happened (reason), what behaviour it was trying to cause
-- (expected_action), and what actually happened per channel. All nullable —
-- historical rows simply predate measurement.

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS reason TEXT,
  ADD COLUMN IF NOT EXISTS expected_action TEXT,
  ADD COLUMN IF NOT EXISTS pushed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS emailed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS clicked_at TIMESTAMPTZ;

COMMENT ON COLUMN public.notifications.reason IS
  'Human-readable: which signal/threshold caused this send. Never "cron".';
COMMENT ON COLUMN public.notifications.expected_action IS
  'log_today | finish_builder | open_plan — the behaviour this send tries to cause; the health dashboard measures whether it happened.';
COMMENT ON COLUMN public.notifications.pushed_at IS
  'Web push accepted by the push service. NOT delivery — web push has no delivery receipt, so this is the deepest honest stage.';
COMMENT ON COLUMN public.notifications.clicked_at IS
  'Stamped by the service-worker click beacon (/api/push/click).';

-- Ladder anchors on profiles:
--  - onboarding_last_activity_at: when the student last advanced a Builder
--    screen. Builder-recovery touches (30min/24h/72h) are timed from it,
--    and after completion it doubles as the activation-ladder anchor.
--  - push_died_at: the endpoint returned 410/404 (usually an uninstall).
--    Cleared on re-subscribe. A CRM signal: push can no longer reach them.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_last_activity_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS push_died_at TIMESTAMPTZ;

COMMENT ON COLUMN public.profiles.onboarding_last_activity_at IS
  'Last Builder step advance (or completion). Anchor for builder-recovery and activation ladders.';
COMMENT ON COLUMN public.profiles.push_died_at IS
  'Push endpoint 410/404 — likely uninstall. Cleared when a new subscription arrives.';

-- The budget gate and cooldown check both query (user_id, type, created_at).
CREATE INDEX IF NOT EXISTS idx_notifications_user_type_created
  ON public.notifications (user_id, type, created_at DESC);
