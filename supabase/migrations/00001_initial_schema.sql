-- Supabase Schema for DSR Automation

-- 1. Agents Table (Replaces the Spine)
CREATE TABLE IF NOT EXISTS agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    team TEXT,
    office TEXT,
    active BOOLEAN DEFAULT true,
    
    -- Store name variants across systems (e.g. {"rc": "Carlos P.", "rico": "Carlos Paz"})
    system_variants JSONB DEFAULT '{}'::jsonb,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Daily Metrics Table
CREATE TABLE IF NOT EXISTS daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    
    -- RingCentral / Call data
    calls INTEGER DEFAULT 0,
    inbound INTEGER DEFAULT 0,
    outbound INTEGER DEFAULT 0,
    talk_time_seconds INTEGER DEFAULT 0,
    
    -- HiSales / Text data
    texts INTEGER DEFAULT 0,
    out_texts INTEGER DEFAULT 0,
    opt_ins INTEGER DEFAULT 0,
    opt_outs INTEGER DEFAULT 0,
    
    -- Quotes
    quotes INTEGER DEFAULT 0,
    
    -- New Business
    nb_count INTEGER DEFAULT 0,
    items INTEGER DEFAULT 0,
    written_premium NUMERIC(10, 2) DEFAULT 0.0,
    
    -- Premium (AgencyZoom)
    prem_premium NUMERIC(10, 2) DEFAULT 0.0,
    prem_items INTEGER DEFAULT 0,
    prem_points NUMERIC(10, 2) DEFAULT 0.0,
    
    -- Screenshots (To-dos)
    dismissed_todos INTEGER DEFAULT 0,
    past_due_todos INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    UNIQUE(agent_id, report_date)
);

-- 3. Leads Snapshot
CREATE TABLE IF NOT EXISTS leads_snapshot (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID REFERENCES agents(id) ON DELETE CASCADE,
    report_date DATE NOT NULL,
    
    contact INTEGER DEFAULT 0,
    quoted INTEGER DEFAULT 0,
    hot INTEGER DEFAULT 0,
    xsale INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    UNIQUE(agent_id, report_date)
);

-- Enable Row Level Security (RLS)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads_snapshot ENABLE ROW LEVEL SECURITY;

-- Allow all read/write for now (can be restricted later with auth)
CREATE POLICY "Enable read access for all users" ON agents FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON daily_metrics FOR SELECT USING (true);
CREATE POLICY "Enable read access for all users" ON leads_snapshot FOR SELECT USING (true);

-- To allow the Python script to insert without user auth, we would ideally use a Service Role Key, 
-- which bypasses RLS. But if we want the anon key to be able to insert for testing:
CREATE POLICY "Enable insert access for all users" ON daily_metrics FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON daily_metrics FOR UPDATE USING (true);

CREATE POLICY "Enable insert access for all users" ON leads_snapshot FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON leads_snapshot FOR UPDATE USING (true);

CREATE POLICY "Enable insert access for all users" ON agents FOR INSERT WITH CHECK (true);
CREATE POLICY "Enable update access for all users" ON agents FOR UPDATE USING (true);
