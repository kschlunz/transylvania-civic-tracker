/**
 * Find minutes the county has posted that are not on the site yet, extract
 * them, and write a reviewed record for each to data/ingest/.
 *
 *   npx tsx scripts/ingest-minutes.ts --dry-run          # show what is missing
 *   npx tsx scripts/ingest-minutes.ts                    # extract up to 3 new meetings
 *   npx tsx scripts/ingest-minutes.ts --date 2026-06-08  # one meeting, e.g. to fill a gap
 *   npx tsx scripts/ingest-minutes.ts --check-schema     # confirm the API accepts the output schemas (a few cents)
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (to read what is
 * on the site) and ANTHROPIC_API_KEY. Nothing is written to Supabase: merge the
 * records, then scripts/publish-meetings.ts applies them.
 *
 * Writes ingest-report.md, which the scheduled workflow uses as the pull request description.
 */
import { config } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { checkSchema, createClaudeLlm, resolveModel } from "./ingest/claude";
import { ReviewSchema, extractionSchema } from "./ingest/extraction";
import { downloadPdf, listMeetings } from "./ingest/county";
import { recordIds, writeRecord } from "./ingest/files";
import { buildReport, planIngest, runIngest, type IngestOptions } from "./ingest/ingest";
import { todayISO } from "./ingest/roster";
import { supabaseFromEnv, supabaseStore } from "./ingest/supabase-store";

config({ path: path.resolve(__dirname, "../.env.local"), quiet: true });

const { values } = parseArgs({
  options: {
    limit: { type: "string" },
    date: { type: "string", multiple: true },
    since: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "check-schema": { type: "boolean", default: false },
  },
});

const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const dates = (values.date ?? []).flatMap((d) => d.split(/[\s,]+/)).filter(Boolean);
for (const d of [...dates, ...(values.since ? [values.since] : [])]) {
  if (!isoDate.test(d)) throw new Error(`"${d}" is not a YYYY-MM-DD date`);
}
const limit = Number(values.limit || 3);
if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive whole number");
const options: IngestOptions = { limit, only: dates.length > 0 ? dates : undefined };

async function main() {
  if (values["check-schema"]) {
    // One tiny request per schema; no Supabase or PDFs involved.
    for (const [name, schema] of [["extraction", extractionSchema()], ["review", ReviewSchema]] as const) {
      console.log(await checkSchema(name, schema));
    }
    return;
  }
  const store = supabaseStore(supabaseFromEnv({ write: false }));
  const [stored, openFollowUps, activeThreads] = await Promise.all([store.meetingIds(), store.openFollowUps(), store.activeThreads()]);
  const pending = recordIds();
  const state = { meetingIds: new Set([...stored, ...pending]), openFollowUps, activeThreads };
  const newest = stored.sort().at(-1);

  // Look back far enough to see gaps after the newest meeting on record.
  const since = values.since ?? (dates.length > 0 ? [...dates].sort()[0] : "2024-12-02");
  console.log(`On the site: ${stored.length} meetings (newest ${newest ?? "none"}). Waiting in data/ingest: ${pending.length}.`);
  console.log(`Checking the county meetings page for minutes since ${since}...`);
  const listed = await listMeetings(since);
  const plan = planIngest(listed, state, options, todayISO());

  if (plan.awaitingMinutes.length) console.log(`Minutes not yet posted: ${plan.awaitingMinutes.map((m) => m.date).join(", ")}`);
  if (plan.gaps.length) console.log(`Missing but older than the newest meeting on record (use --date to fill): ${plan.gaps.map((m) => m.date).join(", ")}`);
  for (const s of plan.skipped) console.log(`Skipping ${s.meeting.date}: ${s.reason}`);
  console.log(plan.toProcess.length ? `To process: ${plan.toProcess.map((m) => m.date).join(", ")}` : "Nothing new to process.");

  const reportFile = path.resolve(__dirname, "../ingest-report.md");
  fs.rmSync(reportFile, { force: true });
  if (values["dry-run"] || plan.toProcess.length === 0) return;

  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set.");
  const { llm, usage, model } = createClaudeLlm({ model: resolveModel() });
  const run = await runIngest({ plan, state, llm, model, downloadPdf, save: (record) => writeRecord(record), log: console.log });

  console.log(`Model usage: ${usage.requests} requests, ${usage.inputTokens} input tokens (+${usage.cachedInputTokens} cached), ${usage.outputTokens} output tokens.`);
  if (run.records.length > 0) {
    fs.writeFileSync(reportFile, buildReport(run, plan));
    console.log(`Wrote ${run.records.length} record(s) to data/ingest/. Report: ingest-report.md`);
  }
  if (run.stopped) {
    console.error(`Stopped at ${run.stopped.date}: ${run.stopped.error}`);
    if (run.records.length === 0) process.exit(1);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
