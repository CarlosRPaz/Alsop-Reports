-- Add toast_enabled column to notification preferences
ALTER TABLE chat_notification_preferences
  ADD COLUMN IF NOT EXISTS toast_enabled BOOLEAN DEFAULT true;
