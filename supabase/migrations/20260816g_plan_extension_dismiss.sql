-- Plan-extension banner: dismiss must persist, not live in useState.
--
-- Student report, 16 Aug (Nishant, testing his own account): dismissed the
-- "your finish date has moved" banner three separate times, and it kept
-- coming back on every reopen. Traced to plan-extended-alert.tsx: the X
-- button only ever set local component state (`useState(false)`) — nothing
-- was written anywhere, so a reload/reopen always starts from `dismissed =
-- false` again. The founder's own intent for this banner (6 Aug comment in
-- that file) was explicitly "shown once" — the implementation never made
-- that durable.

alter table plan_extensions
  add column if not exists dismissed_at timestamptz null;
