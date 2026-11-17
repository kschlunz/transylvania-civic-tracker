# Transylvania County Commissioner Tracker

A civic accountability tool tracking Transylvania County Commissioner activity across meetings, votes, and public statements. Built to make local government more transparent and accessible.

## Features

- Dashboard with commissioner profiles, topic breakdowns, and election info
- Meeting detail views with key votes, commissioner activity, and public comments
- Commissioner pages with focus areas, public statements, and activity timelines
- Topic pages showing which commissioners are most active on each issue
- AI-powered meeting intake: paste raw minutes and get structured data extracted automatically

## Setup

1. Clone the repository:

   ```bash
   git clone https://github.com/your-username/tc-commissioner-tracker.git
   cd tc-commissioner-tracker
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Set up environment variables:

   ```bash
   cp .env.local.example .env.local
   ```

   Edit `.env.local` and add your [Anthropic API key](https://console.anthropic.com/). This is required for the AI meeting minutes processing feature.

4. Start the development server:

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000) to view the app.

## Automatic minutes intake

New meeting minutes are added without anyone pasting them in:

1. **Ingest minutes** (`.github/workflows/ingest-minutes.yml`) runs every morning. It reads the county's meetings page, compares it with what is in Supabase, and for each newly posted set of minutes sends the PDF to Claude for extraction. A second pass checks the draft against the PDF and the record is redone once if errors are found. Each meeting is written to `data/ingest/<date>.json` and a pull request is opened listing split votes and anything to check.
2. **Review** the pull request. Edit a record's file to correct it.
3. **Merge** it. **Publish meetings** (`.github/workflows/publish-meetings.yml`) writes the meetings, their follow-ups, follow-up status changes and topic threads to Supabase, and they appear on the site.

One-time setup in GitHub: add repository secrets `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, and tick "Allow GitHub Actions to create and approve pull requests" under Settings → Actions → General.

To run it locally with those values in `.env.local`:

```bash
npx tsx scripts/ingest-minutes.ts --dry-run          # list meetings not on the site
npx tsx scripts/ingest-minutes.ts                    # extract up to 3 new meetings
npx tsx scripts/ingest-minutes.ts --date 2026-06-08  # fill a specific gap
npx tsx scripts/publish-meetings.ts data/ingest/2026-06-08.json
```

When the board changes, update `scripts/ingest/roster.ts` (who sat when) and `COMMISSIONERS` in `src/lib/constants.ts`.

## Contributing

This is a community project and contributions are welcome. Whether it's fixing bugs, adding features, improving documentation, or suggesting ideas — all help is appreciated.

## License

MIT
