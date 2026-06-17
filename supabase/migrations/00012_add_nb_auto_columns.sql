-- Migration: 00012_add_nb_auto_columns.sql
-- Add Standard Auto-specific columns to daily_metrics for separate close rate reporting

ALTER TABLE daily_metrics 
ADD COLUMN IF NOT EXISTS nb_auto_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS nb_auto_items INTEGER DEFAULT 0;
