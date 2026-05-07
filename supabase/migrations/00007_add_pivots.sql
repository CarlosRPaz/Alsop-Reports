-- Add pivots column to daily_metrics for eAgent manual entry
ALTER TABLE daily_metrics ADD COLUMN IF NOT EXISTS pivots INTEGER DEFAULT 0;
