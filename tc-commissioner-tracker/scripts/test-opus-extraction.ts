/**
 * Run Claude Opus 4.7 against a single meeting PDF WITHOUT writing to Supabase.
 * Writes the extracted JSON + the current DB row (if any) to /tmp/opus-test/
 * so you can diff them and decide whether Opus extraction is worth the swap.
 *
 * Usage:
 *   npx tsx scripts/test-opus-extraction.ts --file 2025-03-24
 *   npx tsx scripts/test-opus-extraction.ts --file "2025-03-10 reg mtg.pdf"
 */

import { config } from "dotenv";
import { resolve } from "path";
import { readdirSync, writeFileSync, mkdirSync } from "fs";
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

const fileArg = process.argv.find((a) => a.startsWith("--file="))?.split("=")[1] ||
  (process.argv.includes("--file") ? process.argv[process.argv.indexOf("--file") + 1] : null);

if (!fileArg) {
  console.error("Required: --file <date-or-filename>   e.g. --file 2025-03-24");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const anthropic = new Anthropic({ apiKey: anthropicKey });

const PDF_DIR = resolve(__dirname, "../data/minutes-backfill");
const OUT_DIR = "/tmp/opus-test";

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
   - discussion: summary of what commissioners said or asked about this item before voting

3. For each commissioner present: every topic/question/position with category tags, motions made, motions seconded, external roles.

4. All public comments: speaker full name + summary.

5. Staff activity: every county staff member who presented/reported/recommended. Include role and items.

6. New follow-up items with id, dateRaised, owner, description, status: "open", type, categories, relatedMeetingId.

7. Resolved follow-ups if open items are provided in context.

8. Topic threads: newThreads and threadUpdates.

Use the meeting date as the id field.

REQUIRED JSON SHAPE — use these EXACT field names. Do NOT invent new keys or rename anything:

{
  "id": "YYYY-MM-DD",
  "date": "YYYY-MM-DD",
  "type": "regular" | "special" | "workshop",
  "time": "...",
  "attendees": ["mccall", "chapman", ...],
  "audienceSize": <number>,
  "duration": "...",
  "tldr": "...",
  "keyVotes": [
    { "description": "...", "result": "...", "mover": "...", "seconder": "...", "background": "...", "discussion": "..." }
  ],
  "commissionerActivity": {
    "mccall": { "topics": [{"text": "...", "categories": ["..."]}], "motionsMade": <n>, "motionsSeconded": <n>, "externalRoles": ["..."] },
    "chapman": { ... },
    "chappell": { ... },
    "dalton": { ... },
    "mckelvey": { ... }
  },
  "publicComments": [{ "speaker": "...", "summary": "..." }],
  "staffActivity": [{ "name": "...", "role": "...", "items": ["..."] }],
  "followUps": [
    { "id": "YYYY-MM-DD-fu-N", "dateRaised": "YYYY-MM-DD", "owner": "...", "description": "...", "status": "open", "type": "action_item", "categories": ["..."], "relatedMeetingId": "YYYY-MM-DD" }
  ],
  "resolvedFollowUps": [{ "id": "...", "status": "resolved" | "in_progress", "resolution": "..." }],
  "newThreads": [{ "id": "...", "title": "...", "categories": ["..."] }],
  "threadUpdates": [{ "id": "...", "summary": "..." }]
}

Include EVERY vote in keyVotes — agenda approval, consent agenda, minutes approval, all substantive motions. Do not omit routine votes. Use "consent agenda" as mover/seconder for consent items.

Return ONLY raw JSON starting with { and ending with }. No markdown fences. No preamble.`;

function extractTextFromPdf(pdfPath: string): string {
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

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  // Find matching PDF
  const files = readdirSync(PDF_DIR).filter((f) => f.endsWith(".pdf"));
  const match = files.find((f) => f.includes(fileArg!));
  if (!match) {
    console.error(`No PDF matching "${fileArg}" in ${PDF_DIR}`);
    console.error(`Available: ${files.map((f) => f.slice(0, 10)).join(", ")}`);
    process.exit(1);
  }

  const dateMatch = match.match(/(\d{4}-\d{2}-\d{2})/);
  const date = dateMatch ? dateMatch[1] : null;
  console.log(`📄 Testing Opus 4.7 on: ${match}`);
  console.log(`   Date: ${date}\n`);

  // Extract PDF text
  console.log("Extracting PDF text...");
  const text = extractTextFromPdf(resolve(PDF_DIR, match));
  console.log(`  ${text.length.toLocaleString()} chars\n`);

  // Fetch existing DB row for comparison
  let existingRow: Record<string, unknown> | null = null;
  if (date) {
    const { data } = await supabase.from("meetings").select("*").eq("id", date).single();
    existingRow = data;
  }

  // Run Opus 4.7
  console.log("🤖 Sending to Opus 4.7...");
  const t0 = Date.now();
  const message = await anthropic.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 16384,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: `Parse the following meeting minutes and return structured JSON. Output raw JSON only, no markdown fences, no preamble — start with { and end with }.\n\n${text}` },
    ],
  });
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.error("No text response");
    process.exit(1);
  }

  let jsonText = textBlock.text.trim();
  const fenceMatch = jsonText.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/);
  if (fenceMatch) jsonText = fenceMatch[1].trim();
  // Fallback: slice from first { to last }
  if (!jsonText.startsWith("{")) {
    const start = jsonText.indexOf("{");
    const end = jsonText.lastIndexOf("}");
    if (start >= 0 && end > start) jsonText = jsonText.slice(start, end + 1);
  }

  let opusOut: Record<string, unknown>;
  try {
    opusOut = JSON.parse(jsonText);
  } catch (err) {
    console.error("❌ Failed to parse Opus JSON:", err);
    writeFileSync(`${OUT_DIR}/${date}-opus-RAW.txt`, jsonText);
    console.error(`  Raw saved to ${OUT_DIR}/${date}-opus-RAW.txt`);
    process.exit(1);
  }

  // Token usage
  const usage = message.usage;
  console.log(`  ${elapsed}s | in: ${usage.input_tokens} tokens | out: ${usage.output_tokens} tokens\n`);

  // Write both files
  const opusPath = `${OUT_DIR}/${date}-opus.json`;
  writeFileSync(opusPath, JSON.stringify(opusOut, null, 2));
  console.log(`✅ Opus output: ${opusPath}`);

  if (existingRow) {
    const dbPath = `${OUT_DIR}/${date}-db.json`;
    writeFileSync(dbPath, JSON.stringify(existingRow, null, 2));
    console.log(`✅ Current DB:  ${dbPath}`);
  } else {
    console.log(`ℹ️  No existing DB row for ${date} — nothing to compare against`);
  }

  // Quick counts summary
  const votes = (opusOut.keyVotes as unknown[])?.length || 0;
  const fus = (opusOut.followUps as unknown[])?.length || 0;
  const staff = (opusOut.staffActivity as unknown[])?.length || 0;
  const comments = (opusOut.publicComments as unknown[])?.length || 0;
  console.log(`\nOpus extracted: ${votes} votes | ${fus} follow-ups | ${staff} staff | ${comments} public comments`);

  if (existingRow) {
    const dbVotes = (existingRow.key_votes as unknown[])?.length || 0;
    const dbFus = (existingRow.follow_ups as unknown[])?.length || 0;
    const dbStaff = (existingRow.staff_activity as unknown[])?.length || 0;
    const dbComments = (existingRow.public_comments as unknown[])?.length || 0;
    console.log(`DB has:         ${dbVotes} votes | ${dbFus} follow-ups | ${dbStaff} staff | ${dbComments} public comments`);
  }

  console.log(`\nDiff: diff ${OUT_DIR}/${date}-db.json ${OUT_DIR}/${date}-opus.json | less`);
  console.log("(Nothing was written to Supabase. Safe to re-run.)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
