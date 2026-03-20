/**
 * Resync script: clears and rebuilds all follow-ups and topic threads from meeting data.
 * Safe to re-run at any time — clears tables first, then rebuilds from scratch.
 *
 * Usage: npx tsx scripts/resync-all.ts
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SECRET_KEY, and ANTHROPIC_API_KEY in .env.local
 */

import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import * as path from "path";
import * as dotenv from "dotenv";

dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SECRET_KEY;
const anthropicKey = process.env.ANTHROPIC_API_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY in .env.local");
  process.exit(1);
}
if (!anthropicKey) {
  console.error("Missing ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);
const anthropic = new Anthropic({ apiKey: anthropicKey });

// ============================================
// TYPES
// ============================================

interface FollowUp {
  id: string;
  dateRaised: string;
  owner: string;
  description: string;
  status: string;
  categories: string[];
  relatedMeetingId: string;
}

interface MeetingRow {
  id: string;
  date: string;
  type: string;
  tldr: string;
  key_votes: Array<{ description: string; result: string; mover: string; seconder: string }>;
  commissioner_activity: Record<string, { topics: Array<{ text: string; categories: string[] }> }>;
  follow_ups: FollowUp[];
}

// ============================================
// STEP 1: FETCH ALL MEETINGS
// ============================================

async function fetchMeetings(): Promise<MeetingRow[]> {
  console.log("Fetching all meetings from Supabase...");
  const { data, error } = await supabase
    .from("meetings")
    .select("id, date, type, tldr, key_votes, commissioner_activity, follow_ups")
    .order("date", { ascending: true });

  if (error) {
    console.error("Failed to fetch meetings:", error.message);
    process.exit(1);
  }

  console.log(`  Found ${data.length} meeting(s)\n`);
  return data as MeetingRow[];
}

// ============================================
// STEP 2: CLEAR DERIVED TABLES
// ============================================

async function clearTables() {
  console.log("Clearing follow_ups and topic_threads tables...");

  const { error: fuError } = await supabase
    .from("follow_ups")
    .delete()
    .neq("id", "___never_match___"); // delete all rows

  if (fuError) {
    console.error("  Failed to clear follow_ups:", fuError.message);
  } else {
    console.log("  Cleared follow_ups");
  }

  const { error: ttError } = await supabase
    .from("topic_threads")
    .delete()
    .neq("id", "___never_match___");

  if (ttError) {
    console.error("  Failed to clear topic_threads:", ttError.message);
  } else {
    console.log("  Cleared topic_threads");
  }

  console.log("");
}

// ============================================
// STEP 3: REBUILD FOLLOW-UPS
// ============================================

async function rebuildFollowUps(meetings: MeetingRow[]) {
  console.log("=== REBUILDING FOLLOW-UPS ===\n");

  let created = 0;
  let resolved = 0;
  const openFollowUps: Map<string, FollowUp> = new Map();

  for (const meeting of meetings) {
    const meetingFollowUps = meeting.follow_ups || [];
    if (meetingFollowUps.length === 0) {
      console.log(`  ${meeting.date}: no follow-ups`);
      continue;
    }

    console.log(`  ${meeting.date}: ${meetingFollowUps.length} follow-up(s)`);

    for (const fu of meetingFollowUps) {
      // Normalize owner field
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const owner = fu.owner || (fu as any).raisedBy || "staff";
      const fuId = fu.id;
      const status = fu.status || "open";

      // Check if this follow-up resolves an existing one
      // Match by exact ID first, then by description similarity
      let matchedExisting = false;

      if (status === "resolved" || status === "in_progress") {
        // This follow-up might be a resolution of a prior one
        for (const [existingId, existing] of openFollowUps) {
          if (existing.description === fu.description || existingId === fuId) {
            // Update the existing follow-up status
            const { error } = await supabase
              .from("follow_ups")
              .update({
                status: status,
                resolved_date: meeting.date,
                resolved_meeting_id: meeting.id,
                last_referenced_date: meeting.date,
                last_referenced_meeting_id: meeting.id,
              })
              .eq("id", existingId);

            if (!error) {
              resolved++;
              openFollowUps.delete(existingId);
              console.log(`    Resolved: "${existing.description.slice(0, 60)}..."`);
            }
            matchedExisting = true;
            break;
          }
        }
      }

      if (!matchedExisting) {
        // Insert as new follow-up
        const { error } = await supabase
          .from("follow_ups")
          .upsert({
            id: fuId,
            date_raised: fu.dateRaised || meeting.date,
            owner: owner,
            description: fu.description,
            status: status,
            categories: fu.categories || [],
            related_meeting_id: fu.relatedMeetingId || meeting.id,
          });

        if (error) {
          console.error(`    Error inserting follow-up "${fuId}":`, error.message);
        } else {
          created++;
          if (status === "open" || status === "in_progress") {
            openFollowUps.set(fuId, { ...fu, owner });
          }
          console.log(`    Created: "${fu.description.slice(0, 60)}..." [${status}]`);
        }
      }
    }
  }

  console.log(`\n  Follow-ups: ${created} created, ${resolved} resolved`);
  console.log(`  ${openFollowUps.size} still open\n`);
}

// ============================================
// STEP 4: REBUILD THREADS VIA AI
// ============================================

async function rebuildThreads(meetings: MeetingRow[]) {
  console.log("=== REBUILDING TOPIC THREADS ===\n");

  if (meetings.length === 0) {
    console.log("  No meetings to analyze.\n");
    return;
  }

  // Build compact summaries
  const meetingDescriptions = meetings.map((m) => {
    const votes = (m.key_votes || []).map((v) => v.description);
    const topics: string[] = [];
    const activity = m.commissioner_activity || {};
    for (const [, act] of Object.entries(activity)) {
      for (const t of act.topics || []) {
        topics.push(t.text);
      }
    }

    let desc = `## ${m.date} (ID: ${m.id})\n`;
    desc += `TLDR: ${m.tldr}\n`;
    if (votes.length > 0) desc += `Votes: ${votes.join("; ")}\n`;
    if (topics.length > 0) desc += `Topics: ${topics.join("; ")}\n`;
    return desc;
  }).join("\n");

  const categoryList = [
    "fiscal", "schools", "safety", "infrastructure", "econ",
    "governance", "environment", "housing", "health", "recovery", "community",
  ].join(", ");

  const prompt = `Here are summaries of all Transylvania County Board of Commissioners meetings in chronological order:

${meetingDescriptions}

---

Identify recurring specific items that span multiple meetings — capital projects (courthouse, school facilities), ongoing studies (solid waste rate study), policy discussions (sales tax referendum, property tax reform), budget items, facility issues (Rosman old gym), etc.

Do NOT include:
- One-off routine items (consent agenda approvals, proclamations)
- General category-level topics (just "fiscal policy" — be specific like "Quarter-cent sales tax referendum")
- Items that only appear in a single meeting with no indication they'll recur

For each thread:
- id: slugified title, e.g. "solid-waste-rate-study"
- title: descriptive name, e.g. "Solid Waste Rate Study"
- categories: array of category IDs from: ${categoryList}
- firstMentionedDate: YYYY-MM-DD of the earliest meeting
- firstMentionedMeetingId: the meeting ID where it first appears
- status: "active" if likely ongoing, "resolved" if completed, "recurring" if it comes up regularly
- mentions: array of {meetingId, date, summary} — 1-2 sentence summary per meeting

Return ONLY raw JSON. No markdown fences. No preamble. Start with [ and end with ]`;

  console.log(`  Sending ${meetings.length} meeting(s) to Claude for thread analysis...`);
  console.log(`  Prompt length: ${prompt.length} chars\n`);

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 16384,
    messages: [
      { role: "user", content: prompt },
      { role: "assistant", content: "[" },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.error("  No text response from Claude");
    return;
  }

  let jsonText = ("[" + textBlock.text).trim();
  if (jsonText.startsWith("```")) {
    jsonText = jsonText.replace(/^```(?:json)?\s*\n?/, "").replace(/\n?```\s*$/, "");
  }

  let threads: Array<{
    id: string;
    title: string;
    categories: string[];
    firstMentionedDate: string;
    firstMentionedMeetingId: string;
    status: string;
    mentions: Array<{ meetingId: string; date: string; summary: string }>;
  }>;

  try {
    threads = JSON.parse(jsonText);
  } catch {
    console.error("  Failed to parse Claude response as JSON");
    console.error("  First 500 chars:", jsonText.slice(0, 500));
    return;
  }

  console.log(`  Claude identified ${threads.length} topic thread(s):\n`);

  let success = 0;
  for (const thread of threads) {
    console.log(`    ${thread.title} (${thread.status}) — ${thread.mentions.length} meeting(s)`);

    const { error } = await supabase
      .from("topic_threads")
      .upsert({
        id: thread.id,
        title: thread.title,
        categories: thread.categories,
        first_mentioned_date: thread.firstMentionedDate,
        first_mentioned_meeting_id: thread.firstMentionedMeetingId,
        status: thread.status,
        mentions: thread.mentions,
      });

    if (error) {
      console.error(`      Error: ${error.message}`);
    } else {
      success++;
    }
  }

  console.log(`\n  Threads: ${success}/${threads.length} saved to Supabase\n`);
}

// ============================================
// MAIN
// ============================================

async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║   CIVIC LEDGER — FULL DATA RESYNC    ║");
  console.log("╚══════════════════════════════════════╝\n");

  const meetings = await fetchMeetings();
  await clearTables();
  await rebuildFollowUps(meetings);
  await rebuildThreads(meetings);

  console.log("═══════════════════════════════════════");
  console.log("  Resync complete!");
  console.log("═══════════════════════════════════════\n");
}

main().catch(console.error);
