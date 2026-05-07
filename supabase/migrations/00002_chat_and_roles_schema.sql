-- Phase 2: Roles, Presence, and Communication Hub

-- 1. Extend Agents Table
ALTER TABLE agents ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'agent'; -- 'admin', 'agent'
ALTER TABLE agents ADD COLUMN IF NOT EXISTS presence TEXT DEFAULT 'offline'; -- 'online', 'away', 'busy', 'offline'

-- 2. Chat Rooms
CREATE TABLE IF NOT EXISTS chat_rooms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    is_private BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Seed default global rooms
INSERT INTO chat_rooms (name, description) VALUES
    ('All', 'Global agency chat for everyone'),
    ('Managers', 'Private channel for managers'),
    ('Sales', 'Sales team coordination'),
    ('Service', 'Service team coordination')
ON CONFLICT (name) DO NOTHING;

-- 3. Room Messages
CREATE TABLE IF NOT EXISTS messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    room_id UUID REFERENCES chat_rooms(id) ON DELETE CASCADE,
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Private / Direct Messages
CREATE TABLE IF NOT EXISTS private_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    receiver_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    read BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS setup (simple passthrough for now, can be restricted by auth.uid() later)
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE private_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Enable full access for all" ON chat_rooms FOR ALL USING (true);
CREATE POLICY "Enable full access for all" ON messages FOR ALL USING (true);
CREATE POLICY "Enable full access for all" ON private_messages FOR ALL USING (true);
