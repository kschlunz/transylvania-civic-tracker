-- Add type field to follow_ups for tiered overdue thresholds
ALTER TABLE follow_ups
ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'action_item';

-- Valid values: action_item, report, long_term, ongoing
