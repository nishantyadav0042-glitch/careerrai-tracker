-- The bucket's own MIME allowlist is a SECOND copy of the app's allowlist,
-- and it drifted the moment spreadsheets were added to only one of them: the
-- app said yes, the bucket said 400, and the founder saw "that upload didn't
-- go through" on the buddy's real study-plan .xlsx.
update storage.buckets
set allowed_mime_types = array[
  'image/jpeg', 'image/png', 'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  -- .xlsx
  'application/vnd.ms-excel',                                            -- .xls
  'application/vnd.ms-excel.sheet.macroEnabled.12',                      -- .xlsm
  'text/csv'
]
where id = 'chat-attachments';
