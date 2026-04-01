/**
 * Batch process meeting minutes PDFs and insert into Supabase.
 *
 * Extracts text from PDFs using pdfplumber (Python), sends to Claude for
 * structured extraction, and upserts into Supabase. Processes in chronological
 * order and passes open follow-ups + active threads for resolution detection.
 *
 * Usage:
 *   npx tsx scripts/batch-process-meetings.ts                    # process all PDFs
 *   npx tsx scripts/batch-process-meetings.ts --dry-run           # extract text only, don't call Claude
 *   npx tsx scripts/batch-process-meetings.ts --file 2024-10-14   # process single file matching date
 */

import { config } from "dotenv";
import { resolve } from "path";
import { readdirSync, writeFileSync } from "fs";
import { execSync } from "child_process";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(__dirname, "../.env.local") });

const anthropicKey = process.env.ANTHROPIC_API_KEY!;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!anthropicKey || !supabaseUrl || !supabaseKey) {
  console.error("Missing ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const dryRun = process.argv.includes("--dry-run");
const singleFile = process.argv.find((a) => a.startsWith("--file="))?.split("=")[1] ||
  (process.argv.includes("--file") ? process.argv[process.argv.indexOf("--file") + 1] : null);

const supabase = createClient(supabaseUrl, supabaseKey);
const anthropic = new Anthropic({ apiKey: anthropicKey });

const PDF_DIR = resolve(__dirname, "../data/minutes-backfill");

// Same system prompt as the API route
const SYSTEM_PROMPT = `You are a meeting minutes parser for the Transylvania County Board of Commissioners. Extract structured data from raw meeting minutes text.

Commissioner IDs and names:
- mccall: Teresa McCall
- chapman: Larry Chapman
- chappell: Jason Chappell
- dalton: Jake Dalton
- mckelvey: Chase McKelvey

Category IDs for tagging topics:
- fiscal: Fiscal Policy & Revenue
- schools: Schools & Capital
- safety: Public Safety
- infrastructure: Infrastructure
- econ: Economic Development
- governance: Transparency & Governance
- environment: Environment & Land
- housing: Housing
- health: Health & Human Services
- recovery: Helene Recovery
- community: Community & Culture

Extract the following from the meeting minutes:

1. Meeting metadata: date (YYYY-MM-DD), time, type (regular/special/workshop), attendees as an array of commissioner IDs, estimated audience size, duration estimate, and a TLDR summary of the meeting.

2. All key votes with:
   - description: what was voted on
   - result: "Unanimous" or the vote split like "4-1"
   - mover and seconder as commissioner IDs (use "consent agenda" for consent agenda items)
   - background: 2-3 sentences on why this item was on the agenda, who presented it, and the key facts/numbers discussed
   - discussion: summary of what commissioners said or asked about this item before voting — who raised concerns, what questions were asked, any debate

3. For each commissioner present, extract:
   - Every topic they raised, question they asked, or position they took. Write each as a concise sentence. Tag each with one or more relevant category IDs.
   - Count of motions made and motions seconded.
   - Any external committee roles mentioned.

4. All public comments: speaker full name and a summary of what they said.

5. Staff activity: Extract every county staff member who gave a presentation, report, recommendation, or update. Known staff: Jaime Laughter (County Manager), Meagan O'Neal (Finance Director), Nathanael Carver (IT Director), Beecher Allison (Project Manager), David McNeill (Emergency Services Director), Trisha Hogan (Clerk to the Board). Include ANY staff mentioned by name with their role and all items presented.

6. New follow-up items: Extract commitments to future action. For each:
   - id: meeting date + sequential number, e.g. "2024-10-14-fu-1"
   - dateRaised: the meeting date
   - owner: commissioner ID or staff full name
   - description: what was committed to
   - status: "open"
   - type: "action_item" | "report" | "long_term" | "ongoing"
   - categories: relevant category IDs
   - relatedMeetingId: the meeting ID

7. Resolved follow-ups: If open follow-up items from previous meetings are provided, check whether any are addressed in these minutes. For each match:
   - id: the original follow-up ID
   - status: "in_progress" or "resolved"
   - resolution: brief description

8. Topic threads: newThreads (first appearance) and threadUpdates (existing threads discussed).

Use the meeting date as the id field. Return ONLY raw JSON starting with { and ending with }.`;

function extractTextFromPdf(pdfPath: string): string {
  // Use pdfplumber via Python subprocess
  const script = `
import pdfplumber, sys, json
text_parts = []
with pdfplumber.open(sys.argv[1]) as pdf:
    for page in pdf.pages:
        t = page.extract_text()
        if t:
            text_parts.append(t)
print(json.dumps("\\n\\n".join(text_parts)))
`;
  const result = execSync(`python3 -c '${script.replace(/'/g, "\\'")}' "${pdfPath}"`, {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });
  return JSON.parse(result.trim());
}

function extractDateFromFilename(filename: string): string | null {
  const match = filename.match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

async function getOpenFollowUps(): Promise<Array<{ id: string; dateRaised: string; owner: string; description: string }>> {
  const { data } = await supabase
    .from("follow_ups")
    .select("id, date_raised, owner, description")
    .in("status", ["open", "in_progress"])
    .order("date_raised");
  return (data || []).map((f) => ({
    id: f.id as string,
    dateRaised: (f.date_raised as string).slice(0, 10),
    owner: f.owner as string,
    description: f.description as string,
  }));
}

async function getActiveThreads(): Promise<Array<{ id: string; title: string }>> {
  const { data } = await supabase
    .from("topic_threads")
    .select("id, title")
    .eq("status", "active");
  return (data || []).map((t) => ({ id: t.id as string, title: t.title as string }));
}

async function meetingExists(meetingId: string): Promise<boolean> {
  const { data } = await supabase
    .from("meetings")
    .select("id")
    .eq("id", meetingId)
    .single();
  return !!data;
}

function meetingToRow(meeting: Record<string, unknown>) {
  return {
    id: meeting.id,
    date: meeting.date,
    type: meeting.type,
    time: meeting.time,
    attendees: meeting.attendees,
    audience_size: meeting.audienceSize,
    duration: meeting.duration,
    tldr: meeting.tldr,
    key_votes: meeting.keyVotes,
    commissioner_activity: meeting.commissionerActivity,
    public_comments: meeting.publicComments,
    follow_ups: meeting.followUps || [],
    staff_activity: meeting.staffActivity || [],
    source_url: meeting.sourceUrl || null,
    agenda_url: meeting.agendaUrl || null,
  };
}

async function main() {
  console.log(dryRun ? "🔍 DRY RUN — will extract text but not call Claude or write to Supabase\n" : "🚀 BATCH PROCESSING\n");

  // Find PDFs
  let files: string[];
  try {
    files = readdirSync(PDF_DIR).filter((f) => f.endsWith(".pdf")).sort();
  } catch {
    console.error(`No PDF directory found at: ${PDF_DIR}`);
    console.error("Create data/minutes-backfill/ and add meeting PDFs.");
    process.exit(1);
  }

  if (singleFile) {
    files = files.filter((f) => f.includes(singleFile));
  }

  console.log(`Found ${files.length} PDFs in ${PDF_DIR}:\n`);
  for (const f of files) {
    const date = extractDateFromFilename(f);
    console.log(`  ${date || "?"} — ${f}`);
  }

  if (files.length === 0) {
    console.log("\nNo matching PDFs found.");
    process.exit(0);
  }

  // Sort by date (chronological)
  files.sort((a, b) => {
    const da = extractDateFromFilename(a) || "";
    const db = extractDateFromFilename(b) || "";
    return da.localeCompare(db);
  });

  const results: Array<{ date: string; votes: number; followUps: number; resolved: number; status: string }> = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const date = extractDateFromFilename(file);
    console.log(`\n${"=".repeat(60)}`);
    console.log(`[${i + 1}/${files.length}] Processing: ${file}`);
    console.log(`Date: ${date}`);
    console.log("=".repeat(60));

    if (!date) {
      console.log("⚠️  Could not extract date from filename — skipping");
      results.push({ date: file, votes: 0, followUps: 0, resolved: 0, status: "skipped: no date" });
      continue;
    }

    // Check if already exists
    if (await meetingExists(date)) {
      console.log("⏭️  Meeting already exists in Supabase — skipping");
      results.push({ date, votes: 0, followUps: 0, resolved: 0, status: "skipped: exists" });
      continue;
    }

    // Extract text
    console.log("📄 Extracting text from PDF...");
    let text: string;
    try {
      text = extractTextFromPdf(resolve(PDF_DIR, file));
      console.log(`  Extracted ${text.length.toLocaleString()} characters`);
    } catch (err) {
      console.error("❌ PDF extraction failed:", err instanceof Error ? err.message : err);
      results.push({ date, votes: 0, followUps: 0, resolved: 0, status: "error: PDF extraction" });
      continue;
    }

    if (dryRun) {
      console.log("  [dry run] Would process with Claude and insert into Supabase");
      results.push({ date, votes: 0, followUps: 0, resolved: 0, status: "dry run" });
      continue;
    }

    // Get open follow-ups and threads for context
    const openFollowUps = await getOpenFollowUps();
    const activeThreads = await getActiveThreads();
    console.log(`  Passing ${openFollowUps.length} open follow-ups and ${activeThreads.length} threads for context`);

    // Build user message
    let userContent = `Parse the following meeting minutes and return structured JSON:\n\n${text}`;

    if (openFollowUps.length > 0) {
      const fuList = openFollowUps
        .map((f) => `- [${f.id}] (raised ${f.dateRaised} by ${f.owner}): ${f.description}`)
        .join("\n");
      userContent += `\n\n---\n\nOpen follow-up items from previous meetings:\n\n${fuList}`;
    }

    if (activeThreads.length > 0) {
      const threadsList = activeThreads
        .map((t) => `- [${t.id}]: ${t.title}`)
        .join("\n");
      userContent += `\n\n---\n\nActive topic threads:\n\n${threadsList}`;
    }

    // Call Claude
    console.log("🤖 Sending to Claude...");
    let meeting: Record<string, unknown>;
    try {
      const message = await anthropic.messages.create({
        model: "claude-sonnet-4-20250514",
        max_tokens: 16384,
        system: SYSTEM_PROMPT,
        messages: [
          { role: "user", content: userContent },
          { role: "assistant", content: "{" },
        ],
      });

      const textBlock = message.content.find((b) => b.type === "text");
      if (!textBlock || textBlock.type !== "text") {
        throw new Error("No text response from Claude");
      }

      let jsonText = ("{" + textBlock.text).trim();
      const fenceMatch = jsonText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
      if (fenceMatch) jsonText = fenceMatch[1];

      meeting = JSON.parse(jsonText);
    } catch (err) {
      console.error("❌ Claude processing failed:", err instanceof Error ? err.message : err);
      results.push({ date, votes: 0, followUps: 0, resolved: 0, status: "error: Claude" });
      continue;
    }

    const votes = (meeting.keyVotes as unknown[])?.length || 0;
    const followUps = (meeting.followUps as unknown[])?.length || 0;
    const resolved = (meeting.resolvedFollowUps as unknown[])?.length || 0;
    const staff = (meeting.staffActivity as unknown[])?.length || 0;

    console.log(`  ✅ Extracted: ${votes} votes, ${followUps} follow-ups, ${resolved} resolutions, ${staff} staff`);

    // Insert meeting into Supabase
    console.log("💾 Saving to Supabase...");
    const { error: meetingError } = await supabase
      .from("meetings")
      .upsert(meetingToRow(meeting));

    if (meetingError) {
      console.error("❌ Failed to save meeting:", meetingError.message);
      results.push({ date, votes, followUps, resolved, status: "error: Supabase meeting" });
      continue;
    }

    // Insert follow-ups
    const fuArray = (meeting.followUps as Array<Record<string, unknown>>) || [];
    for (const fu of fuArray) {
      const { error: fuError } = await supabase
        .from("follow_ups")
        .upsert({
          id: fu.id,
          date_raised: fu.dateRaised,
          owner: fu.owner || "staff",
          description: fu.description,
          status: fu.status || "open",
          type: fu.type || "action_item",
          categories: fu.categories || [],
          related_meeting_id: fu.relatedMeetingId || date,
        });
      if (fuError) {
        console.error(`  ⚠️  Follow-up ${fu.id}: ${fuError.message}`);
      }
    }

    // Process resolved follow-ups
    const resolvedArray = (meeting.resolvedFollowUps as Array<Record<string, unknown>>) || [];
    for (const r of resolvedArray) {
      const { error: rError } = await supabase
        .from("follow_ups")
        .update({
          status: r.status,
          resolution: r.resolution,
          resolved_meeting_id: date,
          resolved_date: date,
        })
        .eq("id", r.id);
      if (rError) {
        console.error(`  ⚠️  Resolve ${r.id}: ${rError.message}`);
      } else {
        console.log(`  📌 Resolved: ${r.id} → ${r.status}`);
      }
    }

    // Upsert topic threads
    const newThreads = (meeting.newThreads as Array<Record<string, unknown>>) || [];
    for (const t of newThreads) {
      const { error: tError } = await supabase
        .from("topic_threads")
        .upsert({
          id: t.id,
          title: t.title,
          categories: t.categories || [],
          first_mentioned_date: date,
          first_mentioned_meeting_id: date,
          status: "active",
          mentions: [{ meetingId: date, date, summary: t.summary }],
        });
      if (tError) console.error(`  ⚠️  Thread ${t.id}: ${tError.message}`);
    }

    const threadUpdates = (meeting.threadUpdates as Array<Record<string, unknown>>) || [];
    for (const t of threadUpdates) {
      // Fetch existing thread, append mention
      const { data: existing } = await supabase
        .from("topic_threads")
        .select("mentions")
        .eq("id", t.id)
        .single();

      if (existing) {
        const mentions = (existing.mentions as Array<Record<string, unknown>>) || [];
        const alreadyHas = mentions.some((m) => m.meetingId === date);
        if (!alreadyHas) {
          mentions.push({ meetingId: date, date, summary: t.summary });
          await supabase
            .from("topic_threads")
            .update({ mentions })
            .eq("id", t.id);
        }
      }
    }

    results.push({ date, votes, followUps, resolved, status: "✅ success" });
    console.log(`  ✅ Done!`);

    // Brief pause between meetings
    if (i < files.length - 1) {
      console.log("  ⏳ Waiting 2s before next...");
      await new Promise((r) => setTimeout(r, 2000));
    }
  }

  // Summary
  console.log("\n\n" + "=".repeat(60));
  console.log("BATCH PROCESSING SUMMARY");
  console.log("=".repeat(60));

  const successful = results.filter((r) => r.status.includes("success"));
  const skipped = results.filter((r) => r.status.includes("skipped"));
  const errors = results.filter((r) => r.status.includes("error"));

  console.log(`\n  Total PDFs:      ${results.length}`);
  console.log(`  Processed:       ${successful.length}`);
  console.log(`  Skipped:         ${skipped.length}`);
  console.log(`  Errors:          ${errors.length}`);
  console.log(`  Total votes:     ${successful.reduce((s, r) => s + r.votes, 0)}`);
  console.log(`  Total follow-ups: ${successful.reduce((s, r) => s + r.followUps, 0)}`);
  console.log(`  Total resolved:  ${successful.reduce((s, r) => s + r.resolved, 0)}`);

  console.log("\nPer-meeting breakdown:");
  for (const r of results) {
    console.log(`  ${r.date}  ${r.status}${r.votes ? ` (${r.votes}v, ${r.followUps}fu, ${r.resolved}res)` : ""}`);
  }

  // Save results log
  const logPath = resolve(__dirname, "../backfill-results.json");
  writeFileSync(logPath, JSON.stringify(results, null, 2));
  console.log(`\n📄 Results saved to: ${logPath}`);

  if (successful.length > 0 && !dryRun) {
    console.log("\n🔄 Next steps:");
    console.log("  1. Run reconciliation: npx tsx scripts/reconcile-followups.ts");
    console.log("  2. Run classification: npx tsx scripts/classify-followups.ts");
    console.log("  3. Check homepage meeting count");
    console.log("  4. Spot-check a few meetings in the UI");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
