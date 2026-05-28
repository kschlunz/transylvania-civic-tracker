# FY27 Budget Announcement Email

One-time email to all subscribers about the FY27 Recommended Budget.
Adoption is June 22, 2026 — this email goes out shortly after the May 26
presentation so residents have time to weigh in.

## Files

| Path | Role |
|---|---|
| [`src/emails/fy27-budget-email.ts`](../../src/emails/fy27-budget-email.ts) | Email builder — single source of truth for HTML/text. Used by the API route and preview. |
| [`app/api/send-budget-email/route.ts`](../../app/api/send-budget-email/route.ts) | `GET` returns the rendered preview JSON; `POST` performs the send. Auth via `x-admin-user-id` header. |
| [`app/admin/email-preview/fy27-budget/page.tsx`](../../app/admin/email-preview/fy27-budget/page.tsx) | Admin-gated preview page. Renders the email HTML inside a sandboxed iframe. |
| [`scripts/send-budget-email.ts`](../../scripts/send-budget-email.ts) | CLI — dry-run default, `--test=email`, `--send --confirm`. |

## Pre-send checklist (Kate)

1. **Apply migrations** — the `budget_breakdowns` table must exist. Paste
   `supabase/migrations/20260528_budget_breakdowns.sql` into the Supabase SQL
   editor if you haven't already.
2. **Preview** — `npm run dev`, sign in as admin, visit
   `/admin/email-preview/fy27-budget`. Confirm:
   - Subject reads exactly: *"Transylvania County's proposed budget FY27"*
   - Intro text contains "**$0.4105 per $100**" and "**$82,536,220, up 1.47%**"
   - Two charts render — Property Tax row is the longest revenue bar; Public
     Safety & First Response is the longest expense bar.
   - "What's next" lists the next ~4 upcoming milestones with **June 22**
     marked as public input.
   - CTA points to `https://civicledger.co/budget/fy27`.
3. **Dry-run** — `npx tsx scripts/send-budget-email.ts`. Confirms the
   subscriber count is sane and the email builds without errors. Sends nothing.
4. **Test send** — `npx tsx scripts/send-budget-email.ts --test=you@example.com`.
   Sends ONE email to that address only.
5. **Render check across clients** — open the test email in **all** of:
   - Gmail web
   - Gmail mobile
   - Outlook web (or desktop if you have it)
   - Apple Mail with images turned **OFF** (Mail → Preferences → Viewing →
     uncheck "Load remote content in messages")
   Confirm the bars render correctly and the layout doesn't blow out. Outlook
   for Windows is the hardest target; if bars look wrong there, stop and
   investigate before the real send.
6. **The real send** — `npx tsx scripts/send-budget-email.ts --send --confirm`.
   Both flags required. The script prints a loud warning + pauses 3 seconds
   before any network request goes out. Ctrl-C aborts.
7. **Post-send** — check the Resend dashboard for any delivery failures. The
   script logs per-batch errors if any occur.

## Script semantics

| Invocation | Behavior |
|---|---|
| `npx tsx scripts/send-budget-email.ts` | **Dry-run** (default). Queries subscriber count, fetches the rendered email via the GET endpoint, prints subject + first ~200 chars of plain-text. Sends nothing. |
| `npx tsx scripts/send-budget-email.ts --test=you@x.com` | Sends ONE email to that address only. Does not query subscribers. |
| `npx tsx scripts/send-budget-email.ts --send --confirm` | **REAL send to all subscribers.** Both flags required. 3-second pause + warning before the network request. Re-running this command will re-email everyone. |
| `npx tsx scripts/send-budget-email.ts --send` (no `--confirm`) | Refused. Exits 1 with a message about the required flag. |
| `npx tsx scripts/send-budget-email.ts --help` | Prints usage. |

The CLI talks to `/api/send-budget-email` with the admin UUID header — same
pattern as `scripts/send-digest.ts`.

### Which API is hit

By default the script reads `NEXT_PUBLIC_SITE_URL` from `.env.local` (usually
`https://civicledger.co`). If the route hasn't been deployed there yet, the
script will hit a 404 HTML page and the JSON parse will fail with a clear
error pointing back here. To work around it:

- `--local` — target `http://localhost:3000`. Requires `npm run dev` running
  in another terminal. Useful for previewing/testing before pushing main.
- `--url=https://your-preview.vercel.app` — point at any URL explicitly
  (e.g. a Vercel preview deployment).

Once main is deployed to production with this code, the default URL works
without flags.

## Why bars are HTML tables (not Recharts)

Recharts mounts in the browser via JavaScript. Email clients strip JS and rarely
support `<svg>`. To survive Gmail, Outlook desktop, Outlook web, and Apple Mail,
the bars in this email are pure `<table>` layout with `bgcolor` + inline width
percentages on `<td>` cells — the same trick Mailchimp and Stripe use. Nothing
in this email requires JavaScript or external CSS to render correctly.

## Unsubscribe

The codebase doesn't yet have per-recipient unsubscribe tokens (the
`subscribers` table has only `id`, `email`, `created_at`). For this send we use
a **soft text-based opt-out** in the footer: *"reply with 'unsubscribe' and
we'll remove you."* Kate watches the inbox and removes via the
`scripts/add-subscriber.ts` pattern (a `--remove` flag would be a tiny future
addition).

If a fuller unsubscribe system is wanted before the next mass send, that's a
separate ticket:
- add `unsubscribe_token uuid` to `subscribers`
- add `unsubscribed_at timestamptz` column
- create `/unsubscribe?token=X` route
- inject the per-recipient link into the email footer
- set the `List-Unsubscribe` header in the Resend payload

## Environment variables

Same set as `scripts/send-digest.ts`:

| Var | Purpose |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Base URL the script POSTs to (`http://localhost:3000` in dev, prod URL when sending from prod). |
| `NEXT_PUBLIC_ADMIN_USER_ID` | Admin UUID — included in the `x-admin-user-id` header, checked by the route. |
| `RESEND_API_KEY` | Server-side. Required for the actual send. |
| `RESEND_FROM_EMAIL` | The from address. Auto-wrapped as `Civic Ledger <addr>` if no `<>` present. |
| `RESEND_TEST_EMAIL` | Optional. Overrides the hardcoded fallback for `testMode: true` calls (the API's internal test mode — not used by the CLI script directly). |
| `NEXT_PUBLIC_SUPABASE_URL` + key | Used by the script for the dry-run subscriber count. |

## Data sources

- **Expense + revenue breakdowns**: `budget_breakdowns` table, filtered to the
  active cycle. Migration: `supabase/migrations/20260528_budget_breakdowns.sql`.
  Charts collapse to top 6 + "All other" for readability.
- **Upcoming milestones**: `budget_cycle_milestones` table, filtered to
  `milestone_date >= today`, ordered by date asc, limit 4. Migration:
  `supabase/migrations/20260513_budget_cycles.sql`.
- **Public hearing badge**: rendered when a milestone's date matches the
  cycle's `adoption_date` (June 22, 2026 for FY27) or its `is_public_input` flag
  is set.

All figures are pulled fresh at send time — if you update the breakdowns table
between preview and send, the send uses the latest data.

## Out of scope

- Per-recipient unsubscribe tokens (see "Unsubscribe" above).
- Sent-marker file/table. The `--send --confirm` two-flag requirement is the
  guard. The dry-run output explicitly warns that re-running will re-email.
- Post-adoption "the budget passed" email. That's a separate ticket.
