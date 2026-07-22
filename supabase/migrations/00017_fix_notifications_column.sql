-- ============================================================
-- Migration 00017: Fix chat_notifications column name
-- ============================================================
-- The schema created `recipient_id` but all application code
-- uses `agent_id`. Rename for consistency.

ALTER TABLE chat_notifications RENAME COLUMN recipient_id TO agent_id;

-- Re-create the index with the new column name
DROP INDEX IF EXISTS idx_chat_notifications_recipient;
CREATE INDEX IF NOT EXISTS idx_chat_notifications_agent
  ON chat_notifications(agent_id, is_read, created_at DESC);
