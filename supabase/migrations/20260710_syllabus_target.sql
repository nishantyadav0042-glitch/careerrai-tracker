-- Target Commitment v1: the student-chosen syllabus finish date. Set once
-- in the Builder's finish-date chooser (hours + date picked together, with
-- the trade-off visible), shown on Home as "Your target: 30 September",
-- renegotiable later. NULL = student predates the feature / never chose.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS syllabus_target_date DATE;

COMMENT ON COLUMN public.profiles.syllabus_target_date IS
  'Student-chosen syllabus finish date (Builder finish-date chooser). The commitment, not a system projection.';
