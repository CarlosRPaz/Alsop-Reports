-- Phase 8: Holiday Calendar Schema
-- Tracks observed holidays to exclude from business day calculations

CREATE TABLE IF NOT EXISTS holidays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    holiday_date DATE NOT NULL UNIQUE,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

ALTER TABLE holidays ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable full access for all" ON holidays FOR ALL USING (true);

-- Pre-seed 2026 US Federal Holidays
INSERT INTO holidays (holiday_date, name) VALUES
    ('2026-01-01', 'New Year''s Day'),
    ('2026-01-19', 'Martin Luther King Jr. Day'),
    ('2026-02-16', 'Presidents'' Day'),
    ('2026-05-25', 'Memorial Day'),
    ('2026-07-03', 'Independence Day (Observed)'),
    ('2026-09-07', 'Labor Day'),
    ('2026-11-26', 'Thanksgiving Day'),
    ('2026-11-27', 'Day After Thanksgiving'),
    ('2026-12-25', 'Christmas Day')
ON CONFLICT (holiday_date) DO NOTHING;
