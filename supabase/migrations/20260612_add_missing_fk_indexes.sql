-- Cover foreign keys flagged by the Supabase performance advisor.
-- session_requests is queried on every student homepage + buddy homepage load.
CREATE INDEX IF NOT EXISTS idx_session_requests_student_status ON public.session_requests (student_id, status);
CREATE INDEX IF NOT EXISTS idx_session_requests_buddy_status ON public.session_requests (buddy_id, status);
CREATE INDEX IF NOT EXISTS idx_buddy_feedback_buddy_id ON public.buddy_feedback (buddy_id);
CREATE INDEX IF NOT EXISTS idx_feedback_buddy_id ON public.feedback (buddy_id);
CREATE INDEX IF NOT EXISTS idx_streak_shields_granted_by ON public.streak_shields (granted_by);
CREATE INDEX IF NOT EXISTS idx_todo_items_created_by ON public.todo_items (created_by);
