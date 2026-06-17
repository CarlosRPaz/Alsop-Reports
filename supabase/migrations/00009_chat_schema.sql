-- ============================================================
-- Migration 00009: Chat System Schema
-- ============================================================
-- Creates the full internal messaging system:
--   - Extends agents for auth/presence
--   - Conversations (channels, DMs, groups)
--   - Conversation membership
--   - Messages with edit/delete/pin/reply
--   - @mentions
--   - Reactions
--   - Notifications
--   - Notification preferences
--   - Admin-configurable permissions
-- ============================================================

-- ── 1. Extend agents table ────────────────────────────────────
ALTER TABLE agents ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE agents ADD COLUMN IF NOT EXISTS status_message TEXT DEFAULT '';

-- Ensure role column exists with proper default
-- (role = 'admin' or 'agent' — security permission level)
-- (team = 'Sales', 'CSR', 'EA', 'Managers' — department)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agents' AND column_name = 'role'
  ) THEN
    ALTER TABLE agents ADD COLUMN role TEXT DEFAULT 'agent';
  END IF;
END $$;


-- ── 2. Chat Conversations ─────────────────────────────────────
-- Stores channels, DMs, group chats, announcements
CREATE TABLE IF NOT EXISTS chat_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'channel'
    CHECK (type IN ('channel', 'private_channel', 'group_dm', 'direct_dm', 'announcement')),
  description TEXT DEFAULT '',
  created_by UUID REFERENCES agents(id),
  icon TEXT DEFAULT '#',
  color TEXT DEFAULT '#3b82f6',
  -- Access restrictions (null = open to all)
  team_restriction TEXT[] DEFAULT NULL,
  role_restriction TEXT[] DEFAULT NULL,
  archived BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_conversations_type ON chat_conversations(type);
CREATE INDEX IF NOT EXISTS idx_chat_conversations_archived ON chat_conversations(archived);


-- ── 3. Conversation Members ───────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_conversation_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member'
    CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  muted BOOLEAN DEFAULT false,
  pinned BOOLEAN DEFAULT false,
  last_read_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ DEFAULT now(),
  left_at TIMESTAMPTZ DEFAULT NULL,
  UNIQUE(conversation_id, agent_id)
);

CREATE INDEX IF NOT EXISTS idx_chat_members_agent ON chat_conversation_members(agent_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_conversation ON chat_conversation_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_chat_members_agent_left ON chat_conversation_members(agent_id, left_at);


-- ── 4. Messages ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES agents(id),
  content TEXT NOT NULL DEFAULT '',
  -- Reply / threading
  parent_message_id UUID REFERENCES chat_messages(id) ON DELETE SET NULL,
  -- Priority
  priority TEXT DEFAULT 'normal'
    CHECK (priority IN ('normal', 'important', 'urgent')),
  -- Edit state
  is_edited BOOLEAN DEFAULT false,
  -- Soft delete
  is_deleted BOOLEAN DEFAULT false,
  deleted_by UUID REFERENCES agents(id),
  deleted_at TIMESTAMPTZ,
  -- Pin
  is_pinned BOOLEAN DEFAULT false,
  pinned_by UUID REFERENCES agents(id),
  pinned_at TIMESTAMPTZ,
  -- System messages (join/leave/pin notifications)
  is_system BOOLEAN DEFAULT false,
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_messages_conversation_date ON chat_messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_parent ON chat_messages(parent_message_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_pinned ON chat_messages(conversation_id, is_pinned) WHERE is_pinned = true;


-- ── 5. Mentions ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_message_mentions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  -- null if team/role/everyone mention
  mentioned_agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  mention_type TEXT NOT NULL
    CHECK (mention_type IN ('user', 'team', 'role', 'everyone')),
  -- The display text: agent name, "Sales", "Everyone", etc.
  mention_target TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_mentions_agent ON chat_message_mentions(mentioned_agent_id);
CREATE INDEX IF NOT EXISTS idx_chat_mentions_message ON chat_message_mentions(message_id);


-- ── 6. Reactions ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_message_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(message_id, agent_id, emoji)
);

CREATE INDEX IF NOT EXISTS idx_chat_reactions_message ON chat_message_reactions(message_id);


-- ── 7. Notifications ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS chat_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES chat_messages(id) ON DELETE CASCADE,
  type TEXT NOT NULL
    CHECK (type IN ('mention', 'dm', 'group_dm', 'urgent', 'announcement', 'reaction')),
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  is_read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_notifications_recipient ON chat_notifications(recipient_id, is_read, created_at DESC);


-- ── 8. Notification Preferences ──────────────────────────────
CREATE TABLE IF NOT EXISTS chat_notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES agents(id) ON DELETE CASCADE,
  desktop_enabled BOOLEAN DEFAULT true,
  notify_on_dm BOOLEAN DEFAULT true,
  notify_on_mentions BOOLEAN DEFAULT true,
  notify_on_team_mentions BOOLEAN DEFAULT true,
  notify_on_urgent BOOLEAN DEFAULT true,
  quiet_hours_start TIME DEFAULT NULL,
  quiet_hours_end TIME DEFAULT NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);


-- ── 9. Chat Permissions (admin-configurable) ─────────────────
-- Stores which roles/teams can perform specific actions.
-- Admins can edit these via the admin settings UI.
CREATE TABLE IF NOT EXISTS chat_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  permission_key TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  -- Who can do this: array of role names and/or team names
  -- e.g. {"admin"} or {"admin", "Managers"} or {"admin", "agent"}
  allowed_roles TEXT[] DEFAULT '{"admin"}',
  allowed_teams TEXT[] DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Seed default permissions
INSERT INTO chat_permissions (permission_key, description, allowed_roles, allowed_teams) VALUES
  ('send_everyone_mention', 'Send @Everyone mentions', '{"admin"}', '{"Managers"}'),
  ('send_team_mention', 'Send @Team mentions (e.g. @Sales)', '{"admin"}', '{"Managers"}'),
  ('pin_messages', 'Pin messages in channels', '{"admin"}', '{"Managers"}'),
  ('delete_others_messages', 'Delete other users'' messages', '{"admin"}', '{}'),
  ('create_channels', 'Create new public channels', '{"admin"}', '{}'),
  ('archive_channels', 'Archive/delete channels', '{"admin"}', '{}'),
  ('send_urgent_messages', 'Send urgent/important priority messages', '{"admin"}', '{"Managers"}'),
  ('send_announcements', 'Send announcements', '{"admin"}', '{"Managers"}'),
  ('manage_members', 'Add/remove members from channels', '{"admin"}', '{"Managers"}'),
  ('view_deleted_messages', 'View content of deleted messages', '{"admin"}', '{}')
ON CONFLICT (permission_key) DO NOTHING;


-- ── 10. Seed Default Channels ─────────────────────────────────
INSERT INTO chat_conversations (name, type, description, icon, color) VALUES
  ('All', 'channel', 'Agency-wide announcements and discussion', '📢', '#3b82f6'),
  ('Sales', 'channel', 'Sales team communication', '💰', '#10b981'),
  ('Service', 'channel', 'CSR and service team communication', '🛡️', '#8b5cf6'),
  ('Managers', 'channel', 'Manager discussion and coordination', '👔', '#f59e0b'),
  ('Admin', 'private_channel', 'Admin-only discussion', '🔒', '#ef4444')
ON CONFLICT DO NOTHING;

-- Set team/role restrictions on channels
UPDATE chat_conversations SET team_restriction = '{"Managers"}', role_restriction = '{"admin"}'
  WHERE name = 'Managers' AND type = 'channel';
UPDATE chat_conversations SET role_restriction = '{"admin"}'
  WHERE name = 'Admin' AND type = 'private_channel';


-- ── 11. RLS Policies ─────────────────────────────────────────
-- For now, using permissive policies (matching existing app pattern).
-- When Supabase Auth is added, these will be tightened to use auth.uid().

ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message_mentions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_permissions ENABLE ROW LEVEL SECURITY;

-- Permissive policies (will be replaced with auth-based policies later)
CREATE POLICY "Enable all access on chat_conversations" ON chat_conversations FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access on chat_conversation_members" ON chat_conversation_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access on chat_messages" ON chat_messages FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access on chat_message_mentions" ON chat_message_mentions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access on chat_message_reactions" ON chat_message_reactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access on chat_notifications" ON chat_notifications FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access on chat_notification_preferences" ON chat_notification_preferences FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all access on chat_permissions" ON chat_permissions FOR ALL USING (true) WITH CHECK (true);


-- ── 12. Enable Realtime ───────────────────────────────────────
-- Enable realtime for chat_messages so new messages appear live
ALTER PUBLICATION supabase_realtime ADD TABLE chat_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversations;
ALTER PUBLICATION supabase_realtime ADD TABLE chat_conversation_members;
