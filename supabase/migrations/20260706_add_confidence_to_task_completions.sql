-- Engine v2, Part 4 (confidence-aware planning): a real 🟢/🟡/🔴 signal
-- captured right after a task is marked done, distinct from the Coverage
-- Matrix's own manual self-audit grid. Nullable — most historical rows (and
-- any task the student doesn't tag) simply have no signal, which is the
-- correct honest state, not a fabricated default.
ALTER TABLE public.routine_task_completions
  ADD COLUMN IF NOT EXISTS confidence text
    CHECK (confidence IS NULL OR confidence IN ('green', 'yellow', 'red'));
