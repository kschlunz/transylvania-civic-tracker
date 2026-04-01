/**
 * Follow-up reconciliation script.
 *
 * Sends all open follow-ups + meeting summaries to Claude and asks which
 * follow-ups have been resolved in later meetings. Outputs a preview by
 * default — pass --apply to write changes to Supabase.
 *
 * Usage:
 *   npx tsx scripts/reconcile-followups.ts          # preview only
 *   npx tsx scripts/reconcile-followups.ts --apply   # write to Supabase
 */

import { config } from "dotenv";
import { resolve } from "path";
import { writeFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(__dirname, "../.env.local") });

const anthropicKey = process.env.ANTHROPIC_API_KEY;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!anthropicKey || !supabaseUrl || !supabaseKey) {
  console.error("Missing ANTHROPIC_API_KEY, NEXT_PUBLIC_SUPABASE_URL, or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const applyMode = process.argv.includes("--apply");
const supabase = createClient(supabaseUrl, supabaseKey);
const anthropic = new Anthropic({ apiKey: anthropicKey });

interface FollowUp {
  id: string;
  date_raised: string;
  owner: string;
  description: string;
  status: string;
  related_meeting_id: string;
}

interface MeetingSummary {
  id: string;
  date: string;
  tldr: string;
  key_votes: Array<{ description: string; result: string }>;
}

interface Resolution {
  id: string;
  status: "resolved" | "dropped" | "in_progress" | "open";
  resolution: string;
  resolved_meeting_id?: string;
}

const SYSTEM_PROMPT = `You are analyzing follow-up items from county commissioner meetings to determine which ones have been resolved in later meetings.

You will receive:
1. A list of open follow-up items, each with an ID, date raised, owner, and description
2. Chronological summaries of all meetings

For each follow-up, determine its current status:
- "resolved" — the task was clearly completed or addressed in a later meeting
- "dropped" — the item was explicitly abandoned, superseded, or is no longer relevant
- "in_progress" — there is evidence of ongoing work but it's not complete
- "open" — no evidence of progress or resolution (keep as-is)

IMPORTANT RULES:
- Only mark "resolved" if you have clear evidence from a meeting summary
- Time alone does not resolve a follow-up — a 2-year-old item is still "open" unless addressed
- If a follow-up says "present X at next meeting" and that meeting happened, check if the topic actually appears
- For items assigned to staff/manager, check if the topic was discussed in later meetings
- Be conservative — when in doubt, leave as "open"
- Include the meeting ID where resolution occurred when possible

Return a JSON array of objects for items that should CHANGE status (don't include items staying "open"):
{ "id": "follow-up-id", "status": "resolved|dropped|in_progress", "resolution": "one sentence explaining what happened", "resolved_meeting_id": "YYYY-MM-DD or null" }

Return ONLY the JSON array. No markdown fences.`;

async function main() {
  console.log(applyMode ? "🔴 APPLY MODE — will write to Supabase\n" : "👀 PREVIEW MODE — no changes will be made\n");

  // Fetch open follow-ups
  const { data: followUps, error: fuError } = await supabase
    .from("follow_ups")
    .select("id, date_raised, owner, description, status, related_meeting_id")
    .in("status", ["open", "in_progress"])
    .order("date_raised");

  if (fuError || !followUps) {
    console.error("Failed to fetch follow-ups:", fuError?.message);
    process.exit(1);
  }

  console.log(`Found ${followUps.length} open/in-progress follow-ups\n`);

  // Fetch all meetings
  const { data: meetings, error: mError } = await supabase
    .from("meetings")
    .select("id, date, tldr, key_votes")
    .order("date");

  if (mError || !meetings) {
    console.error("Failed to fetch meetings:", mError?.message);
    process.exit(1);
  }

  console.log(`Found ${meetings.length} meetings for context\n`);

  // Build the prompt
  const followUpsBlock = (followUps as FollowUp[]).map((fu, i) => (
    `${i + 1}. [ID: ${fu.id}] Raised: ${fu.date_raised} | Owner: ${fu.owner} | Meeting: ${fu.related_meeting_id}\n   ${fu.description}`
  )).join("\n\n");

  const meetingsBlock = (meetings as MeetingSummary[]).map((m) => {
    const votes = (m.key_votes || []).slice(0, 8).map((v) => `    [${v.result}] ${v.description}`).join("\n");
    return `Meeting ${m.date} (${m.id}):\n  Summary: ${m.tldr}${votes ? "\n  Votes:\n" + votes : ""}`;
  }).join("\n\n");

  const userPrompt = `Here are ${followUps.length} open follow-up items that need reconciliation:\n\n${followUpsBlock}\n\n---\n\nHere are all ${meetings.length} meetings in chronological order:\n\n${meetingsBlock}\n\nAnalyze which follow-ups have been resolved, dropped, or moved to in-progress based on the meeting evidence. Return ONLY items that should change status.`;

  // Check token estimate (rough: 4 chars per token)
  const estimatedTokens = Math.ceil((SYSTEM_PROMPT.length + userPrompt.length) / 4);
  console.log(`Estimated input: ~${estimatedTokens.toLocaleString()} tokens`);

  if (estimatedTokens > 180000) {
    // Split into batches if too large
    console.log("⚠️  Input is very large — splitting follow-ups into batches...\n");
    await processBatched(followUps as FollowUp[], meetings as MeetingSummary[], meetingsBlock);
  } else {
    console.log("Sending to Claude...\n");
    await processSingle(followUps as FollowUp[], userPrompt);
  }
}

async function processSingle(followUps: FollowUp[], userPrompt: string) {
  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    messages: [
      { role: "user", content: userPrompt },
      { role: "assistant", content: "[" },
    ],
  });

  const textBlock = message.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    console.error("No text response from Claude");
    process.exit(1);
  }

  let jsonText = "[" + textBlock.text;
  if (jsonText.includes("```")) {
    jsonText = jsonText.replace(/```json\s*/g, "").replace(/```\s*/g, "");
  }

  let resolutions: Resolution[];
  try {
    resolutions = JSON.parse(jsonText);
  } catch {
    console.error("Failed to parse response. First 500 chars:", jsonText.slice(0, 500));
    process.exit(1);
  }

  await handleResults(resolutions, followUps);
}

async function processBatched(followUps: FollowUp[], meetings: MeetingSummary[], meetingsBlock: string) {
  const BATCH_SIZE = 40;
  const allResolutions: Resolution[] = [];

  for (let i = 0; i < followUps.length; i += BATCH_SIZE) {
    const batch = followUps.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(followUps.length / BATCH_SIZE);

    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

    const followUpsBlock = batch.map((fu, j) => (
      `${j + 1}. [ID: ${fu.id}] Raised: ${fu.date_raised} | Owner: ${fu.owner} | Meeting: ${fu.related_meeting_id}\n   ${fu.description}`
    )).join("\n\n");

    const userPrompt = `Here are ${batch.length} open follow-up items (batch ${batchNum}/${totalBatches}):\n\n${followUpsBlock}\n\n---\n\nHere are all ${meetings.length} meetings in chronological order:\n\n${meetingsBlock}\n\nAnalyze which follow-ups have been resolved, dropped, or moved to in-progress based on the meeting evidence.`;

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: userPrompt },
        { role: "assistant", content: "[" },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error(`  Batch ${batchNum}: No response`);
      continue;
    }

    let jsonText = "[" + textBlock.text;
    if (jsonText.includes("```")) {
      jsonText = jsonText.replace(/```json\s*/g, "").replace(/```\s*/g, "");
    }

    try {
      const batchResolutions: Resolution[] = JSON.parse(jsonText);
      allResolutions.push(...batchResolutions);
      console.log(`  Found ${batchResolutions.length} status changes`);
    } catch {
      console.error(`  Batch ${batchNum}: Failed to parse. First 300 chars:`, jsonText.slice(0, 300));
    }

    if (i + BATCH_SIZE < followUps.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  await handleResults(allResolutions, followUps);
}

async function handleResults(resolutions: Resolution[], followUps: FollowUp[]) {
  // Build a lookup for easy reference
  const fuMap = new Map(followUps.map((f) => [f.id, f]));

  const resolved = resolutions.filter((r) => r.status === "resolved");
  const dropped = resolutions.filter((r) => r.status === "dropped");
  const inProgress = resolutions.filter((r) => r.status === "in_progress");
  const unchanged = followUps.length - resolutions.length;

  console.log("\n" + "=".repeat(70));
  console.log("RECONCILIATION RESULTS");
  console.log("=".repeat(70));
  console.log(`\n  Total open follow-ups:  ${followUps.length}`);
  console.log(`  → Resolved:             ${resolved.length}`);
  console.log(`  → Dropped:              ${dropped.length}`);
  console.log(`  → In Progress:          ${inProgress.length}`);
  console.log(`  → Unchanged (open):     ${unchanged}`);

  if (resolved.length > 0) {
    console.log("\n--- RESOLVED ---");
    for (const r of resolved) {
      const fu = fuMap.get(r.id);
      console.log(`\n  [${r.id}] ${fu?.date_raised || "?"} | ${fu?.owner || "?"}`);
      console.log(`  Description: ${fu?.description?.slice(0, 100) || "?"}`);
      console.log(`  Resolution:  ${r.resolution}`);
      if (r.resolved_meeting_id) console.log(`  Resolved in: ${r.resolved_meeting_id}`);
    }
  }

  if (dropped.length > 0) {
    console.log("\n--- DROPPED ---");
    for (const r of dropped) {
      const fu = fuMap.get(r.id);
      console.log(`\n  [${r.id}] ${fu?.date_raised || "?"} | ${fu?.owner || "?"}`);
      console.log(`  Description: ${fu?.description?.slice(0, 100) || "?"}`);
      console.log(`  Reason:      ${r.resolution}`);
    }
  }

  if (inProgress.length > 0) {
    console.log("\n--- IN PROGRESS ---");
    for (const r of inProgress) {
      const fu = fuMap.get(r.id);
      console.log(`\n  [${r.id}] ${fu?.date_raised || "?"} | ${fu?.owner || "?"}`);
      console.log(`  Description: ${fu?.description?.slice(0, 100) || "?"}`);
      console.log(`  Evidence:    ${r.resolution}`);
    }
  }

  // Save preview to file
  const previewPath = resolve(__dirname, "../reconciliation-preview.json");
  writeFileSync(previewPath, JSON.stringify(resolutions, null, 2));
  console.log(`\n📄 Full results saved to: ${previewPath}`);

  if (!applyMode) {
    console.log("\n" + "=".repeat(70));
    console.log("PREVIEW ONLY — no changes written to Supabase.");
    console.log("Review the results above, then run with --apply to commit:");
    console.log("  npx tsx scripts/reconcile-followups.ts --apply");
    console.log("=".repeat(70));
    return;
  }

  // Apply mode — write to Supabase
  console.log("\n🔴 Applying changes to Supabase...\n");
  let successCount = 0;
  let errorCount = 0;

  for (const r of resolutions) {
    const updateData: Record<string, unknown> = {
      status: r.status,
      resolution: r.resolution,
    };
    if (r.resolved_meeting_id) {
      updateData.resolved_meeting_id = r.resolved_meeting_id;
      updateData.resolved_date = r.resolved_meeting_id; // Use meeting date as resolved date
    }

    const { error } = await supabase
      .from("follow_ups")
      .update(updateData)
      .eq("id", r.id);

    if (error) {
      console.error(`  ❌ Failed to update ${r.id}: ${error.message}`);
      errorCount++;
    } else {
      console.log(`  ✅ ${r.id} → ${r.status}`);
      successCount++;
    }
  }

  console.log(`\nDone! ${successCount} updated, ${errorCount} errors.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
