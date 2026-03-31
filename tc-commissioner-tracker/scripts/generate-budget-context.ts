/**
 * Generate "Why this matters" context for budget changes using Claude.
 *
 * Picks the top 3 changes per department by absolute dollar change,
 * so every department gets a "Why This Matters" section.
 *
 * Usage:
 *   npx tsx scripts/generate-budget-context.ts
 */

import { config } from "dotenv";
import { resolve } from "path";
import { readFileSync, writeFileSync } from "fs";
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";

config({ path: resolve(__dirname, "../.env.local") });

const anthropicKey = process.env.ANTHROPIC_API_KEY;
if (!anthropicKey) {
  console.error("Missing ANTHROPIC_API_KEY in .env.local");
  process.exit(1);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

interface BudgetItem {
  department: string;
  accountCode: string;
  accountName: string;
  fy25Budget: number;
  fy26Projection: number;
  percentChange: number;
}

interface MeetingRow {
  id: string;
  date: string;
  tldr: string;
  key_votes: Array<{ description: string; result: string; background?: string }>;
  commissioner_activity: Record<string, { topics: Array<{ text: string; categories: string[] }> }>;
}

const SYSTEM_PROMPT = `You are a local government budget analyst writing plain-English explanations of budget changes for a civic transparency website. Your audience is regular residents, not finance professionals.

For each budget line item change, write ONE sentence (max 25 words) explaining why this change matters to residents. Be specific and factual. If meeting context suggests the reason, reference it. If not, explain what the budget category funds.

Rules:
- Use plain language a high schooler would understand
- Focus on impact: what does this fund? why did it change?
- Be neutral and factual — no editorializing
- Reference specific programs, positions, or projects when possible
- If the account name is cryptic (PCARDUNAL, OPSUPPLIES), translate it
- For zero-change items with large budgets, explain what the money funds

Return a JSON array with objects: { "index": 1, "context": "your sentence" }
Return ONLY the JSON array. No markdown fences.`;

async function main() {
  const budgetPath = resolve(__dirname, "../src/data/budget-fy26.json");
  const budget = JSON.parse(readFileSync(budgetPath, "utf-8"));

  // Pick top 3 changes per department by absolute dollar change
  const topChanges: (BudgetItem & { dollarChange: number })[] = [];

  for (const dept of budget.departments) {
    const items = dept.lineItems
      .map((item: BudgetItem) => ({
        ...item,
        department: dept.department,
        dollarChange: item.fy26Projection - item.fy25Budget,
      }))
      .filter((i: BudgetItem & { dollarChange: number }) => Math.abs(i.dollarChange) > 100 || i.fy26Projection > 50000)
      .sort((a: { dollarChange: number }, b: { dollarChange: number }) => Math.abs(b.dollarChange) - Math.abs(a.dollarChange))
      .slice(0, 3);

    topChanges.push(...items);
  }

  console.log(`Selected ${topChanges.length} items across ${budget.departments.length} departments\n`);

  // Fetch meeting data for context
  let meetingContext = "";
  if (supabaseUrl && supabaseKey) {
    const supabase = createClient(supabaseUrl, supabaseKey);
    const { data: meetings } = await supabase
      .from("meetings")
      .select("id, date, tldr, key_votes, commissioner_activity")
      .order("date", { ascending: false })
      .limit(20);

    if (meetings && meetings.length > 0) {
      meetingContext = "\n\nRECENT MEETING CONTEXT (use this to explain WHY budget items changed):\n\n";
      for (const m of meetings as MeetingRow[]) {
        meetingContext += `Meeting ${m.date}:\n`;
        meetingContext += `  Summary: ${m.tldr}\n`;
        if (m.key_votes) {
          for (const v of m.key_votes.slice(0, 5)) {
            meetingContext += `  Vote: [${v.result}] ${v.description}`;
            if (v.background) meetingContext += ` — ${v.background}`;
            meetingContext += "\n";
          }
        }
        if (m.commissioner_activity) {
          for (const [, activity] of Object.entries(m.commissioner_activity)) {
            for (const topic of (activity.topics || []).slice(0, 3)) {
              meetingContext += `  Topic: ${topic.text}\n`;
            }
          }
        }
        meetingContext += "\n";
      }
    }
  } else {
    console.log("No Supabase configured — generating context without meeting data.\n");
  }

  const anthropic = new Anthropic({ apiKey: anthropicKey });
  const allContexts: Array<{ accountCode: string; department: string; accountName: string; dollarChange: number; percentChange: number; context: string }> = [];

  // Process in batches of 30 to stay within token limits
  const BATCH_SIZE = 30;
  for (let batchStart = 0; batchStart < topChanges.length; batchStart += BATCH_SIZE) {
    const batch = topChanges.slice(batchStart, batchStart + BATCH_SIZE);
    const batchNum = Math.floor(batchStart / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(topChanges.length / BATCH_SIZE);

    console.log(`Processing batch ${batchNum}/${totalBatches} (${batch.length} items)...`);

    const changesBlock = batch
      .map((item, i) => {
        const sign = item.dollarChange >= 0 ? "+" : "";
        return `${i + 1}. Department: ${item.department}
   Account: ${item.accountName} (${item.accountCode})
   FY25 Budget: $${item.fy25Budget.toLocaleString()}
   FY26 Projection: $${item.fy26Projection.toLocaleString()}
   Change: ${sign}$${item.dollarChange.toLocaleString()} (${item.percentChange}%)`;
      })
      .join("\n\n");

    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Generate plain-English context for these budget changes:\n\n${changesBlock}${batchStart === 0 ? meetingContext : ""}`,
        },
        {
          role: "assistant",
          content: "[",
        },
      ],
    });

    const textBlock = message.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.error(`  Batch ${batchNum}: No text response`);
      continue;
    }

    let jsonText = "[" + textBlock.text;
    if (jsonText.includes("```")) {
      jsonText = jsonText.replace(/```json\s*/g, "").replace(/```\s*/g, "");
    }

    let contexts: Array<{ index: number; context: string }>;
    try {
      contexts = JSON.parse(jsonText);
    } catch {
      console.error(`  Batch ${batchNum}: Failed to parse JSON, first 300 chars:`, jsonText.slice(0, 300));
      continue;
    }

    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const match = contexts.find((c) => c.index === i + 1);
      allContexts.push({
        accountCode: item.accountCode,
        department: item.department,
        accountName: item.accountName,
        dollarChange: item.dollarChange,
        percentChange: item.percentChange,
        context: match?.context || "",
      });
    }

    console.log(`  Got ${contexts.length} contexts`);

    // Brief pause between batches to avoid rate limits
    if (batchStart + BATCH_SIZE < topChanges.length) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  // Print summary by department
  const deptMap = new Map<string, number>();
  for (const c of allContexts) {
    deptMap.set(c.department, (deptMap.get(c.department) || 0) + 1);
  }

  console.log(`\n${allContexts.length} total contexts across ${deptMap.size} departments:\n`);
  for (const [dept, count] of [...deptMap.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${dept}: ${count} items`);
  }

  // Sample output
  console.log("\nSample contexts:\n");
  for (const item of allContexts.slice(0, 5)) {
    const sign = item.dollarChange >= 0 ? "+" : "";
    console.log(`  ${item.department} / ${item.accountName} (${sign}$${item.dollarChange.toLocaleString()}):`);
    console.log(`    → ${item.context}\n`);
  }

  // Write back to budget JSON
  budget.notableChangesContext = allContexts;
  writeFileSync(budgetPath, JSON.stringify(budget, null, 2));

  console.log(`Written ${allContexts.length} context entries to ${budgetPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
