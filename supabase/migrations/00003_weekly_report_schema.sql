-- Migration: Create Weekly Report Tables

-- 1. Weekly Manual Metrics Table
CREATE TABLE IF NOT EXISTS weekly_manual_metrics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  week_start DATE NOT NULL, -- Always a Monday
  unique_leads INT DEFAULT 0,
  rico_hot_pipeline INT DEFAULT 0,
  pivot INT DEFAULT 0,
  saved INT DEFAULT 0,
  dismissed_todos INT DEFAULT 0,
  past_due_todos INT DEFAULT 0,
  rico_past_due_tasks INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(agent_id, week_start)
);

-- RLS for weekly_manual_metrics
ALTER TABLE weekly_manual_metrics ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON weekly_manual_metrics;
CREATE POLICY "Public read" ON weekly_manual_metrics FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert" ON weekly_manual_metrics;
CREATE POLICY "Public insert" ON weekly_manual_metrics FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update" ON weekly_manual_metrics;
CREATE POLICY "Public update" ON weekly_manual_metrics FOR UPDATE USING (true);


-- 2. Weekly Reports Meta Table (for tracking submission status)
CREATE TABLE IF NOT EXISTS weekly_reports_meta (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL UNIQUE,
  manual_submitted BOOLEAN DEFAULT false,
  submitted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS for weekly_reports_meta
ALTER TABLE weekly_reports_meta ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read" ON weekly_reports_meta;
CREATE POLICY "Public read" ON weekly_reports_meta FOR SELECT USING (true);
DROP POLICY IF EXISTS "Public insert" ON weekly_reports_meta;
CREATE POLICY "Public insert" ON weekly_reports_meta FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Public update" ON weekly_reports_meta;
CREATE POLICY "Public update" ON weekly_reports_meta FOR UPDATE USING (true);
