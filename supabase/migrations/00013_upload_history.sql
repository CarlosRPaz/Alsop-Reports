-- Upload history tracking
-- Records each upload batch and individual files for audit trail and date reassignment

CREATE TABLE IF NOT EXISTS upload_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  uploaded_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  target_date DATE NOT NULL,
  status TEXT DEFAULT 'success' CHECK (status IN ('success', 'error', 'reassigned', 'deleted')),
  file_count INT DEFAULT 0,
  source_types TEXT[] DEFAULT '{}',
  logs TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS upload_history_files (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_id UUID REFERENCES upload_history(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  file_type TEXT NOT NULL,
  file_label TEXT,
  has_internal_date BOOLEAN DEFAULT false,
  target_date DATE NOT NULL,
  original_date DATE,
  file_size_bytes INT,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'reassigned', 'deleted'))
);

CREATE INDEX IF NOT EXISTS idx_upload_history_uploaded_at ON upload_history(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_history_target_date ON upload_history(target_date DESC);
CREATE INDEX IF NOT EXISTS idx_upload_history_files_upload_id ON upload_history_files(upload_id);

-- Allow anon access (matches existing table policies)
ALTER TABLE upload_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_history_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on upload_history" ON upload_history FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on upload_history_files" ON upload_history_files FOR ALL USING (true) WITH CHECK (true);
