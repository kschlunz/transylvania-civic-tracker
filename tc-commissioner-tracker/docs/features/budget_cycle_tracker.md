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
