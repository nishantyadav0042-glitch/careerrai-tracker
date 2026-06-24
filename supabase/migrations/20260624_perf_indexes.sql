-- Performance indexes for the three hottest query patterns:
-- 1. buddy-escalation: unanswered chat messages (read_at IS NULL + created_at filter)
-- 2. buddy-escalation + weekly-digest: feedback lookup by buddy (buddy_id + created_at)
-- 3. buddy-escalation: unanswered mock debriefs (created_at filter)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_chat_messages_unread
  ON chat_messages (created_at DESC)
  WHERE read_at IS NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_buddy_feedback_buddy_date
  ON buddy_feedback (buddy_id, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_mock_debriefs_created
  ON mock_debriefs (created_at DESC);
