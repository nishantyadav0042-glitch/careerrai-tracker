-- Add title and description columns to video_sessions
ALTER TABLE video_sessions
ADD COLUMN IF NOT EXISTS title TEXT,
ADD COLUMN IF NOT EXISTS description TEXT;
