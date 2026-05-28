-- Budget Cycle Tracker: cycles, milestones, documents
-- Powers the dashboard card + /budget/fy27 detail page

CREATE TABLE IF NOT EXISTS budget_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fiscal_year TEXT NOT NULL,
  label TEXT NOT NULL,
  jurisdiction TEXT NOT NULL DEFAULT 'Transylvania County',
  current_stage TEXT NOT NULL CHECK (current_stage IN (
    'planning', 'recommended', 'under_revision', 'adopted', 'archived'
  )),
  cycle_start DATE,
  adoption_date DATE,
  fiscal_year_start DATE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_cycles_active ON budget_cycles(is_active) WHERE is_active = true;

CREATE TABLE IF NOT EXISTS budget_cycle_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES budget_cycles(id) ON DELETE CASCADE,
  milestone_date DATE NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  stage TEXT CHECK (stage IN (
    'planning', 'recommended', 'under_revision', 'adopted', 'archived'
  )),
  is_public_input BOOLEAN NOT NULL DEFAULT false,
  is_complete BOOLEAN NOT NULL DEFAULT false,
  location TEXT,
  livestream_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_milestones_cycle ON budget_cycle_milestones(cycle_id);
CREATE INDEX IF NOT EXISTS idx_milestones_date ON budget_cycle_milestones(milestone_date);

CREATE TABLE IF NOT EXISTS budget_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id UUID NOT NULL REFERENCES budget_cycles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  doc_status TEXT NOT NULL CHECK (doc_status IN (
    'planning', 'recommended', 'under_revision', 'adopted', 'superseded'
  )),
  presented_date DATE,
  source_url TEXT,
  storage_path TEXT,
  plain_summary TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_budget_documents_cycle ON budget_documents(cycle_id);

-- RLS: public read, admin-only write (matches existing tables)
ALTER TABLE budget_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_cycle_milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE budget_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read on budget_cycles" ON budget_cycles;
CREATE POLICY "Public read on budget_cycles" ON budget_cycles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read on budget_cycle_milestones" ON budget_cycle_milestones;
CREATE POLICY "Public read on budget_cycle_milestones" ON budget_cycle_milestones FOR SELECT USING (true);

DROP POLICY IF EXISTS "Public read on budget_documents" ON budget_documents;
CREATE POLICY "Public read on budget_documents" ON budget_documents FOR SELECT USING (true);

-- ============================================
-- SEED: FY27 cycle, milestones, and first document
-- ============================================

INSERT INTO budget_cycles (id, fiscal_year, label, current_stage, cycle_start, adoption_date, fiscal_year_start, is_active)
VALUES (
  '00000000-0000-0000-0000-0000000000f1',
  'FY27', 'FY27 County Budget', 'recommended',
  '2026-02-09', '2026-06-22', '2026-07-01', true
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO budget_cycle_milestones (cycle_id, milestone_date, title, description, stage, is_public_input, is_complete, location, sort_order) VALUES
  ('00000000-0000-0000-0000-0000000000f1', '2026-02-09', 'Early Revenue Indicators', 'Commissioner discussion of early revenue expectations.', 'planning', false, true, NULL, 1),
  ('00000000-0000-0000-0000-0000000000f1', '2026-02-23', 'Department Head Presentations (Night 1)', 'Performance measures and trends.', 'planning', false, true, NULL, 2),
  ('00000000-0000-0000-0000-0000000000f1', '2026-03-09', 'Department Head Presentations (Night 2)', 'Performance measures and trends.', 'planning', false, true, NULL, 3),
  ('00000000-0000-0000-0000-0000000000f1', '2026-03-23', 'Sheriff Presentation & Budget Check-In', 'Sheriff trends, budget timeline, expenditure analysis.', 'planning', false, true, NULL, 4),
  ('00000000-0000-0000-0000-0000000000f1', '2026-04-01', 'External Funding Requests Due', 'Schools, Blue Ridge Community College, fire departments, and nonprofits submit requests.', 'planning', false, true, NULL, 5),
  ('00000000-0000-0000-0000-0000000000f1', '2026-04-15', 'Capital Workshop', 'Capital planning workshop with commissioners.', 'planning', false, true, NULL, 6),
  ('00000000-0000-0000-0000-0000000000f1', '2026-05-26', 'Recommended Budget Presented', 'County Manager formally presents the FY27 Recommended Budget to the Board.', 'recommended', false, false, 'Multipurpose Chambers, 101 S. Broad St., Brevard', 7),
  ('00000000-0000-0000-0000-0000000000f1', '2026-06-02', 'Budget Workshop', 'Board deliberation on the recommended budget.', 'under_revision', false, false, 'Multipurpose Chambers, 101 S. Broad St., Brevard', 8),
  ('00000000-0000-0000-0000-0000000000f1', '2026-06-04', 'Budget Workshop (if needed)', 'Additional deliberation if required.', 'under_revision', false, false, 'Multipurpose Chambers, 101 S. Broad St., Brevard', 9),
  ('00000000-0000-0000-0000-0000000000f1', '2026-06-22', 'Public Hearing & Budget Adoption', 'Public hearing to receive resident input, followed by adoption of the FY27 budget the same evening.', 'adopted', true, false, 'Multipurpose Chambers, 101 S. Broad St., Brevard', 10),
  ('00000000-0000-0000-0000-0000000000f1', '2026-07-01', 'Budget Takes Effect', 'Balanced FY27 budget implemented.', 'adopted', false, false, NULL, 11)
ON CONFLICT DO NOTHING;

-- Kate: fill in source_url once the official PDF link is available on transylvaniacounty.org
INSERT INTO budget_documents (cycle_id, title, doc_status, presented_date, plain_summary, sort_order) VALUES
  ('00000000-0000-0000-0000-0000000000f1',
   'FY27 Capital & Major Expenditures',
   'planning', '2026-02-01',
   'An early framing document explaining how the county plans to pay for major capital projects — including school improvements and a new courthouse — over the next several years, alongside maintenance needs for county buildings. This is a planning document, not the adopted budget.',
   1)
ON CONFLICT DO NOTHING;
