-- Full-journey event telemetry (15 Jul 2026).
--
-- Why: the daily-log failure traced back to a blind spot — students granted
-- push permission in ordinary BROWSER TABS (Safari / Chrome / the Instagram
-- in-app browser), never inside the installed app. A browser-tab subscription
-- is bound to that tab's service worker and often can't deliver (iOS Safari web
-- push to a non-installed site barely works), so notifications silently never
-- arrived. Nothing in the schema recorded the ONE dimension that would have
-- shown this: was an event in the installed app (standalone) or a browser?
--
-- This table records every meaningful moment with that context attached, so a
-- student's whole journey — first click to last click — is reconstructable, and
-- "push granted in a browser" is distinguishable from "push granted in the app".

CREATE TABLE IF NOT EXISTS public.student_events (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  anon_id      text,                 -- cr_anon cookie: links pre-auth clicks to the student
  session_id   text,                 -- one browsing session
  event        text NOT NULL,        -- app_open, pageview, push_enabled, install_accepted, daily_log, …
  props        jsonb NOT NULL DEFAULT '{}'::jsonb,
  display_mode text,                 -- 'standalone' (real app) | 'browser' | 'twa' | 'unknown'
  browser      text,                 -- chrome | safari | instagram | samsung | firefox | edge | other
  platform     text,                 -- android | ios | desktop
  path         text,                 -- route the event fired on
  ip           text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_events_user    ON public.student_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_events_anon    ON public.student_events (anon_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_events_event   ON public.student_events (event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_student_events_mode    ON public.student_events (display_mode);
CREATE INDEX IF NOT EXISTS idx_student_events_created ON public.student_events (created_at DESC);

-- Service-role only (the admin client bypasses RLS); deny anon/authenticated.
ALTER TABLE public.student_events ENABLE ROW LEVEL SECURITY;

-- Where a student's push permission was actually granted: 'standalone' = real
-- installed-app push (deliverable), 'browser' = browser-tab push (often not
-- deliverable, esp. iOS). NULL = granted before this shipped / unknown.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_context text;

-- Convenience: full ordered timeline for one student (first click to last).
CREATE OR REPLACE VIEW public.v_student_timeline AS
SELECT e.user_id, e.created_at, e.event, e.display_mode, e.browser, e.platform, e.path, e.props
FROM public.student_events e
ORDER BY e.user_id, e.created_at;
