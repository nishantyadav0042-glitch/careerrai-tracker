-- TRUST-OS rule 1: "No invented testimonials or stats. Ever." / "Never invent,
-- never edit a student's words."
--
-- Daily Pick renders every item as "— <name>, CareerRai student". That line is
-- true for a real submission (the first name is anonymisation, the words are
-- the student's). It is NOT true for the 28 rows seeded on 25 Jul, which are
-- all owned by the founder's own admin account and carry invented student first
-- names. Curated content is fine — presenting it as another student's is the
-- thing the Constitution forbids, and it is the same class of misrepresentation
-- that got iOS 1.0 rejected under 2.3.10.
--
-- So the row now says which it is, and the UI attributes it honestly.
alter table public.student_submissions
  add column if not exists curated boolean not null default false;

comment on column public.student_submissions.curated is
  'True = authored by CareerRai, not submitted by a student. Drives the attribution line in Daily Pick; must never render as a student quote.';

-- Every existing row is founder-authored (single admin student_id, seeded in
-- one batch). Relabel rather than delete: the content is good, the byline was
-- the problem.
update public.student_submissions s
   set curated = true
  from public.profiles p
 where p.id = s.student_id and p.role = 'admin';
