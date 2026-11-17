/**
 * Apply reviewed records from data/ingest/ to Supabase: the meeting, its new
 * follow-ups, status changes to earlier follow-ups, and topic threads.
 *
 *   npx tsx scripts/publish-meetings.ts data/ingest/2026-06-08.json [...]
 *   npx tsx scripts/publish-meetings.ts --dry-run data/ingest/*.json
 *
 * The publish workflow runs this for the files a merge to main added or changed.
 * Records are applied oldest first. Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { config } from "dotenv";
import path from "node:path";
import { parseArgs } from "node:util";
import { readRecord } from "./ingest/files";
import { publishRecord } from "./ingest/publish";
import { supabaseFromEnv, supabaseStore } from "./ingest/supabase-store";

config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { "dry-run": { type: "boolean", default: false } },
});

async function main() {
  const files = positionals.filter((f) => f.endsWith(".json"));
  if (files.length === 0) {
    console.log("No records to publish.");
    return;
  }
  // Validate everything before writing anything.
  const records = files.map((f) => readRecord(path.resolve(f))).sort((a, b) => a.meeting.id.localeCompare(b.meeting.id));
  console.log(`Records: ${records.map((r) => r.meeting.id).join(", ")}`);
  if (values["dry-run"]) {
    console.log("Dry run: all records are valid. Nothing was written.");
    return;
  }
  const store = supabaseStore(supabaseFromEnv({ write: true }));
  for (const record of records) await publishRecord(record, store, console.log);
  console.log(`Published ${records.length} meeting(s).`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
