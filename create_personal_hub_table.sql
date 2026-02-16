-- Create personal_hub_items table for File Hub
CREATE TABLE IF NOT EXISTS personal_hub_items (
  id BIGSERIAL PRIMARY KEY,
  type VARCHAR(10) NOT NULL CHECK (type IN ('folder', 'doc', 'sheet')),
  title VARCHAR(255) NOT NULL,
  subtitle TEXT,
  url TEXT,
  notes TEXT,
  parent_id BIGINT REFERENCES personal_hub_items(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_personal_hub_items_updated_at 
    BEFORE UPDATE ON personal_hub_items 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert sample data
INSERT INTO personal_hub_items (type, title, subtitle, url, notes, parent_id) VALUES
('folder', 'SteeleBroz', 'Brand & Marketing', NULL, NULL, NULL),
('folder', 'Family', 'Personal documents', NULL, NULL, NULL),
('doc', 'Brand Strategy 2024', 'Q1 Planning Document', 'https://docs.google.com/document/d/example', NULL, NULL),
('sheet', 'Revenue Tracker', 'Monthly finances', 'https://sheets.google.com/spreadsheet/d/example', NULL, NULL);

-- Insert nested items
INSERT INTO personal_hub_items (type, title, subtitle, url, notes, parent_id) 
SELECT 'folder', 'Kids Sports', NULL, NULL, NULL, id 
FROM personal_hub_items WHERE title = 'Family' LIMIT 1;

INSERT INTO personal_hub_items (type, title, subtitle, url, notes, parent_id) 
SELECT 'doc', 'Tournament Schedule', NULL, 'https://docs.google.com/document/d/example2', NULL, id 
FROM personal_hub_items WHERE title = 'Kids Sports' LIMIT 1;