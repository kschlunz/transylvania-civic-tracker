/**
 * Classify follow-up items into types for tiered overdue thresholds.
 *
 * Usage:
 *   npx tsx scripts/classify-followups.ts          # preview only
 *   npx tsx scripts/classify-followups.ts --apply   # write to Supabase
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
  console.error("Missing env vars");
  process.exit(1);
}

const applyMode = process.argv.includes("--apply");
const supabase = createClient(supabaseUrl, supabaseKey);
const anthropic = new Anthropic({ apiKey: anthropicKey });

const SYSTEM_PROMPT = `You are classifying county government follow-up items into four types based on their description. Each item is a commitment made during a commissioner meeting.

Types:
- "action_item": A specific one-time task with an expected short deadline. Examples: "schedule public hearing," "send letter to state," "post job listing," "contact vendor," "present findings at next meeting," "advertise vacancy," "draft agreement," "prepare documentation"
- "report": Staff expected to research and report back, deliver an analysis, or present findings. Examples: "report back on EMS staffing," "present assessment findings," "provide cost analysis," "deliver engineering report," "present rate study results"
- "long_term": Multi-month project, feasibility study, planning process, or infrastructure project. Examples: "explore broadband options," "study feasibility of new facility," "develop housing plan," "begin watershed study," "assess long-term infrastructure needs," "implement capital workgroup recommendations"
- "ongoing": Recurring commitment with no end date — regular meetings, quarterly reports, continuous coordination. Examples: "continue monthly meetings with superintendent," "provide quarterly capital updates," "maintain regular coordination with municipalities," "coordinate ongoing recovery efforts"

Rules:
- Default to "action_item" if unclear
- "Present X at next meeting" is an action_item (specific deadline)
- "Provide monthly updates" is ongoing (recurring)
- "Complete study by [date]" is long_term (multi-month)
- "Report back on findings" is report

Return a JSON array: { "id": "follow-up-id", "type": "action_item|report|long_term|ongoing" }
Return ALL items, not just changed ones. No markdown fences.`;

async function main() {
  console.log(applyMode ? "🔴 APPLY MODE\n" : "👀 PREVIEW MODE\n");

  const { data: followUps, error } = await supabase
    .from("follow_ups")
    .select("id, description, owner, date_raised, status, type")
    .order("date_raised");

  if (error || !followUps) {
    console.error("Failed to fetch:", error?.message);
    process.exit(1);
  }

  console.log(`Classifying ${followUps.length} follow-ups...\n`);

  const BATCH_SIZE = 50;
  const allClassifications: { id: string; type: string }[] = [];

  for (let i = 0; i < followUps.length; i += BATCH_SIZE) {
    const batch = followUps.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(followUps.length / BATCH_SIZE);

    console.log(`Batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

    const itemsBlock = batch.map((fu, j) =>
      `${j + 1}. [ID: ${fu.id}] ${fu.description}`
    ).join("\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: `Classify these follow-up items:\n\n${itemsBlock}` },
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
      const classifications: { id: string; type: string }[] = JSON.parse(jsonText);
      allClassifications.push(...classifications);
      console.log(`  Got ${classifications.length} classifications`);
    } catch {
      console.error(`  Batch ${batchNum}: Parse failed. First 300 chars:`, jsonText.slice(0, 300));
    }

    if (i + BATCH_SIZE < followUps.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Build lookup
  const classMap = new Map(allClassifications.map((c) => [c.id, c.type]));

  // Count by type
  const counts: Record<string, number> = { action_item: 0, report: 0, long_term: 0, ongoing: 0 };
  for (const c of allClassifications) {
    counts[c.type] = (counts[c.type] || 0) + 1;
  }

  console.log("\n" + "=".repeat(60));
  console.log("CLASSIFICATION RESULTS");
  console.log("=".repeat(60));
  console.log(`\n  action_item:  ${counts.action_item}`);
  console.log(`  report:       ${counts.report}`);
  console.log(`  long_term:    ${counts.long_term}`);
  console.log(`  ongoing:      ${counts.ongoing}`);
  console.log(`  Total:        ${allClassifications.length}`);

  // Show samples of each type
  for (const type of ["report", "long_term", "ongoing"] as const) {
    const items = followUps.filter((f) => classMap.get(f.id) === type).slice(0, 5);
    if (items.length === 0) continue;
    console.log(`\nSample ${type}:`);
    for (const f of items) {
      console.log(`  [${f.id}] ${(f.description as string).slice(0, 90)}`);
    }
  }

  // Impact on overdue counts
  const thresholds: Record<string, number> = { action_item: 60, report: 90, long_term: 180, ongoing: Infinity };
  const now = Date.now();
  let oldOverdue = 0;
  let newOverdue = 0;

  for (const fu of followUps) {
    if (fu.status === "resolved" || fu.status === "dropped") continue;
    const days = Math.floor((now - new Date((fu.date_raised as string) + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24));
    if (days > 90) oldOverdue++;
    const newType = classMap.get(fu.id) || "action_item";
    if (days > (thresholds[newType] || 60)) newOverdue++;
  }

  console.log(`\nOverdue impact:`);
  console.log(`  Old (90d flat):     ${oldOverdue}`);
  console.log(`  New (tiered):       ${newOverdue}`);
  console.log(`  Reduction:          ${oldOverdue - newOverdue}`);

  // Save preview
  const previewPath = resolve(__dirname, "../classification-preview.json");
  writeFileSync(previewPath, JSON.stringify(allClassifications, null, 2));
  console.log(`\n📄 Saved to: ${previewPath}`);

  if (!applyMode) {
    console.log("\n" + "=".repeat(60));
    console.log("PREVIEW ONLY — run with --apply to write to Supabase:");
    console.log("  npx tsx scripts/classify-followups.ts --apply");
    console.log("=".repeat(60));
    return;
  }

  // Apply
  console.log("\n🔴 Writing to Supabase...\n");
  let success = 0;
  let errors = 0;

  for (const c of allClassifications) {
    const { error: updateError } = await supabase
      .from("follow_ups")
      .update({ type: c.type })
      .eq("id", c.id);

    if (updateError) {
      console.error(`  ❌ ${c.id}: ${updateError.message}`);
      errors++;
    } else {
      success++;
    }
  }

  console.log(`\nDone! ${success} updated, ${errors} errors.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
