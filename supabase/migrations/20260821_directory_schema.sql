-- Office Directory Schema

CREATE TABLE IF NOT EXISTS directory_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id UUID REFERENCES directory_groups(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT,
  group_type TEXT NOT NULL DEFAULT 'custom', -- 'office', 'helpful_numbers', 'carriers', 'custom'
  address TEXT,
  office_phone TEXT,
  fax TEXT,
  toll_free_phone TEXT,
  email TEXT,
  office_identifiers TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS directory_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID NOT NULL REFERENCES directory_groups(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  position TEXT,
  role TEXT,
  sca_code TEXT,
  sub_code TEXT,
  email TEXT,
  ricochet_phone TEXT,
  ring_central_phone TEXT,
  primary_phone TEXT,
  secondary_phone TEXT,
  notes TEXT,
  display_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for common searches
CREATE INDEX IF NOT EXISTS idx_directory_groups_type ON directory_groups(group_type);
CREATE INDEX IF NOT EXISTS idx_directory_groups_active ON directory_groups(is_active);
CREATE INDEX IF NOT EXISTS idx_directory_entries_group ON directory_entries(group_id);
CREATE INDEX IF NOT EXISTS idx_directory_entries_active ON directory_entries(is_active);

-- Enable RLS
ALTER TABLE directory_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE directory_entries ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to make it idempotent
DROP POLICY IF EXISTS "Groups are viewable by authenticated users" ON directory_groups;
DROP POLICY IF EXISTS "Groups can be inserted by admins" ON directory_groups;
DROP POLICY IF EXISTS "Groups can be updated by admins" ON directory_groups;
DROP POLICY IF EXISTS "Groups can be deleted by admins" ON directory_groups;

DROP POLICY IF EXISTS "Entries are viewable by authenticated users" ON directory_entries;
DROP POLICY IF EXISTS "Entries can be inserted by admins" ON directory_entries;
DROP POLICY IF EXISTS "Entries can be updated by admins" ON directory_entries;
DROP POLICY IF EXISTS "Entries can be deleted by admins" ON directory_entries;

-- Policies for directory_groups
CREATE POLICY "Groups are viewable by authenticated users" 
ON directory_groups FOR SELECT 
TO authenticated 
USING (
  is_active = true 
  OR EXISTS (
    SELECT 1 FROM agents 
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Groups can be inserted by admins" 
ON directory_groups FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM agents 
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Groups can be updated by admins" 
ON directory_groups FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM agents 
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Groups can be deleted by admins" 
ON directory_groups FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM agents 
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  )
);

-- Policies for directory_entries
CREATE POLICY "Entries are viewable by authenticated users" 
ON directory_entries FOR SELECT 
TO authenticated 
USING (
  is_active = true 
  OR EXISTS (
    SELECT 1 FROM agents 
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Entries can be inserted by admins" 
ON directory_entries FOR INSERT 
TO authenticated 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM agents 
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Entries can be updated by admins" 
ON directory_entries FOR UPDATE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM agents 
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  )
);

CREATE POLICY "Entries can be deleted by admins" 
ON directory_entries FOR DELETE 
TO authenticated 
USING (
  EXISTS (
    SELECT 1 FROM agents 
    WHERE auth_user_id = auth.uid() AND role = 'admin'
  )
);

-- Function to update timestamp
CREATE OR REPLACE FUNCTION update_directory_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
   NEW.updated_at = NOW();
   RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
DROP TRIGGER IF EXISTS update_directory_groups_updated_at ON directory_groups;
CREATE TRIGGER update_directory_groups_updated_at
BEFORE UPDATE ON directory_groups
FOR EACH ROW EXECUTE PROCEDURE update_directory_updated_at_column();

DROP TRIGGER IF EXISTS update_directory_entries_updated_at ON directory_entries;
CREATE TRIGGER update_directory_entries_updated_at
BEFORE UPDATE ON directory_entries
FOR EACH ROW EXECUTE PROCEDURE update_directory_updated_at_column();
