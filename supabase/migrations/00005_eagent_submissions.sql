-- Migration: 00005_eagent_submissions.sql
-- Add a table to track whether manual eAgent data was submitted for a specific date

CREATE TABLE IF NOT EXISTS daily_reports_meta (
    report_date DATE PRIMARY KEY,
    eagent_submitted BOOLEAN DEFAULT false,
    submitted_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE daily_reports_meta ENABLE ROW LEVEL SECURITY;

-- Allow read/write for now
CREATE POLICY "Enable read access for all users" ON daily_reports_meta FOR SELECT USING (true);
CREATE POLICY "Enable insert access for all users" ON daily_reports_meta FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON daily_reports_meta FOR UPDATE USING (true);
