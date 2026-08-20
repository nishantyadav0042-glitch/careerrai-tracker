-- ── Daily Pick: one live pool, permanent content, one-day top placement ─────
--
-- THE BUG THIS FIXES (found 20 Aug, production-quantified): the feed showed
-- items with status 'archived' but /api/community/vote refused them, so 40 of
-- the 60 items a student could see — 5 of the first 8 cards — answered a vote
-- tap with 400 "Voting is closed for this one", and the vote visibly
-- disappeared. That is the founder's report ("students are coming but their
-- votes are not being counted") in its literal, mechanical form.
--
-- ROOT CAUSE: two generations of the same product lived in this one table.
--   Gen 1 (moderation queue): pending → approved/rejected, payload as MCQ.
--                             0 rows ever. Its promotion path reads
--                             payload.options, which Gen 2 never writes.
--   Gen 2 (ballot rotation):  voting (72h) → archived → revived, payload as
--                             free text. All 88 rows. The 72h window is what
--                             closes voting.
-- The FEED spoke Gen 2's "show everything"; the VOTE ROUTE spoke Gen 2's
-- ballot rules. Same table, two vocabularies, one contradiction.
--
-- FOUNDER RULING (20 Aug): content is permanent, top placement lasts one day.
-- A ballot that closes voting is the opposite of that. So the ballot retires
-- and the vocabulary collapses to what the product actually has:
--
--   live     — visible and votable. The normal state. Forever.
--   pending  — the safety screen wants a human before anyone sees it.
--   blocked  — failed the safety screen.
--   rejected — a human said no.
--
-- What does NOT change: the featured_on rotation (lib/daily-pick.ts) already
-- implements the founder's rule exactly — one item per kind holds the top
-- slot for exactly one day, never repeats while fresh stock exists, no vote
-- threshold, zero votes is not a blocker. That engine is kept whole.
--
-- Data: 88 rows, all founder-seeded, no student content at risk. 20 'voting'
-- and 68 'archived' become 'live'; their votes are untouched (submission_votes
-- references id, which does not change).
--
-- Reversal: the status values are a superset-compatible rename; restoring the
-- ballot would need the 20260820e revert plus the code commit.

alter table public.student_submissions drop constraint if exists student_submissions_status_check;

update public.student_submissions
   set status = 'live', voting_ends_at = null
 where status in ('voting', 'archived', 'featured', 'approved');

alter table public.student_submissions
  add constraint student_submissions_status_check
  check (status in ('live', 'pending', 'blocked', 'rejected'));

comment on column public.student_submissions.status is
  'live = visible and votable (permanent); pending = awaiting human safety review; blocked = failed safety; rejected = human said no. The 72h ballot (voting/archived) retired 20 Aug — it was closing votes on 77% of the visible feed.';

comment on column public.student_submissions.voting_ends_at is
  'DEPRECATED (20 Aug): the ballot window retired. Nothing reads or writes it; a live item is votable forever. Column dropped after a soak.';

comment on column public.student_submissions.featured_on is
  'The ONE day this item held the top slot. Set by promoteDailyPick. Content is permanent; only the top placement is a single day.';
