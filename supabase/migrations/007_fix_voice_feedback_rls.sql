-- Fix RLS policies for voice feedback to allow students to send responses

-- Drop the overly restrictive policy
DROP POLICY IF EXISTS "Buddy manages own feedback" ON public.buddy_feedback;

-- Create separate policies for buddies and students
CREATE POLICY "Buddy can insert feedback for their students"
  ON public.buddy_feedback FOR INSERT
  WITH CHECK (buddy_id = auth.uid());

CREATE POLICY "Student can send voice responses"
  ON public.buddy_feedback FOR INSERT
  WITH CHECK (student_id = auth.uid());

-- Allow reading feedback you're involved in
CREATE POLICY "Can read relevant feedback"
  ON public.buddy_feedback FOR SELECT
  USING (
    buddy_id = auth.uid() OR
    student_id = auth.uid()
  );

-- Allow updating own feedback
CREATE POLICY "Can update own feedback"
  ON public.buddy_feedback FOR UPDATE
  USING (buddy_id = auth.uid())
  WITH CHECK (buddy_id = auth.uid());
