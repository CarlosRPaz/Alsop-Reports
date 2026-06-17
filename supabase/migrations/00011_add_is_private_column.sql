-- Migration 00011: Add is_private column to chat_conversations
-- Run this in your Supabase SQL Editor (https://supabase.com/dashboard)
ALTER TABLE chat_conversations ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;
