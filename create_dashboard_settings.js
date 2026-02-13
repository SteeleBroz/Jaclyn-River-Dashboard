import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ltllzovnblcukvrgkpfx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bGx6b3ZuYmxjdWt2cmdrcGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNTYyOTEsImV4cCI6MjA4NTkzMjI5MX0.SyWoFAlz1N0If2WBJnCNv_Y7QyRQ56F9VxM6I7mAdvY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function createDashboardSettings() {
  console.log('Creating dashboard_settings table...')
  
  try {
    // Create table
    const { error: tableError } = await supabase.rpc('create_dashboard_settings_table')
    
    if (tableError) {
      // If RPC doesn't exist, execute raw SQL
      console.log('RPC method not found, using direct SQL execution')
      
      // Note: We'll need to create this via Supabase dashboard SQL editor instead
      console.log(`
Please execute this SQL in the Supabase dashboard SQL editor:

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
INSERT INTO storage.buckets (id, name, public) VALUES ('dashboard-assets', 'dashboard-assets', true) ON CONFLICT (id) DO NOTHING;

-- Set up RLS policies
ALTER TABLE dashboard_settings ENABLE ROW LEVEL SECURITY;

-- Policy to allow all operations (since this is a single-row settings table)
CREATE POLICY "Allow all operations on dashboard_settings" ON dashboard_settings FOR ALL USING (true) WITH CHECK (id = 1);

-- Storage policy for dashboard-assets bucket
CREATE POLICY "Allow public read access to dashboard-assets" ON storage.objects FOR SELECT USING (bucket_id = 'dashboard-assets');
CREATE POLICY "Allow authenticated uploads to dashboard-assets" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'dashboard-assets' AND auth.role() = 'authenticated');
CREATE POLICY "Allow authenticated updates to dashboard-assets" ON storage.objects FOR UPDATE USING (bucket_id = 'dashboard-assets' AND auth.role() = 'authenticated');
      `)
      
      return
    }
    
    console.log('✅ Dashboard settings table created successfully')
    
    // Test the table by fetching settings
    const { data, error: fetchError } = await supabase
      .from('dashboard_settings')
      .select('*')
      .single()
    
    if (fetchError) {
      console.error('Error testing table:', fetchError)
    } else {
      console.log('✅ Default settings:', data)
    }
    
  } catch (error) {
    console.error('Error creating dashboard settings:', error)
  }
}

createDashboardSettings()