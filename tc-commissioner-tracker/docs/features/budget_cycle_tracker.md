# Budget Cycle Tracker

## What it does

A process tracker for the county's annual budget cycle. Residents see where the
county is in the calendar and — more importantly — when they can actually
provide public input.

Two surfaces:

1. **Dashboard card** (`/`): a `BudgetCycleCard` rendered on the homepage with a
   4-stage stepper and the next public-input date. Process and dates only — no
   dollar figures.
2. **Detail page** (`/budget/fy27`): full timeline of every milestone, plus
   every published budget document with an honest status badge (Planning,
   Recommended, Adopted, Superseded).

## Why no dollar figures on the dashboard

Dollar figures and proposed tax rates change continuously between the recommended
budget and adoption. Putting a stale number on the dashboard erodes trust faster
than not showing one at all. Numbers live on the existing `/budget` explorer
(which tracks the *adopted* FY26 budget) and inside individual documents on
`/budget/fy27`, always qualified by the document and date they came from.

## Data model

Three tables in `supabase/migrations/20260513_budget_cycles.sql`:

| Table | Purpose |
|---|---|
| `budget_cycles` | One row per fiscal year. `current_stage` + `is_active` drive what the tracker shows. |
| `budget_cycle_milestones` | Each meeting / deadline in the cycle. `is_public_input` flags the public hearing. |
| `budget_documents` | Each published document with an honest status. |

All three have public-read RLS; writes are admin-only (matches the existing
pattern for `meetings` and `follow_ups`).

A rollback file (`20260513_budget_cycles_rollback.sql`) exists for this
migration; this is a one-off, not a repo convention.

## Stage model

The stepper shows four stages. `archived` exists only for past cycles in the DB
and is never displayed.

| DB value | Stepper label | Meaning |
|---|---|---|
| `planning` | Planning | Department head presentations, capital workshops, external requests due |
| `recommended` | Recommended | County Manager's recommended budget has been presented |
| `under_revision` | Workshops | Board deliberation in budget workshops |
| `adopted` | Adoption | Public hearing + final adoption |
| `archived` | (not shown) | Prior cycle, retained for history |

Document statuses live in a parallel set: `planning`, `recommended`,
`under_revision`, `adopted`, `superseded`.

## Feature flag

`NEXT_PUBLIC_FEATURE_BUDGET_CYCLE_TRACKER` in `.env.local`:

- Unset or `"true"` → tracker card visible on dashboard (default).
- `"false"` → card disappears. The `/budget/fy27` page still loads regardless —
  an unlinked page is harmless.

## Routine maintenance (Kate)

### Advancing the current cycle's stage

When the county manager presents the recommended budget (~May 26):

```sql
UPDATE budget_cycles
  SET current_stage = 'recommended', updated_at = NOW()
  WHERE fiscal_year = 'FY27';
```

When workshops begin (~June 2):

```sql
UPDATE budget_cycles
  SET current_stage = 'under_revision', updated_at = NOW()
  WHERE fiscal_year = 'FY27';
```

After the June 22 adoption:

```sql
UPDATE budget_cycles
  SET current_stage = 'adopted', updated_at = NOW()
  WHERE fiscal_year = 'FY27';
```

### Marking milestones complete

As each milestone passes:

```sql
UPDATE budget_cycle_milestones
  SET is_complete = true
  WHERE cycle_id = '00000000-0000-0000-0000-0000000000f1'
    AND milestone_date <= CURRENT_DATE;
```

### Adding a published document

When the recommended budget book publishes (anticipated ~May 26):

```sql
INSERT INTO budget_documents (cycle_id, title, doc_status, presented_date, source_url, plain_summary, sort_order)
VALUES (
  '00000000-0000-0000-0000-0000000000f1',
  'FY27 Recommended Budget',
  'recommended',
  '2026-05-26',
  'https://www.transylvaniacounty.org/...',  -- official PDF
  'The County Manager''s recommended budget for FY27. Subject to revision during workshops before adoption on June 22.',
  2
);
```

Once adopted, *create a new row* with status `adopted` (don't update in place —
keep the recommended doc for history). Optionally mark the recommended doc as
`superseded`:

```sql
UPDATE budget_documents
  SET doc_status = 'superseded'
  WHERE cycle_id = '00000000-0000-0000-0000-0000000000f1'
    AND title = 'FY27 Recommended Budget';
```

### Rolling forward to a new fiscal year

When FY28 planning begins (early 2027):

```sql
-- Archive the current cycle
UPDATE budget_cycles
  SET is_active = false, current_stage = 'archived', updated_at = NOW()
  WHERE fiscal_year = 'FY27';

-- Insert the new cycle
INSERT INTO budget_cycles (fiscal_year, label, current_stage, cycle_start, adoption_date, fiscal_year_start, is_active)
VALUES ('FY28', 'FY28 County Budget', 'planning', '2027-02-01', '2027-06-22', '2027-07-01', true);
```

Then seed milestones and documents for FY28 with the new `cycle_id`.

## Known notes

- The migration seeds `current_stage = 'recommended'` for FY27, anticipating the
  May 26 recommended-budget presentation. If the tracker goes live *before*
  May 26, set `current_stage = 'planning'` until the presentation actually
  happens.
- The seeded capital document has `source_url = NULL`. Fill it in with the
  official county PDF once available; until then the UI shows "Document link
  coming soon."
- All milestone dates are stored as `date` (no time). Display uses
  `T12:00:00` parsing to avoid timezone off-by-one bugs.

## Visualizations (added 2026-05-28)

`/budget/fy27` now includes two horizontal-bar charts and a "Meetings about the
budget" section, plus the dashboard card moved above the hero stats.

### Data: `budget_breakdowns`

Migration: `supabase/migrations/20260528_budget_breakdowns.sql`

| Column | Notes |
|---|---|
| `cycle_id` | FK to `budget_cycles` |
| `breakdown_type` | CHECK: `expense_by_function` or `revenue_by_category` |
| `category` | Display label (e.g. "Property Tax") |
| `amount` | Dollars, NUMERIC |
| `sort_order` | Largest first, set in the seed |

Public-read RLS, admin-only writes — same pattern as the other budget tables.

### Where the numbers came from

The 11 expense rows and 13 revenue rows in the seed come directly from the
**FY27 Recommended Budget Book** presented May 26, 2026:

- Expense sum = $82,536,222 (vs. headline $82,536,220 — $2 off due to county's
  own rounding)
- Revenue sum = $82,410,719 (vs. headline $82,536,220 — ~$125K short due to
  county's own category grouping)

**Do not "fix" these numbers to force an exact match.** They're shown as the
county reported. Percentages on the charts are computed from the sum of the
displayed rows so labels reconcile with bars.

### Accuracy guardrails

- No property tax **rate** appears anywhere in these charts (rates change with
  every workshop; rendering one would erode trust). Dollar amounts only.
- Every chart caption reads: *"Source: FY27 Recommended Budget, presented May
  26, 2026 · Recommended — not yet adopted."*
- Once the budget is adopted on June 22, update the captions in
  [`src/components/BudgetBreakdownChart.tsx`](../../src/components/BudgetBreakdownChart.tsx)
  to "Adopted — in effect July 1, 2026" (or similar) and consider seeding a
  parallel set of `adopted_*` rows so both surfaces exist for history.

### Chart implementation notes

Plain HTML/CSS horizontal bars (not Recharts) — server-rendered, mobile-perfect,
no YAxis-width gymnastics, no extra client bundle. Trade-off vs. the existing
`/budget` page (which uses Recharts and hides on mobile): the new charts work
across all viewports because long category labels stack above the bars on
mobile. Single component, used twice.

### "Meetings about the budget" matching

Uses the existing `topic.categories.includes("fiscal")` signal — no text
search. Pulled via `filterMeetings(allMeetings, { categories: ["fiscal"] })`
in `app/budget/fy27/page.tsx`, capped at 6 most-recent. The June 22 public
hearing (if it exists in the meetings table) gets a "Public Hearing" badge by
date-matching against `cycle.adoption_date`. "See all fiscal meetings" links
to `/topics/fiscal`.

If a future cycle uses a different category, swap the filter in the page.

### Dashboard reorder

`BudgetCycleCard` now renders **inside** the hero section, between the title
block and `HeroStats` (the three stat cards). When the
`budgetCycleTracker` flag is off, the card returns `null` and the layout
collapses cleanly to title → stats.

### Seeding breakdowns for a future cycle (FY28+)

When you spin up FY28, after inserting the cycle row, add breakdown rows in
the same shape — keyed to the new `cycle_id` and with `sort_order` largest
first:

```sql
INSERT INTO budget_breakdowns (cycle_id, breakdown_type, category, amount, sort_order)
VALUES
  ('<new-cycle-uuid>', 'expense_by_function', 'Public Safety & First Response', <amount>, 1),
  -- ...
ON CONFLICT DO NOTHING;
```

The chart components are data-driven — no code changes needed for a new
fiscal year. Update the source caption text in `BudgetBreakdownChart.tsx` if
the new cycle has a different presentation date.
