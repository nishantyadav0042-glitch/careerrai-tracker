-- Step 13: the founder speedometer. Real student devices report how long
-- they actually waited (TTFB / FCP / LCP / route changes), tagged with
-- device + connection class. Read by /admin/perf. Service-role writes only
-- (RLS enabled, no policies) — students can never read each other's rows.

CREATE TABLE IF NOT EXISTS public.perf_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  path        TEXT NOT NULL,
  metric      TEXT NOT NULL,   -- ttfb | fcp | lcp | interactive | nav
  value_ms    INTEGER NOT NULL,
  device      TEXT,            -- coarse UA class, e.g. "android", "ios", "desktop"
  connection  TEXT,            -- navigator.connection.effectiveType, e.g. "4g"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.perf_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_perf_events_created
  ON public.perf_events (created_at DESC);
