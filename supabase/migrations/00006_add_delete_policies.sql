-- Migration: 00006_add_delete_policies.sql
-- Add DELETE policies so we can clean up bad data

CREATE POLICY "Enable delete access for all users" ON daily_metrics FOR DELETE USING (true);
CREATE POLICY "Enable delete access for all users" ON leads_snapshot FOR DELETE USING (true);
CREATE POLICY "Enable delete access for all users" ON agents FOR DELETE USING (true);
CREATE POLICY "Enable delete access for all users" ON daily_reports_meta FOR DELETE USING (true);
