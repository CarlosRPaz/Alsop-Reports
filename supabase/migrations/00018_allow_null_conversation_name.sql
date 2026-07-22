-- ============================================================
-- Migration 00018: Allow NULL name on chat_conversations
-- ============================================================
-- DMs compute their display name from member names at render
-- time, so they don't need a stored name.

ALTER TABLE chat_conversations ALTER COLUMN name DROP NOT NULL;
