-- Clean up test and duplicate recordings
-- This removes records with invalid feedback_type and old test data

-- Remove records with invalid or null feedback_type
DELETE FROM public.buddy_feedback
WHERE feedback_type IS NULL
   OR feedback_type = ''
   OR feedback_type = 'voice_note'
   OR feedback_type = 'adhoc';

-- Remove self-feedback (where buddy_id = student_id)
DELETE FROM public.buddy_feedback
WHERE buddy_id = student_id;

-- Ensure remaining records have correct feedback_type
UPDATE public.buddy_feedback
SET feedback_type = CASE
  WHEN voice_note_url IS NOT NULL THEN 'buddy_feedback'
  WHEN feedback_text IS NOT NULL THEN 'text'
  ELSE 'buddy_feedback'
END
WHERE feedback_type NOT IN ('buddy_feedback', 'text', 'student_response');

-- Verify cleanup
SELECT
  feedback_type,
  COUNT(*) as count,
  COUNT(voice_note_url) as with_audio
FROM public.buddy_feedback
GROUP BY feedback_type;
