-- Phase 5: Goal Management Schema

CREATE TABLE IF NOT EXISTS kpi_goals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    metric_name TEXT NOT NULL, -- 'calls', 'texts', 'quotes', 'nb_count', 'items', 'written_premium'
    timeframe TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'ytd', 'campaign'
    target_value NUMERIC NOT NULL,
    office TEXT, -- nullable. If null, applies to all offices.
    team TEXT, -- nullable. If null, applies to all teams.
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE kpi_goals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable full access for all" ON kpi_goals FOR ALL USING (true);

-- Seed a few default goals so it's not empty
INSERT INTO kpi_goals (metric_name, timeframe, target_value) VALUES
    ('calls', 'daily', 50),
    ('quotes', 'daily', 10),
    ('items', 'monthly', 30),
    ('written_premium', 'ytd', 500000)
ON CONFLICT DO NOTHING;
