-- Rollback for 20260513_budget_cycles.sql
-- Drops tables in dependency order (child tables first).
-- Note: this repo doesn't normally keep rollback files — this one exists per
-- the budget-cycle-tracker spec. Run manually via Supabase SQL editor only if
-- you need to undo the budget cycle tracker migration.

DROP TABLE IF EXISTS budget_documents;
DROP TABLE IF EXISTS budget_cycle_milestones;
DROP TABLE IF EXISTS budget_cycles;
