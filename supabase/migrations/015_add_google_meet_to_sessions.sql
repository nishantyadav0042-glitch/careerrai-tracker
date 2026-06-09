-- Add Google Calendar and Meet link columns to video_sessions
ALTER TABLE video_sessions
ADD COLUMN google_event_id TEXT,
ADD COLUMN google_meet_link TEXT;

-- Add comment
COMMENT ON COLUMN video_sessions.google_event_id IS 'Google Calendar event ID for this session';
COMMENT ON COLUMN video_sessions.google_meet_link IS 'Real Google Meet link from Calendar API (hangoutLink)';

-- Create index for easier lookups
CREATE INDEX idx_video_sessions_google_event_id ON video_sessions(google_event_id);
