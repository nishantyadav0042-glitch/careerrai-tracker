-- The FOURTH copy of the attachment allowlist (app code, storage bucket, byte
-- sniffer, and this table CHECK), and the fourth to be found the same way: a
-- buddy's real .xlsx passing every other layer and dying on the last one.
-- Incident #23 said "a test must tie the copies together" — the guard now
-- covers this constraint too.
alter table public.chat_messages drop constraint if exists attachment_mime_allowed;
alter table public.chat_messages add constraint attachment_mime_allowed check (
  attachment_mime is null or attachment_mime in (
    'image/jpeg', 'image/png', 'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.ms-excel.sheet.macroEnabled.12',
    'text/csv'
  )
);
