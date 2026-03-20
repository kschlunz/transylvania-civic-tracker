/**
 * One-time script: analyze all meetings and generate topic threads.
 *
 * Usage: npx tsx scripts/build-threads.ts
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

interface MeetingSummary {
  id: string;
  date: string;
  tldr: string;
  votes: string[];
  topics: string[];
}

async function main() {
  console.log("Fetching meetings from Supabase...");

  const { data: meetings, error } = await supabase
    .from("meetings")
    .select("*")
    .order("date", { ascending: true });

  if (error) {
    console.error("Failed to fetch meetings:", error.message);
    process.exit(1);
  }

  if (!meetings || meetings.length === 0) {
    console.log("No meetings found. Run scripts/seed.ts first.");
    process.exit(0);
  }

  console.log(`Found ${meetings.length} meeting(s). Building summaries...`);

  // Build compact summaries for the AI
  const summaries: MeetingSummary[] = meetings.map((m) => {
    const votes = ((m.key_votes as Array<{ description: string }>) || [])
      .map((v) => v.description);

    const topics: string[] = [];
    const activity = (m.commissioner_activity as Record<string, { topics: Array<{ text: string; categories: string[] }> }>) || {};
    for (const [, act] of Object.entries(activity)) {
      for (const t of act.topics || []) {
        topics.push(t.text);
      }
    }

    return {
      id: m.id as string,
      date: (m.date as string).slice(0, 10),
      tldr: m.tldr as string,
      votes,
      topics,
    };
  });

  // Build the prompt
  const meetingDescriptions = summaries.map((s) => {
    let desc = `## Meeting: ${s.date} (ID: ${s.id})\n`;
    desc += `TLDR: ${s.tldr}\n`;
    if (s.votes.length > 0) {
      desc += `Votes: ${s.votes.join("; ")}\n`;
    }
    if (s.topics.length > 0) {
      desc += `Topics discussed: ${s.topics.join("; ")}\n`;
    }
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
- firstMentionedDate: YYYY-MM-DD of the earliest meeting where this appears
- firstMentionedMeetingId: the meeting ID where it first appears
- status: "active" if likely ongoing, "resolved" if completed, "recurring" if it comes up regularly
- mentions: array of objects with meetingId, date, and summary (1-2 sentences of what happened with this item at that meeting)

Return ONLY raw JSON. No markdown fences. No preamble. Start with [ and end with ]`;

  console.log("Sending to Claude for analysis...");
  console.log(`Prompt length: ${prompt.length} chars`);

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
    console.error("No text response from Claude");
    process.exit(1);
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
  } catch (e) {
    console.error("Failed to parse Claude response as JSON:");
    console.error(jsonText.slice(0, 500));
    process.exit(1);
  }

  console.log(`\nClaude identified ${threads.length} topic threads:\n`);

  for (const thread of threads) {
    console.log(`  ${thread.title} (${thread.status}) — ${thread.mentions.length} meeting(s)`);
  }

  // Upsert into Supabase
  console.log("\nInserting into Supabase...");

  let success = 0;
  for (const thread of threads) {
    const { error: upsertError } = await supabase
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

    if (upsertError) {
      console.error(`  Error upserting "${thread.title}":`, upsertError.message);
    } else {
      success++;
    }
  }

  console.log(`\nDone! ${success}/${threads.length} threads saved to Supabase.`);
}

main().catch(console.error);
