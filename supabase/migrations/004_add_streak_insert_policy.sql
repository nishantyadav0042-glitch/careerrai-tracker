-- Add missing INSERT policy for streak_data
-- Students need to be able to insert their own streak_data records

CREATE POLICY "Students can insert own streak_data" ON public.streak_data
  FOR INSERT WITH CHECK (student_id = auth.uid());
