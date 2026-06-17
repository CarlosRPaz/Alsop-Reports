-- Add auth columns to agents table for login system
ALTER TABLE agents ADD COLUMN IF NOT EXISTS email TEXT UNIQUE;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS auth_user_id UUID UNIQUE;

-- Index for fast lookups by auth_user_id
CREATE INDEX IF NOT EXISTS idx_agents_auth_user_id ON agents(auth_user_id);
