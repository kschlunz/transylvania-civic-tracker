# Meeting records from the minutes pipeline

Each `YYYY-MM-DD.json` here is one meeting extracted from the county's official
minutes by `scripts/ingest-minutes.ts`. The daily **Ingest minutes** workflow
adds new ones in a pull request; merging it runs **Publish meetings**, which
writes them to Supabase (`scripts/publish-meetings.ts`).

- To correct a record before it goes live, edit the file in the pull request.
- `extraction.warnings` lists what the automated review was unsure about. It is not published.
- Files here are a log of what was published. Changing one later and merging republishes that meeting.
