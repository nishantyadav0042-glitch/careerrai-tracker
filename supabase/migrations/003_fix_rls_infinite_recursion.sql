-- Fix infinite recursion in RLS policies
-- The Admin policy was causing infinite recursion by checking profiles in a subquery
-- Solution: Drop and recreate with SECURITY DEFINER function

-- Drop the problematic policies
DROP POLICY IF EXISTS "Admin reads all profiles" ON public.profiles;
DROP POLICY IF EXISTS "Admin reads all reports" ON public.daily_reports;
DROP POLICY IF EXISTS "Admin reads all feedback" ON public.buddy_feedback;
DROP POLICY IF EXISTS "Admin reads all test results" ON public.test_results;

-- Create a helper function to check if user is admin (SECURITY DEFINER prevents recursion)
CREATE OR REPLACE FUNCTION is_admin(user_id uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 FROM auth.users WHERE id = user_id AND raw_user_meta_data->>'role' = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate admin policies using the helper function
CREATE POLICY "Admin reads all profiles"
  ON public.profiles FOR ALL
  USING (is_admin(auth.uid()));

CREATE POLICY "Admin reads all reports"
  ON public.daily_reports FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admin reads all feedback"
  ON public.buddy_feedback FOR SELECT
  USING (is_admin(auth.uid()));

CREATE POLICY "Admin reads all test results"
  ON public.test_results FOR SELECT
  USING (is_admin(auth.uid()));
