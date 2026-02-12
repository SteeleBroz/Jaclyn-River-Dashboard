-- Run this in Supabase SQL Editor (https://supabase.com/dashboard)

-- Folders table
CREATE TABLE IF NOT EXISTS folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  color text NOT NULL,
  sort_order integer,
  created_at timestamptz DEFAULT now()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  day_of_week text NOT NULL,
  board text NOT NULL,
  priority text DEFAULT 'none',
  due_date date,
  notes text,
  folder_id uuid REFERENCES folders(id),
  owner text NOT NULL,
  completed boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Disable RLS for now (private dashboard)
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on folders" ON folders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on tasks" ON tasks FOR ALL USING (true) WITH CHECK (true);

-- Seed folders
INSERT INTO folders (name, color, sort_order) VALUES
  ('SteeleBroz', '#EF4444', 1),
  ('Personal', '#22C55E', 2),
  ('Stryker', '#06B6D4', 3),
  ('Maverick', '#EC4899', 4),
  ('Cannon', '#EAB308', 5),
  ('Missile', '#F97316', 6),
  ('Marriage', '#A855F7', 7),
  ('NP', '#3B82F6', 8),
  ('SoFresh', '#F87171', 9);
