-- Add speaks_spanish boolean column to agents table
-- This enables filtering agents by Spanish language capability
-- on the Staff page and Agent HUD dashboard
ALTER TABLE agents ADD COLUMN IF NOT EXISTS speaks_spanish BOOLEAN DEFAULT false;
