-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)
-- Uses "dash_" prefix to avoid conflicting with existing tables

-- Folders table
CREATE TABLE IF NOT EXISTS dash_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL,
  sort_order integer,
  created_at timestamptz DEFAULT now()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS dash_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  day_of_week text NOT NULL,
  board text NOT NULL,
  priority text DEFAULT 'none',
  due_date date,
  notes text,
  folder_id uuid REFERENCES dash_folders(id),
  owner text NOT NULL,
  completed boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Disable RLS (private dashboard)
ALTER TABLE dash_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE dash_tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all on dash_folders" ON dash_folders;
DROP POLICY IF EXISTS "Allow all on dash_tasks" ON dash_tasks;
CREATE POLICY "Allow all on dash_folders" ON dash_folders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on dash_tasks" ON dash_tasks FOR ALL USING (true) WITH CHECK (true);

-- Seed folders
INSERT INTO dash_folders (name, color, sort_order) VALUES
  ('SteeleBroz', '#EF4444', 1),
  ('Personal', '#22C55E', 2),
  ('Stryker', '#06B6D4', 3),
  ('Maverick', '#EC4899', 4),
  ('Cannon', '#EAB308', 5),
  ('Missile', '#F97316', 6),
  ('Marriage', '#A855F7', 7),
  ('NP', '#3B82F6', 8),
  ('SoFresh', '#F87171', 9)
ON CONFLICT DO NOTHING;
