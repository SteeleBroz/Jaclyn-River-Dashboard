-- Create dashboard_settings table
CREATE TABLE IF NOT EXISTS dashboard_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  vision_statement TEXT DEFAULT 'Living with purpose, intention, love, and calm. Building wealth, deep connections, and time freedom while raising boys into confident, disciplined men.',
  header_words TEXT DEFAULT 'FAMILY · WEALTH · LOVE · CONNECTION · HEALTH · PEACE · HAPPINESS',
  profile_image_url TEXT DEFAULT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default row
INSERT INTO dashboard_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- Create storage bucket for dashboard assets (if not exists)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('dashboard-assets', 'dashboard-assets', true) 
ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies
ALTER TABLE dashboard_settings ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (since this is a single-row settings table)
DROP POLICY IF EXISTS "Allow all operations on dashboard_settings" ON dashboard_settings;
CREATE POLICY "Allow all operations on dashboard_settings" 
ON dashboard_settings FOR ALL 
USING (true) 
WITH CHECK (id = 1);

-- Storage policies for dashboard-assets bucket
DROP POLICY IF EXISTS "Allow public read access to dashboard-assets" ON storage.objects;
CREATE POLICY "Allow public read access to dashboard-assets" 
ON storage.objects FOR SELECT 
USING (bucket_id = 'dashboard-assets');

DROP POLICY IF EXISTS "Allow authenticated uploads to dashboard-assets" ON storage.objects;
CREATE POLICY "Allow authenticated uploads to dashboard-assets" 
ON storage.objects FOR INSERT 
WITH CHECK (bucket_id = 'dashboard-assets' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated updates to dashboard-assets" ON storage.objects;
CREATE POLICY "Allow authenticated updates to dashboard-assets" 
ON storage.objects FOR UPDATE 
USING (bucket_id = 'dashboard-assets' AND auth.role() = 'authenticated');

DROP POLICY IF EXISTS "Allow authenticated deletes to dashboard-assets" ON storage.objects;
CREATE POLICY "Allow authenticated deletes to dashboard-assets" 
ON storage.objects FOR DELETE 
USING (bucket_id = 'dashboard-assets' AND auth.role() = 'authenticated');