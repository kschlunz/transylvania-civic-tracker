-- Budget tables for FY2025-2026 Transylvania County budget data

CREATE TABLE IF NOT EXISTS budget_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  fy22_total numeric DEFAULT 0,
  fy23_total numeric DEFAULT 0,
  fy24_total numeric DEFAULT 0,
  fy25_actuals numeric DEFAULT 0,
  fy25_budget numeric DEFAULT 0,
  fy26_projection numeric DEFAULT 0,
  percent_change numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS budget_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES budget_departments(id) ON DELETE CASCADE,
  account_code text NOT NULL,
  account_name text NOT NULL,
  fy22 numeric DEFAULT 0,
  fy23 numeric DEFAULT 0,
  fy24 numeric DEFAULT 0,
  fy25_actuals numeric DEFAULT 0,
  fy25_budget numeric DEFAULT 0,
  fy26_projection numeric DEFAULT 0,
  percent_change numeric DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_budget_line_items_dept ON budget_line_items(department_id);
CREATE INDEX IF NOT EXISTS idx_budget_departments_name ON budget_departments(name);

-- Enable RLS (read-only for public)
ALTER TABLE budget_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_line_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Budget departments are viewable by everyone"
  ON budget_departments FOR SELECT USING (true);

CREATE POLICY "Budget line items are viewable by everyone"
  ON budget_line_items FOR SELECT USING (true);
