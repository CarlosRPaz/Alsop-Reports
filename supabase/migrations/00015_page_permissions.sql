-- Page Access Permissions
-- Controls which teams can access each page/report in the dashboard.
-- Admins and Managers bypass these restrictions entirely.

CREATE TABLE IF NOT EXISTS page_permissions (
  page_key   TEXT PRIMARY KEY,
  page_label TEXT NOT NULL,
  allowed_teams TEXT[] NOT NULL DEFAULT '{Sales,CSR,EA}'
);

-- Permissive RLS (matches existing pattern)
ALTER TABLE page_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access to page_permissions"
  ON page_permissions FOR ALL USING (true) WITH CHECK (true);

-- Seed default rows — all teams allowed for every page
INSERT INTO page_permissions (page_key, page_label, allowed_teams) VALUES
  ('overview',       'Overview Dashboard',  '{Sales,CSR,EA}'),
  ('daily',          'Daily Standup',       '{Sales,CSR,EA}'),
  ('weekly',         'Weekly Report',       '{Sales,CSR,EA}'),
  ('mtd',            'MTD Performance',     '{Sales,CSR,EA}'),
  ('quotes',         'Quotes & NB',         '{Sales,CSR,EA}'),
  ('agent_portal',   'Agent Portal',        '{Sales,CSR,EA}'),
  ('communication',  'Communication Hub',   '{Sales,CSR,EA}')
ON CONFLICT (page_key) DO NOTHING;
