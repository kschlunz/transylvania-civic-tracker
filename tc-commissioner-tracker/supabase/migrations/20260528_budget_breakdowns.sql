-- Budget Breakdowns: expenses by function + revenue by category
-- Powers the two horizontal-bar charts on /budget/fy27
-- Sourced from the FY27 Recommended Budget Book (presented 2026-05-26)

CREATE TABLE IF NOT EXISTS budget_breakdowns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES budget_cycles(id) ON DELETE CASCADE,
  breakdown_type TEXT NOT NULL CHECK (breakdown_type IN (
    'expense_by_function', 'revenue_by_category'
  )),
  category TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_breakdowns_cycle_type
  ON budget_breakdowns(cycle_id, breakdown_type);

-- RLS: public read, admin-only write (matches budget_cycles pattern)
ALTER TABLE budget_breakdowns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public read on budget_breakdowns" ON budget_breakdowns;
CREATE POLICY "Public read on budget_breakdowns" ON budget_breakdowns FOR SELECT USING (true);

-- ============================================
-- SEED: FY27 Expenses by Function
-- Total reported in budget book: $82,536,220
-- Sum of these rows: $82,536,222 (off by $2 due to county's own rounding — do not "fix")
-- Source: FY27 Recommended Budget, General Fund Expenses by Function
-- ============================================
INSERT INTO budget_breakdowns (cycle_id, breakdown_type, category, amount, sort_order) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'expense_by_function', 'Public Safety & First Response', 20178339, 1),
  ('00000000-0000-0000-0000-0000000000f1', 'expense_by_function', 'Education', 17254574, 2),
  ('00000000-0000-0000-0000-0000000000f1', 'expense_by_function', 'Health & Human Services', 13473267, 3),
  ('00000000-0000-0000-0000-0000000000f1', 'expense_by_function', 'County Operations', 8507057, 4),
  ('00000000-0000-0000-0000-0000000000f1', 'expense_by_function', 'Debt Service & Leases (General)', 5200073, 5),
  ('00000000-0000-0000-0000-0000000000f1', 'expense_by_function', 'Debt Service – School Bonds', 4286463, 6),
  ('00000000-0000-0000-0000-0000000000f1', 'expense_by_function', 'Economic Development & Infrastructure', 3515064, 7),
  ('00000000-0000-0000-0000-0000000000f1', 'expense_by_function', 'General Government Services', 3433446, 8),
  ('00000000-0000-0000-0000-0000000000f1', 'expense_by_function', 'Culture & Recreation', 2533429, 9),
  ('00000000-0000-0000-0000-0000000000f1', 'expense_by_function', 'Administrative Services', 2343827, 10),
  ('00000000-0000-0000-0000-0000000000f1', 'expense_by_function', 'External Agencies & Transfers', 1810683, 11)
ON CONFLICT DO NOTHING;

-- ============================================
-- SEED: FY27 Revenue by Category
-- Total reported in budget book: $82,536,220
-- Sum of these rows: $82,410,719 (~$125K short due to county's own category grouping — do not "fix")
-- Source: FY27 Recommended Budget, County Revenues
-- ============================================
INSERT INTO budget_breakdowns (cycle_id, breakdown_type, category, amount, sort_order) VALUES
  ('00000000-0000-0000-0000-0000000000f1', 'revenue_by_category', 'Property Tax', 47251450, 1),
  ('00000000-0000-0000-0000-0000000000f1', 'revenue_by_category', 'Sales Tax', 11513530, 2),
  ('00000000-0000-0000-0000-0000000000f1', 'revenue_by_category', 'Social Services', 4466367, 3),
  ('00000000-0000-0000-0000-0000000000f1', 'revenue_by_category', 'Other Government Revenues', 2622094, 4),
  ('00000000-0000-0000-0000-0000000000f1', 'revenue_by_category', 'Transfers In', 2414281, 5),
  ('00000000-0000-0000-0000-0000000000f1', 'revenue_by_category', 'Law Enforcement', 2347837, 6),
  ('00000000-0000-0000-0000-0000000000f1', 'revenue_by_category', 'EMS & 911', 2154102, 7),
  ('00000000-0000-0000-0000-0000000000f1', 'revenue_by_category', 'Departments with Revenues under $1 million', 2127778, 8),
  ('00000000-0000-0000-0000-0000000000f1', 'revenue_by_category', 'Occupancy Tax', 1834465, 9),
  ('00000000-0000-0000-0000-0000000000f1', 'revenue_by_category', 'Vehicle Tax', 1787598, 10),
  ('00000000-0000-0000-0000-0000000000f1', 'revenue_by_category', 'Register of Deeds', 1427131, 11),
  ('00000000-0000-0000-0000-0000000000f1', 'revenue_by_category', 'Public Health', 1306987, 12),
  ('00000000-0000-0000-0000-0000000000f1', 'revenue_by_category', 'Lease Proceeds (passthrough)', 1157099, 13)
ON CONFLICT DO NOTHING;
