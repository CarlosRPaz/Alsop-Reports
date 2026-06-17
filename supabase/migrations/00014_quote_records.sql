-- Create quote_records table to store individual quotes for cross-day deduplication
CREATE TABLE IF NOT EXISTS quote_records (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id UUID REFERENCES upload_history(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  quote_control_number TEXT NOT NULL,
  product TEXT,
  premium NUMERIC,
  sub_producer TEXT,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Ensure we don't insert duplicate rows for the same quote on the same day for the same agent
ALTER TABLE quote_records DROP CONSTRAINT IF EXISTS quote_records_date_agent_control_unique;
ALTER TABLE quote_records ADD CONSTRAINT quote_records_date_agent_control_unique UNIQUE (report_date, agent_id, quote_control_number);

-- Add index for fast querying by date and agent
CREATE INDEX IF NOT EXISTS idx_quote_records_date_agent ON quote_records(report_date, agent_id);
CREATE INDEX IF NOT EXISTS idx_quote_records_upload_id ON quote_records(upload_id);

-- Enable RLS
ALTER TABLE quote_records ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (anon policy matching existing ones)
CREATE POLICY "Allow all on quote_records" ON quote_records FOR ALL USING (true) WITH CHECK (true);

-- Update the check constraint on upload_history status to allow 'processing'
ALTER TABLE upload_history DROP CONSTRAINT IF EXISTS upload_history_status_check;
ALTER TABLE upload_history ADD CONSTRAINT upload_history_status_check CHECK (status IN ('processing', 'success', 'error', 'reassigned', 'deleted'));
