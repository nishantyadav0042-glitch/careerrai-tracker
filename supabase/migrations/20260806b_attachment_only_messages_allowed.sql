-- A message must say something OR show something.
--
-- The chat-attachments migration added five attachment constraints but never
-- touched the pre-existing body check, which still demanded >= 1 character.
-- The API deliberately allows an attachment with no caption, so every
-- caption-less image failed at the database with a 23514 — found by the
-- founder's own first test send (6 Aug, 21:53 IST).
alter table public.chat_messages drop constraint chat_messages_body_check;
alter table public.chat_messages add constraint chat_messages_body_check
  check (
    char_length(body) <= 2000
    and (char_length(body) >= 1 or attachment_path is not null)
  );
